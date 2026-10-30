import { isAbsolute, join } from 'node:path'
import { watch } from 'chokidar'
import { Context, Service } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import { cloneDeep, isEqual } from 'es-toolkit'
import Schema from 'schemastery'
import { addParentRoute, getConfigRoutes, getConventionRoutes } from './route/index.ts'
import type { Route } from './types.ts'
import { expandExtensions, getModuleExports, Refresher, resolveModule, tryPaths, winPath } from './utils/index.ts'

declare module 'cordis' {
  interface Context {
    router: Router
  }

  interface Events {
    /**
     * The route table was recomputed and differs from the previous one.
     * @mode emit
     * @param routes the new route table
     */
    'router/update'(routes: Dict<Route>): void
  }
}

const ROUTE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.md', '.mdx']
const LAYOUT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

interface Layout extends Router.LayoutOptions {
  id: string
  file: string
}

/**
 * The route table of the app (`ctx.router`).
 *
 * Routes come from the pages directory (or `routes` in the config), then from
 * plugins: `route()` adds routes, `layout()` wraps them, `patch()` edits the
 * table. Every registration is an effect of the calling plugin, and the table
 * is recomputed whenever registrations or route files change.
 */
export class Router extends Service {
  /** the current route table */
  routes: Dict<Route> = Object.create(null)

  private _routes = new Set<Route>()
  private _layouts = new Set<Layout>()
  private _patches = new Set<Router.Patch>()
  private _refresher: Refresher

  constructor(ctx: Context, public config: Router.Config) {
    super(ctx, 'router')
    this._refresher = new Refresher(() => this._update(), 50, error => ctx.logger('router').error(error))
  }

  /** absolute path of the pages directory */
  get pagesDir() {
    return this.ctx.cormi.resolve(this.config.pages)
  }

  async* [Service.init]() {
    this.refresh()
    await this.flush()
    yield () => this._refresher.dispose()
    if (this.ctx.cormi.mode !== 'dev') return
    const watcher = watch([this.pagesDir, join(this.ctx.cormi.paths.src, 'layouts')], { ignoreInitial: true })
    watcher.on('all', () => this.refresh())
    yield () => watcher.close()
  }

  /** Add a route, or replace the route with the same id. */
  route(route: Partial<Route> & { path: string }) {
    const value = { ...route, id: route.id ?? (route.file ? winPath(route.file) : route.path) } as Route
    return this.ctx.effect(() => {
      this._routes.add(value)
      this.refresh()
      return () => {
        this._routes.delete(value)
        this.refresh()
      }
    }, `ctx.router.route(${JSON.stringify(value.id)})`)
  }

  /** Wrap routes with a layout component. Later layouts wrap earlier ones. */
  layout(file: string, options: Router.LayoutOptions = {}) {
    const value: Layout = { id: options.id ?? `@@/layout:${winPath(file)}`, file, test: options.test }
    return this.ctx.effect(() => {
      this._layouts.add(value)
      this.refresh()
      return () => {
        this._layouts.delete(value)
        this.refresh()
      }
    }, `ctx.router.layout(${JSON.stringify(value.id)})`)
  }

  /** Edit the route table after it is built. Patches run in registration order. */
  patch(patch: Router.Patch) {
    return this.ctx.effect(() => {
      this._patches.add(patch)
      this.refresh()
      return () => {
        this._patches.delete(patch)
        this.refresh()
      }
    }, 'ctx.router.patch()')
  }

  /** Recompute the route table soon. */
  refresh() {
    this._refresher.schedule()
  }

  /** Wait for a pending recomputation. */
  flush() {
    return this._refresher.flush()
  }

  /** Resolve a route component (`./foo`, `@/pages/foo`, absolute) to a file. */
  resolveFile(file: string, basedir = this.pagesDir) {
    if (file.startsWith('@/')) file = join(this.ctx.cormi.paths.src, file.slice(2))
    if (!isAbsolute(file) && !file.startsWith('.')) file = `./${file}`
    return winPath(resolveModule(file, basedir, ROUTE_EXTENSIONS))
  }

  private async _update() {
    // schemastery fills arrays with `[]`, so an empty list means convention routes
    const routes = this.config.routes?.length
      ? getConfigRoutes({ routes: cloneDeep(this.config.routes), onResolveComponent: file => this.resolveFile(file) })
      : this._getConventionRoutes()

    for (const route of this._routes) {
      // an absolute file may be generated after the route is registered
      const file = route.file && (isAbsolute(route.file) ? winPath(route.file) : this.resolveFile(route.file, this.ctx.cormi.cwd))
      routes[route.id] = { ...route, file }
    }

    const layouts = [...this._layouts]
    const conventionLayout = this.config.layout && tryPaths(expandExtensions(join(this.ctx.cormi.paths.src, 'layouts/index'), LAYOUT_EXTENSIONS))
    if (conventionLayout) layouts.unshift({ id: '@@/global-layout', file: conventionLayout })
    for (const layout of layouts) {
      addParentRoute({
        addToAll: true,
        target: { id: layout.id, path: '/', absPath: '/', file: winPath(layout.file), isLayout: true },
        routes,
        test: layout.test ?? (route => route.layout !== false),
      })
    }

    for (const route of Object.values(routes)) {
      if (!route.file) continue
      route.exports = /\.[cm]?[jt]sx?$/.test(route.file) ? await getModuleExports({ file: route.file }) : []
    }
    for (const patch of this._patches) await patch(routes)

    if (isEqual(routes, this.routes)) return
    this.routes = routes
    this.ctx.emit('router/update', routes)
  }

  private _getConventionRoutes() {
    const base = this.pagesDir
    const routes = getConventionRoutes({ base })
    for (const route of Object.values(routes)) {
      route.file = winPath(join(base, route.file!))
      // a top-level 404 page catches every unmatched path
      if (route.id === '404' && route.parentId === undefined) {
        route.path = '*'
        route.absPath = '/*'
      }
    }
    return routes
  }
}

export namespace Router {
  export interface Config {
    /** directory of convention routes, relative to the app root */
    pages: string
    /** wrap every route with `src/layouts/index` */
    layout: boolean
    /** configured routes; when non-empty, convention routes are not scanned */
    routes?: RouteConfig[]
  }

  /** A configured route: `component` is resolved against the pages directory. */
  export interface RouteConfig {
    path?: string
    component?: string
    routes?: RouteConfig[]
    wrappers?: string[]
    layout?: boolean
    [key: string]: any
  }

  export interface LayoutOptions {
    /** route id of the layout, defaults to `@@/layout:<file>` */
    id?: string
    /** routes the layout applies to; defaults to every route without `layout: false` */
    test?: (route: Route) => boolean
  }

  export type Patch = (routes: Dict<Route>) => Awaitable<void>

  export const Config: Schema<Config> = Schema.object({
    pages: Schema.string().default('src/pages').description('directory of convention routes'),
    layout: Schema.boolean().default(true).description('wrap every route with src/layouts/index'),
    routes: Schema.array(Schema.any()).description('configured routes; disables convention routes'),
  })
}
