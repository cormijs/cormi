import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { isBuiltin, register } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@cordisjs/plugin-loader'
import type { Context } from 'cordis'
import type { Awaitable, Dict } from 'cosmokit'
import { CommandError } from './cli.ts'
import { winPath } from './utils/index.ts'
import { getPackageName, resolveExport, resolveWorkspace } from './workspace-exports.ts'

declare module 'cordis' {
  interface Events {
    /**
     * The Node code of the app is compiled (`cormi build`): add the source
     * files that run when the app starts, and data for them.
     * @mode parallel
     */
    'build/node'(build: NodeBuild.Input): Awaitable<void>
  }
}

/** Where `cormi build` writes the Node code of the app, below the app root. */
export const NODE_DIR = 'dist/node'

/**
 * The Node code of a built app (`dist/node/manifest.json`), which
 * `cormi start` runs: what the app runs besides its dependencies.
 */
export interface NodeBuild {
  /** compiled modules (relative to `dist/node`) by their sources (relative to the app root) */
  files: Dict<string>
  /** compiled modules (relative to `dist/node`) by the names of the workspace packages of the plugin tree */
  packages: Dict<string>
  /** data of plugins, e.g. the routes of `server/api` */
  data: Dict<any>
}

export namespace NodeBuild {
  export interface Input {
    /** absolute paths of source files to compile */
    entries: Set<string>
    data: Dict<any>
  }
}

const SCRIPT_RE = /\.[cm]?[jt]sx?$/

/** Whether a bare specifier is a package of a `node_modules` directory above `dir`, rather than an alias. */
function isInstalled(specifier: string, dir: string) {
  const name = getPackageName(specifier)
  if (!name) return false
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, 'node_modules', name))) return true
    if (dirname(current) === current) return false
  }
}

/** `server/api/[id].ts` -> `server/api/[id]` */
function toEntryName(cwd: string, file: string) {
  return winPath(relative(cwd, file)).replace(SCRIPT_RE, '')
}

/**
 * Compile the Node code of the app into `dist/node`: its own plugins of the
 * plugin tree (`./plugin.ts`, the workspace packages it names) and the files
 * that plugins add (`build/node`, e.g. `server/`). Each is a module of its
 * own; the code they share is in common chunks, and the dependencies of
 * `node_modules` are imported as they are.
 */
export async function compileNode(ctx: Context) {
  const { cwd } = ctx.cormi
  const outDir = join(cwd, NODE_DIR)
  const workspace = ctx.get('workspace')?.packages ?? {}
  const input: NodeBuild.Input = { entries: new Set(), data: {} }
  const packages: Dict<string> = {}

  // the plugins of the tree that are the app's own: files, and packages of its workspace
  for (const entry of ctx.loader.entries()) {
    const { name, disabled } = entry.options
    if (name.startsWith('cordis:') || disabled === true) continue
    if (workspace[name]) {
      const file = resolveExport(workspace[name], '.', ['node', 'import'])
      if (!file) continue
      input.entries.add(file)
      packages[name] = file
    } else if (name.startsWith('.') || isAbsolute(name) || name.startsWith('file:')) {
      const file = isAbsolute(name) ? name : fileURLToPath(new URL(name, entry.parent.tree.ctx.baseUrl ?? ctx.baseUrl))
      if (file.startsWith(cwd + sep) && !file.includes(`${sep}node_modules${sep}`) && SCRIPT_RE.test(file) && existsSync(file)) {
        input.entries.add(file)
      }
    }
  }
  await ctx.parallel('build/node', input)

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const entryPoints: Dict<string> = {}
  for (const file of input.entries) entryPoints[toEntryName(cwd, file)] = file
  if (Object.keys(entryPoints).length) {
    const { build } = await import('esbuild')
    await build({
      absWorkingDir: cwd,
      entryPoints,
      outdir: outDir,
      outExtension: { '.js': '.mjs' },
      chunkNames: '_chunks/[name]-[hash]',
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      sourcemap: true,
      logLevel: 'warning',
      plugins: [{
        name: 'cormi:dependencies',
        setup(build) {
          // the packages of node_modules and node's builtins are imported at runtime; those of the workspace
          // are compiled from their sources, and the aliases of the app (tsconfig paths) as files of the app
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (isAbsolute(args.path)) return
            const file = resolveWorkspace(workspace, args.path, ['node', 'import'])
            if (file) return { path: file }
            if (isBuiltin(args.path) || isInstalled(args.path, args.resolveDir)) return { path: args.path, external: true }
          })
        },
      }],
    })
  }

  const output = (file: string) => `${toEntryName(cwd, file)}.mjs`
  const manifest: NodeBuild = {
    files: Object.fromEntries([...input.entries].map(file => [winPath(relative(cwd, file)), output(file)])),
    packages: Object.fromEntries(Object.entries(packages).map(([name, file]) => [name, output(file)])),
    data: input.data,
  }
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

/**
 * Read the Node code of a built app for `cormi start`, and let the plugin
 * tree import it in place of the sources.
 */
export async function loadNodeBuild(cwd: string): Promise<NodeBuild> {
  const outDir = join(cwd, NODE_DIR)
  const content = await readFile(join(outDir, 'manifest.json'), 'utf8').catch(() => undefined)
  if (!content) throw new CommandError('the app is not built: cormi start runs the output of cormi build')
  const manifest: NodeBuild = JSON.parse(content)
  const toAbsolute = (record: Dict<string>, key: (name: string) => string) => {
    return Object.fromEntries(Object.entries(record).map(([name, file]) => [key(name), resolve(outDir, file)]))
  }
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
  register(new URL(`./production-hook${extension}`, import.meta.url), {
    data: {
      files: toAbsolute(manifest.files, name => resolve(cwd, name)),
      packages: toAbsolute(manifest.packages, name => name),
    },
  })
  return manifest
}
