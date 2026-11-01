import { Context, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { LOADER_ENDPOINT, REDIRECT_HEADER } from './constants.ts'
import type { HistoryType, Location, NavigationType, RouteData, RouteModule, RouteModules } from './types.ts'

declare module 'cordis' {
  interface Events {
    /**
     * The location changed, including the initial location. Browser only.
     * @mode emit
     * @param location the new location
     * @param action how the location was reached
     */
    'router/change'(location: Location, action: NavigationType): void
  }
}

export interface RouterOptions<M = RouteModule> {
  routes: Dict<RouteData>
  routeModules: RouteModules<M>
  /** basename of the app (default `/`) */
  base?: string
  history?: HistoryType
}

/**
 * The router of the app in the browser (`ctx.$router`): the route table, its
 * modules, and the routes plugins add at runtime. Each UI framework
 * implements it with its own router; `router/change` is emitted on
 * navigation.
 */
export abstract class RouterService<M extends RouteModule = RouteModule> extends Service {
  /** basename of the router; differs from `base` when a host mounts the app below a path */
  basename: string
  /** origin of the app's server, when the app runs in a foreign page; requests of server loaders go there */
  origin = ''

  private _modules = new Map<string, Promise<M>>()

  constructor(ctx: Context, public options: RouterOptions<M>) {
    super(ctx, '$router')
    this.basename = this.base
  }

  /** basename of the app on its own server */
  get base() {
    return this.options.base ?? '/'
  }

  get routes() {
    return this.options.routes
  }

  /** Import a route module; the promise is cached. */
  load(id: string): Promise<M> {
    let task = this._modules.get(id)
    if (!task) {
      const load = this.options.routeModules[id]
      task = load ? load() : Promise.resolve({} as M)
      this._modules.set(id, task)
      task.catch(() => this._modules.delete(id))
    }
    return task
  }

  /** Go to a path below the basename. */
  abstract navigate(to: string, options?: { replace?: boolean; state?: unknown }): unknown

  /** The URL of a location, as links write it: with the basename, or after `#` with hash history. */
  href(location: Location) {
    const path = location.pathname + location.search + location.hash
    const prefix = this.basename.replace(/\/$/, '')
    return this.options.history === 'hash' ? `#${path}` : prefix + path
  }

  /** Import the modules of the routes matching `to`, e.g. when a link is hovered. */
  abstract preload(to: string): Promise<void>

  /**
   * Add routes at runtime, e.g. the routes of a package loaded by the app.
   * A route without `parentId`, or whose parent is not among `routes`, is
   * mounted below its `parentId` (at the top without). A rendered app is
   * patched. The routes are removed when the calling plugin is disposed.
   */
  add(routes: RouteData[], modules: RouteModules<M> = {}) {
    return this.ctx.effect(() => {
      for (const route of routes) {
        if (this.options.routes[route.id]) throw new Error(`route ${route.id} exists already`)
      }
      for (const route of routes) this.options.routes[route.id] = route
      Object.assign(this.options.routeModules, modules)
      const state = this.patch(routes)
      return () => {
        for (const route of routes) {
          delete this.options.routes[route.id]
          delete this.options.routeModules[route.id]
          this._modules.delete(route.id)
        }
        this.unpatch(routes, state)
      }
    }, 'ctx.$router.add()')
  }

  /** Insert routes into the rendered router; the result is passed to `unpatch()`. */
  protected abstract patch(routes: RouteData[]): unknown
  /** Remove routes from the rendered router. */
  protected abstract unpatch(routes: RouteData[], state: unknown): void
}

/**
 * Fetch the data of a server `loader` from the loader endpoint below `base`.
 * The page URL is rewritten from `basename` (where the router runs) to
 * `base`; a redirect of the loader is passed to `redirect`, which throws it
 * the way the UI framework's router expects.
 */
export async function fetchLoader(options: {
  base: string
  id: string
  request: Request
  basename?: string
  redirect(location: string): never
}) {
  const { base, id, request, basename = base } = options
  const url = new URL(request.url)
  let path = url.pathname + url.search
  const prefix = new URL(base, 'http://localhost').pathname
  if (basename !== prefix && path.startsWith(basename)) path = prefix.replace(/\/$/, '') + '/' + path.slice(basename.length).replace(/^\//, '')
  const endpoint = `${base.replace(/\/$/, '')}/${LOADER_ENDPOINT}?route=${encodeURIComponent(id)}&url=${encodeURIComponent(path)}`
  const response = await fetch(endpoint, { signal: request.signal, headers: { accept: 'application/json' } })
  const location = response.headers.get(REDIRECT_HEADER)
  if (location) options.redirect(location)
  if (!response.ok) throw new Response(await response.text(), { status: response.status, statusText: response.statusText })
  return response.json()
}
