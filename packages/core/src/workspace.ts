import { existsSync, readdirSync } from 'node:fs'
import { register } from 'node:module'
import { basename, join, relative } from 'node:path'
import { MessageChannel, type MessagePort } from 'node:worker_threads'
import { Context, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { CommandError, createFile } from './cli.ts'
import { readJSON, winPath } from './utils/index.ts'
import { resolveWorkspace, type WorkspaceTarget } from './workspace-exports.ts'

export { getPackageName, resolveExport, resolveWorkspace, type WorkspaceTarget } from './workspace-exports.ts'

declare module 'cordis' {
  interface Context {
    workspace: Workspace
  }

  interface Events {
    /**
     * Packages were added to or removed from the workspace.
     * @mode emit
     * @param packages the packages by name
     */
    'workspace/update'(packages: Dict<Workspace.Package>): void
  }
}

/** The directory of workspace packages, below the app root. */
export const WORKSPACE_DIR = 'plugins'

/** The packages of `<cwd>/plugins/*`, by name. */
export function scanWorkspace(cwd: string): Dict<Workspace.Package> {
  const dir = join(cwd, WORKSPACE_DIR)
  if (!existsSync(dir)) return {}
  const packages: Dict<Workspace.Package> = {}
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue
    const root = join(dir, dirent.name)
    const meta = readJSON(join(root, 'package.json'))
    if (!meta?.name) continue
    packages[meta.name] = {
      name: meta.name,
      version: meta.version,
      description: meta.description,
      dir: winPath(root),
      path: winPath(relative(cwd, root)),
      exports: meta.exports,
      main: meta.main,
    }
  }
  return packages
}

let port: MessagePort | undefined

/** Let Node resolve the workspace packages: the hook is registered once per process and updated afterwards. */
function registerResolution(packages: Dict<WorkspaceTarget>) {
  if (port) return port.postMessage(packages)
  const channel = new MessageChannel()
  port = channel.port1
  port.unref()
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
  register(new URL(`./workspace-hook${extension}`, import.meta.url), {
    data: { packages, port: channel.port2 },
    transferList: [channel.port2],
  })
}

const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** `hello` -> `cormi-plugin-hello`; scoped and prefixed names are kept. */
export function toPackageName(name: string) {
  if (!NAME_RE.test(name)) throw new CommandError(`invalid package name: ${name}`)
  return name.startsWith('@') || name.startsWith('cormi-plugin-') ? name : `cormi-plugin-${name}`
}

/** The short name of a plugin package: `@acme/cormi-plugin-foo` -> `foo`. */
export function toShortName(name: string) {
  return basename(name).replace(/^cormi-plugin-/, '')
}

/**
 * The workspace of the app (`ctx.workspace`): plugin packages developed in
 * `plugins/*`, like the workspace of a koishi boilerplate. They are loaded
 * from their sources by package name, in `cormi.yml` and in the browser,
 * without a build or an install; `cormi g plugin <name>` creates one.
 *
 * `start()` provides the service on the root context.
 */
export class Workspace extends Service {
  packages: Dict<Workspace.Package> = {}

  constructor(ctx: Context) {
    super(ctx, 'workspace')
    this.refresh()
    ctx.cli.generator('plugin', {
      description: `a plugin package: ${WORKSPACE_DIR}/<name>/ (--no-client, --console)`,
      run: async (name, args) => this._create(name, { client: args.client !== false, console: !!args.console }),
    })
  }

  /** the directory of the packages */
  get dir() {
    return join(this.ctx.cormi.cwd, WORKSPACE_DIR)
  }

  async* [Service.init]() {
    if (this.ctx.cormi.mode !== 'dev') return
    const { watch } = await import('chokidar')
    // packages appear and disappear with their package.json
    const watcher = watch(this.dir, { ignoreInitial: true, depth: 1, ignored: path => path.includes('node_modules') })
    watcher.on('all', (_, path) => {
      if (basename(path) === 'package.json' || !path.includes('.')) this.refresh()
    })
    yield () => watcher.close()
  }

  /** Scan the packages again. */
  refresh() {
    const packages = scanWorkspace(this.ctx.cormi.cwd)
    const changed = JSON.stringify(packages) !== JSON.stringify(this.packages)
    this.packages = packages
    if (Object.keys(packages).length || port) registerResolution(packages)
    if (changed) this.ctx.emit('workspace/update', packages)
  }

