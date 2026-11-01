import { isAbsolute, relative } from 'node:path'
import type { Dict } from 'cosmokit'
import type { App } from './app.ts'
import type { Route } from './types.ts'
import { winPath } from './utils/index.ts'
import type { Workspace } from './workspace.ts'
import { resolveExport } from './workspace-exports.ts'

// helpers of the renderers, which generate the entries of the app (`src/.cormi`)

const json = (value: unknown) => JSON.stringify(value ?? null)

/** A specifier for a module: files become relative to the generated directory, package specifiers are kept. */
export function toSpecifier(dir: string, file: string) {
  if (!isAbsolute(file)) return file
  const path = winPath(relative(dir, file))
  return path.startsWith('.') ? path : `./${path}`
}

/** Route props of umi-style configured routes that go to the client's `meta`. */
const META_KEYS = ['name', 'icon', 'hideInMenu']

function getMeta(route: Route) {
  const meta: Record<string, unknown> = { ...route.meta }
  for (const key of META_KEYS) {
    if (route[key] !== undefined) meta[key] = route[key]
  }
  return Object.keys(meta).length ? meta : undefined
}

/**
 * The route manifest of the browser (`src/.cormi/routes.ts`): the route
 * data, and the modules imported lazily. `client` is the module of the UI
 * framework's client that types them, e.g. `@cormijs/react/client`.
 */
export function renderRoutes(dir: string, routes: Dict<Route>, client: string) {
  const data = Object.values(routes).map(route => ({
    id: route.id,
    path: route.path,
    index: route.index || undefined,
    parentId: route.parentId,
    isLayout: route.isLayout || undefined,
    hasLoader: route.exports?.includes('loader') || undefined,
    hasClientLoader: route.exports?.includes('clientLoader') || undefined,
    meta: getMeta(route),
  }))
  const modules = Object.values(routes)
    .filter(route => route.file)
    .map(route => `  ${json(route.id)}: () => import(${json(toSpecifier(dir, route.file!))}),`)
  return [
    `import type { RouteData, RouteModules } from ${json(client)}`,
    '',
    `export const routes: Record<string, RouteData> = {`,
    ...data.map(route => `  ${json(route.id)}: ${JSON.stringify(route)},`),
    `}`,
    '',
    `export const routeModules: RouteModules = {`,
    ...modules,
    `}`,
    '',
  ].join('\n')
}

/**
 * The browser plugins of an entry: their imports, the `[specifier, name]`
 * of each for `ctx.bundler.hotAccept()`, and the `[module, config]` array.
 */
export function renderEntries(dir: string, entries: Iterable<App.Entry>) {
  const list = [...entries]
  return {
    imports: list.map((entry, index) => `import * as entry${index} from ${json(toSpecifier(dir, entry.file))}`),
    bindings: list.map((entry, index) => [toSpecifier(dir, entry.file), `entry${index}`] as [string, string]),
    array: `[${list.map((entry, index) => `[entry${index}, ${entry.config === undefined ? 'undefined' : json(entry.config)}]`).join(', ')}]`,
  }
}

/** Paths of the workspace packages, relative to the generated directory: their sources are typed like the app's. */
export function getWorkspacePaths(dir: string, packages: Dict<Workspace.Package>) {
  const paths: Dict<string[]> = {}
  for (const pkg of Object.values(packages)) {
    const main = resolveExport(pkg, '.', ['import'])
    if (main) paths[pkg.name] = [winPath(relative(dir, main))]
    paths[`${pkg.name}/*`] = [winPath(relative(dir, pkg.dir)) + '/*']
  }
  return paths
}

const ASSETS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'otf', 'txt', 'pdf']

/** Types of `import.meta` and of the modules that are not scripts, as every bundler handles them. */
export const MODULE_TYPINGS = [
  `interface ImportMetaEnv {`,
  `  readonly MODE: string`,
  `  readonly BASE_URL: string`,
  `  readonly DEV: boolean`,
  `  readonly PROD: boolean`,
  `  readonly SSR: boolean`,
  `  readonly [key: string]: any`,
  `}`,
  '',
  `interface ImportMeta {`,
  `  readonly env: ImportMetaEnv`,
  `  readonly hot?: any`,
  `  readonly webpackHot?: any`,
  `}`,
  '',
  `declare module '*.module.css' { const classes: { readonly [key: string]: string }; export default classes }`,
  `declare module '*.module.less' { const classes: { readonly [key: string]: string }; export default classes }`,
  `declare module '*.module.scss' { const classes: { readonly [key: string]: string }; export default classes }`,
  `declare module '*.css' {}`,
  `declare module '*.less' {}`,
  `declare module '*.scss' {}`,
  ...ASSETS.map(ext => `declare module '*.${ext}' { const src: string; export default src }`),
  `declare module '*?raw' { const content: string; export default content }`,
  `declare module '*?url' { const src: string; export default src }`,
  '',
].join('\n')
