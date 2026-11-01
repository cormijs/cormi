import { writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import * as mf from '@cormijs/plugin-mf'
import { type App, type Context, readJSON, type Route, Schema, winPath } from 'cormi'
import { checkShared, getShared, MANIFEST_FILE, type Manifest, REMOTE_ENTRY, toContainerName, toManifestRoutes } from './shared.ts'
import type {} from '@cormijs/vite'

export const name = 'federation-package'
export const inject = ['app', 'router', 'vite', 'react']

export interface Config {
  /** name of the package's container; defaults to the package name */
  name?: string
  /** load the package with the app, instead of when one of its routes is visited */
  eager: boolean
  /**
   * runtime plugins of other packages that the host applies along with this
   * package's own (`src/app.tsx`), e.g. `@cormijs/plugin-model/client`
   */
  entries: string[]
  /** modules the host and the other packages import: `{ './Card': './src/components/Card.tsx' }` */
  exposes: Record<string, string>
  /** dependencies of one instance for the page, besides react, react-dom, react-router, cordis and the Cormi runtime */
  shared: string[]
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().description('name of the package\'s container, defaults to the package name'),
  eager: Schema.boolean().default(false).description('load the package with the app'),
  entries: Schema.array(String).default([]).description('runtime plugins of other packages the host applies with this package'),
  exposes: Schema.dict(String).default({}).description('modules the host and the other packages import'),
  shared: Schema.array(String).default([]).description('dependencies of one instance for the page'),
})

const PLUGIN_FILE = 'plugin-federation/package.ts'

const json = (value: unknown) => JSON.stringify(value ?? null)

function toSpecifier(dir: string, file: string) {
  if (!isAbsolute(file)) return file
  const path = winPath(relative(dir, file))
  return path.startsWith('.') ? path : `./${path}`
}

/**
 * The module the host imports when the package loads (`<name>/plugin`): the
 * route modules of the package, and a cordis plugin applying its runtime
 * plugins in the host.
 */
function renderPlugin(dir: string, routes: Route[], entries: App.Entry[], imports: App.Import[]) {
  return [
    `import { unwrapExports } from '@cormijs/react/client'`,
    ...imports.map(({ source }) => `import ${json(toSpecifier(dir, source))}`),
    ...entries.map((entry, index) => `import * as entry${index} from ${json(toSpecifier(dir, entry.file))}`),
    '',
    `export const routeModules = {`,
    ...routes.map(route => `  ${json(route.id)}: () => import(${json(toSpecifier(dir, route.file!))}),`),
    `}`,
    '',
    `const entries: [any, any][] = [${entries.map((entry, index) => `[entry${index}, ${entry.config === undefined ? 'undefined' : json(entry.config)}]`).join(', ')}]`,
    '',
    `export async function apply(ctx: any) {`,
    `  await Promise.allSettled(entries.map(([module, config]) => ctx.plugin(unwrapExports(module), config)))`,
    `}`,
    '',
  ].join('\n')
}

/**
 * A package of a federated app: an app of its own, built and deployed apart,
 * that a host loads by URL. Its build adds a remote entry exposing the
 * package's plugin and a manifest (`federation.json`) with its routes. In the
 * host, the package uses the host's singletons, and its own runtime plugins
 * (`src/app.tsx`, global styles) are applied when it loads; the frame of the
 * package (top layouts, 404 page) is only used when it runs by itself.
 */
export function apply(ctx: Context, config: Config) {
  const { cormi, app, router, vite } = ctx
  const pkg = readJSON(cormi.resolve('package.json')) ?? {}
  const name = config.name ?? toContainerName(pkg.name ?? 'package')
  const logger = ctx.logger('federation')

  // files of the package itself; generated modules belong to the plugins that generate them
  const isOwn = (file: string) => {
    if (!isAbsolute(file) || !winPath(file).startsWith(winPath(cormi.paths.src) + '/')) return false
    return !winPath(file).startsWith(winPath(cormi.paths.tmp) + '/')
  }

  const warned = new Set<string>()
  const getRoutes = () => toManifestRoutes(router.routes, name, (route) => {
    if (warned.has(route.id)) return
    warned.add(route.id)
    logger.warn('route %s exports a loader, which the host does not run: use a clientLoader', route.id)
  })

  ctx.app.file(PLUGIN_FILE, () => {
    const ids = new Set(getRoutes().map(route => route.id))
    const routes = Object.values(router.routes)
      .filter(route => route.file && ids.has(`${name}/${route.id}`))
      .map(route => ({ ...route, id: `${name}/${route.id}` }))
    const entries = [...app.entries].filter(entry => isOwn(entry.file) || config.entries.includes(entry.file))
    const imports = [...app.imports].filter(entry => isOwn(entry.source))
    return renderPlugin(dirname(join(app.dir, PLUGIN_FILE)), routes, entries, imports)
  })
  ctx.on('router/update', () => app.refresh())

  const shared = getShared(config.shared)
  checkShared(ctx, shared)
  // the host loads modules by id at runtime: no types are generated for it
  ctx.plugin(mf, {
    name,
    remotes: {},
    exposes: { './plugin': './' + winPath(relative(cormi.cwd, join(app.dir, PLUGIN_FILE))), ...config.exposes },
    shared,
    filename: REMOTE_ENTRY,
    dts: false,
  })

  // the package is deployed anywhere: chunks load assets relative to themselves
  vite.configure({
    experimental: {
      renderBuiltUrl: (_, { hostType, ssr }) => !ssr && hostType === 'js' ? { relative: true } : undefined,
    },
  })

  const getManifest = (entry: string): Manifest => ({
    name,
    package: pkg.name,
    version: pkg.version,
    entry,
    eager: config.eager || undefined,
    routes: getRoutes(),
  })

  ctx.on('build/after', async ({ outDir }) => {
    // the manifest is fetched afresh; the query makes browsers fetch the new remote entry
    const manifest = getManifest(`${REMOTE_ENTRY}?t=${Date.now().toString(36)}`)
    await writeFile(join(outDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
  })
  if (cormi.mode !== 'dev') return
  ctx.inject(['server'], (ctx) => {
    ctx.server.get(new URL(vite.config.publicPath + MANIFEST_FILE, 'http://localhost').pathname, async () => {
      return Response.json(getManifest(REMOTE_ENTRY))
    })
  })
}