  /** The file a specifier resolves to, if it belongs to a workspace package; `source` wins over other conditions. */
  resolve(specifier: string, conditions: string[]) {
    return resolveWorkspace(this.packages, specifier, conditions)
  }

  /** Create a plugin package in the workspace. */
  async create(name: string, options: Workspace.CreateOptions = {}) {
    await this._create(name, options)
    return this.packages[toPackageName(name)]
  }

  private async _create(name: string, options: Workspace.CreateOptions) {
    const files = await createPlugin(this.dir, toPackageName(name), { client: true, ...options })
    this.refresh()
    return files
  }
}

export namespace Workspace {
  export interface Package extends WorkspaceTarget {
    version?: string
    description?: string
    /** relative to the app root: `plugins/foo` */
    path: string
  }

  export interface CreateOptions {
    /** a browser plugin (`client/index.tsx`), registered with `ctx.app.entry()` */
    client?: boolean
    /** a console page (`console/index.tsx`), registered with `ctx.console.entry()` */
    console?: boolean
    description?: string
  }
}

/** A single-quoted string literal; package names have no quotes or backslashes. */
const quote = (value: string) => `'${value}'`

/** Write the files of a plugin package; returns them. */
export async function createPlugin(root: string, name: string, options: Workspace.CreateOptions) {
  const short = toShortName(name)
  const dir = join(root, short)
  if (existsSync(dir)) throw new CommandError(`${winPath(dir)} exists already`)
  const exports: Dict<any> = { '.': { source: './src/index.ts', default: './lib/index.js' } }
  if (options.client) exports['./client'] = './client/index.tsx'
  if (options.console) exports['./console'] = './console/index.tsx'
  const pkg = {
    name,
    description: options.description ?? `The ${short} plugin of the app`,
    version: '0.0.0',
    type: 'module',
    exports,
    files: ['lib', 'src', ...options.client ? ['client'] : [], ...options.console ? ['console'] : []],
    keywords: ['cormi', 'cormi-plugin'],
    // what the market shows: the bundlers and UI frameworks it supports (`bundler: ['vite']`…), any when omitted
    cormi: {},
    peerDependencies: { cormi: '*' },
  }
  const node = [
    `import { type Context, Schema } from 'cormi'`,
    '',
    `export const name = ${quote(short)}`,
    ...options.client ? [`export const inject = ['app']`] : [],
    '',
    `export interface Config {`,
    `  greeting: string`,
    `}`,
    '',
    `export const Config: Schema<Config> = Schema.object({`,
    `  greeting: Schema.string().default('Hello from ${name}').description('logged by the browser plugin'),`,
    `})`,
    '',
    `export function apply(ctx: Context, config: Config) {`,
    `  ctx.logger(${quote(short)}).info('loaded, greeting: %s', config.greeting)`,
    ...options.client ? [
      `  // the browser plugin, registered by package name; config goes along as JSON`,
      `  ctx.app.entry(${quote(`${name}/client`)}, { greeting: config.greeting })`,
    ] : [],
    ...options.console ? [
      `  // a page of the console, in dev mode`,
      `  ctx.inject(['console'], (ctx) => {`,
      `    ctx.console.entry(${quote(`${name}/console`)})`,
      `  })`,
    ] : [],
    `}`,
    '',
  ]
  const client = [
    `import type { Context } from 'cormi/client'`,
    '',
    `export default (ctx: Context, config: { greeting: string }) => {`,
    `  ctx.on('app/mount', () => console.info(config.greeting))`,
    `}`,
    '',
  ]
  const consolePage = [
    `import type { Context } from 'cormi/client'`,
    `import type {} from 'cormi/console'`,
    '',
    `function Page() {`,
    `  return <p>The page of ${name} in the console.</p>`,
    `}`,
    '',
    `export default (ctx: Context) => {`,
    `  ctx.$console.page({ path: ${quote(`/${short}`)}, name: ${quote(short)}, component: Page })`,
    `}`,
    '',
  ]
  return [
    await createFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n'),
    await createFile(join(dir, 'src/index.ts'), node.join('\n')),
    ...options.client ? [await createFile(join(dir, 'client/index.tsx'), client.join('\n'))] : [],
    ...options.console ? [await createFile(join(dir, 'console/index.tsx'), consolePage.join('\n'))] : [],
  ]
}
