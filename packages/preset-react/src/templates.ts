import { isAbsolute, relative } from 'node:path'
import type { App, Route } from '@cormi/core'
import { winPath } from '@cormi/core'
import type { Dict } from 'cosmokit'

const json = (value: unknown) => JSON.stringify(value ?? null)

/** A specifier for a module: files become relative to the generated directory, package specifiers are kept. */
export function toSpecifier(dir: string, file: string) {
  if (!isAbsolute(file)) return file
  const path = winPath(relative(dir, file))
  return path.startsWith('.') ? path : `./${path}`
}

/** `@scope/name/client` -> `@scope/name`; `undefined` for files. */
export function getPackageName(specifier: string) {
  if (isAbsolute(specifier) || specifier.startsWith('.')) return
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

export function renderRoutes(dir: string, routes: Dict<Route>) {
  const data = Object.values(routes).map(route => ({
    id: route.id,
    path: route.path,
    index: route.index || undefined,
    parentId: route.parentId,
    hasLoader: route.exports?.includes('loader') || undefined,
    hasClientLoader: route.exports?.includes('clientLoader') || undefined,
  }))
  const modules = Object.values(routes)
    .filter(route => route.file)
    .map(route => `  ${json(route.id)}: () => import(${json(toSpecifier(dir, route.file!))}),`)
  return [
    `import type { RouteData, RouteModules } from 'cormi/client'`,
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

export interface ContextOptions {
  base: string
  history: string
}

function renderEntries(dir: string, entries: Iterable<App.Entry>) {
  const list = [...entries]
  return {
    imports: list.map((entry, index) => `import * as entry${index} from ${json(toSpecifier(dir, entry.file))}`),
    specifiers: list.map(entry => toSpecifier(dir, entry.file)),
    array: `[${list.map((entry, index) => `[entry${index}, ${entry.config === undefined ? 'undefined' : json(entry.config)}]`).join(', ')}]`,
  }
}

export function renderEntry(app: App, options: ContextOptions & { mountElementId: string }) {
  const entries = renderEntries(app.dir, app.entries)
  return [
    ...[...app.imports].map(({ source }) => `import ${json(toSpecifier(app.dir, source))}`),
    `import { Context, render, type RenderOptions, unwrapExports } from 'cormi/client'`,
    `import { routeModules, routes } from './routes'`,
    ...entries.imports,
    '',
    `const ctx = new Context({ routes, routeModules, base: ${json(options.base)}, history: ${json(options.history)} })`,
    `const entries: [any, any][] = ${entries.array}`,
    `const fibers = entries.map(([module, config]) => ctx.plugin(unwrapExports(module), config))`,
    '',
    `// lifecycles of the app, called by a host that mounts it (e.g. a qiankun master)`,
    `let unmountApp: (() => void) | undefined`,
    `export async function bootstrap() {}`,
    `export async function mount(options: Partial<RenderOptions> = {}) {`,
    `  unmountApp = await render(ctx, { mountElementId: ${json(options.mountElementId)}, ...options })`,
    `}`,
    `export async function update(options: Partial<RenderOptions> = {}) {`,
    `  if (options.props) ctx.$app.setProps(options.props)`,
    `}`,
    `export async function unmount() {`,
    `  unmountApp?.()`,
    `  unmountApp = undefined`,
    `}`,
    '',
    `// plugins are applied asynchronously: mount once they are, unless one of them`,
    `// takes over through \`app/bootstrap\` (e.g. qiankun mounts the app itself)`,
    `void Promise.allSettled(fibers).then(() => ctx.bail('app/bootstrap') || mount())`,
    '',
    `// a runtime plugin is hot-replaced by disposing its fiber and mounting the new module`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.accept(${json(entries.specifiers)}, (modules) => {`,
    `    modules.forEach((module, index) => {`,
    `      if (!module) return`,
    `      void fibers[index].dispose()`,
    `      fibers[index] = ctx.plugin(unwrapExports(module), entries[index][1])`,
    `    })`,
    `  })`,
    `}`,
    '',
  ].join('\n')
}

export function renderServer(app: App, options: ContextOptions) {
  const entries = renderEntries(app.dir, app.entries)
  const servers = [...app.servers]
  return [
    // global stylesheets and polyfills are part of what the server renders
    ...[...app.imports].map(({ source }) => `import ${json(toSpecifier(app.dir, source))}`),
    `import { Context, unwrapExports } from 'cormi/client'`,
    `import { createRequestHandler } from 'cormi/client/server'`,
    `import { routeModules, routes } from './routes'`,
    ...entries.imports,
    ...servers.map(([, file], index) => `import * as server${index} from ${json(toSpecifier(app.dir, file))}`),
    '',
    `const ctx = new Context({ routes, routeModules, base: ${json(options.base)}, history: 'memory' })`,
    `for (const [module, config] of ${entries.array} as [any, any][]) ctx.plugin(unwrapExports(module), config)`,
    '',
    `export const handler = createRequestHandler(ctx)`,
    '',
    `export const modules = {`,
    ...servers.map(([key], index) => `  ${json(key)}: server${index},`),
    `}`,
    '',
  ].join('\n')
}

export function renderTsconfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['DOM', 'DOM.Iterable', 'ES2022'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      allowJs: true,
      isolatedModules: true,
      resolveJsonModule: true,
      allowImportingTsExtensions: true,
      paths: {
        '@/*': ['../*'],
        '@@/*': ['./*'],
      },
    },
    include: ['../**/*'],
  }, null, 2) + '\n'
}

const ASSETS = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'mp4', 'webm', 'ogg', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'otf', 'txt', 'pdf']

export const TYPINGS = [
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
