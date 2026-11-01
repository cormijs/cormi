import { type App, MODULE_TYPINGS, renderEntries, renderRoutes as renderRouteManifest, type Route, toSpecifier } from '@cormijs/core'
import type { Dict } from 'cosmokit'

const json = (value: unknown) => JSON.stringify(value ?? null)

export function renderRoutes(dir: string, routes: Dict<Route>) {
  return renderRouteManifest(dir, routes, '@cormijs/react/client')
}

export interface ContextOptions {
  base: string
  history: string
}

export interface EntryOptions extends ContextOptions {
  mountElementId: string
  loading?: string
  /** the bundler's code that hot-replaces imports: `ctx.bundler.hotAccept()` */
  hotAccept: (imports: [string, string][], callback: string) => string
}

export function renderEntry(app: App, options: EntryOptions) {
  const entries = renderEntries(app.dir, app.entries)
  return [
    ...[...app.imports].map(({ source }) => `import ${json(toSpecifier(app.dir, source))}`),
    `import { Context, render, type RenderOptions, unwrapExports } from '@cormijs/react/client'`,
    `import { routeModules, routes } from './routes'`,
    ...options.loading ? [`import loading from ${json(toSpecifier(app.dir, options.loading))}`] : [],
    ...entries.imports,
    '',
    `const ctx = new Context({ routes, routeModules, base: ${json(options.base)}, history: ${json(options.history)}${options.loading ? ', loading' : ''} })`,
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
    options.hotAccept(entries.bindings, [
      `(modules: any[]) => {`,
      `  modules.forEach((module, index) => {`,
      `    if (!module) return`,
      `    void fibers[index].dispose()`,
      `    fibers[index] = ctx.plugin(unwrapExports(module), entries[index][1])`,
      `  })`,
      `}`,
    ].join('\n')),
    '',
  ].join('\n')
}

export function renderServer(app: App, options: ContextOptions) {
  const entries = renderEntries(app.dir, app.entries)
  const servers = [...app.servers]
  return [
    // global stylesheets and polyfills are part of what the server renders
    ...[...app.imports].map(({ source }) => `import ${json(toSpecifier(app.dir, source))}`),
    `import { Context, unwrapExports } from '@cormijs/react/client'`,
    `import { createRequestHandler } from '@cormijs/react/client/server'`,
    `import { routeModules, routes } from './routes'`,
    ...entries.imports,
    ...servers.map(([, file], index) => `import * as server${index} from ${json(toSpecifier(app.dir, file))}`),
    '',
    `const ctx = new Context({ routes, routeModules, base: ${json(options.base)}, history: 'memory' })`,
    `for (const [module, config] of ${entries.array} as [any, any][]) ctx.plugin(unwrapExports(module), config)`,
    '',
    `export const handler = createRequestHandler(ctx)`,
    `export const base = ${json(options.base)}`,
    '',
    `export const modules = {`,
    ...servers.map(([key], index) => `  ${json(key)}: server${index},`),
    `}`,
    '',
  ].join('\n')
}

export function renderTsconfig(paths: Dict<string[]> = {}) {
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
        ...paths,
      },
    },
    include: ['../**/*'],
  }, null, 2) + '\n'
}

export const TYPINGS = MODULE_TYPINGS
