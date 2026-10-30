import { Context as CordisContext, Service } from 'cordis'
import { Dict } from 'cosmokit'
import { type DataRouter, type Location, matchRoutes, type NavigateOptions, type NavigationType, Outlet, redirect, type RouteObject, type To } from 'react-router'
import { LOADER_ENDPOINT, REDIRECT_HEADER } from './constants.ts'
import type { RouteData, RouteModule, RouteModules } from './types.ts'

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

/** Route module exports that react-router reads lazily. */
const LAZY_KEYS = ['ErrorBoundary', 'HydrateFallback', 'handle', 'shouldRevalidate'] as const

export type HistoryType = 'browser' | 'hash' | 'memory'

export interface RouterOptions {
  routes: Dict<RouteData>
  routeModules: RouteModules
  /** basename of the app (default `/`) */
  base?: string
  history?: HistoryType
}

/**
 * The router of the app in the browser (`ctx.$router`). The react-router data
 * router is created by `render()`; `router/change` is emitted on navigation.
 */
export class RouterService extends Service {
  /** the react-router instance, once rendered */
  router: DataRouter | undefined
  /** basename of the router; differs from `base` when a host mounts the app below a path */
  basename: string
  /** origin of the app's server, when the app runs in a foreign page; requests of server loaders go there */
  origin = ''

  private _modules = new Map<string, Promise<RouteModule>>()

  constructor(ctx: CordisContext, public options: RouterOptions) {
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
  load(id: string): Promise<RouteModule> {
    let task = this._modules.get(id)
    if (!task) {
      const load = this.options.routeModules[id]
      task = load ? load() : Promise.resolve({})
      this._modules.set(id, task)
      task.catch(() => this._modules.delete(id))
    }
    return task
  }

  /** Import the modules of the routes matching `to` (a path below the basename), e.g. when a link is hovered. */
  async preload(to: string) {
    const matches = matchRoutes(this.createRoutes('client'), to) ?? []
    await Promise.all(matches.map(match => this.load(match.route.id!)))
  }

  navigate(to: To | null, options?: NavigateOptions) {
    if (!this.router) throw new Error('the app is not rendered yet')
    return this.router.navigate(to, options)
  }

  /** The route objects of react-router. On the client, server `loader`s are fetched. */
  createRoutes(env: 'client' | 'server'): RouteObject[] {
    const children = new Map<string | undefined, RouteData[]>()
    for (const route of Object.values(this.routes)) {
      const siblings = children.get(route.parentId) ?? []
      siblings.push(route)
      children.set(route.parentId, siblings)
    }
    const build = (parentId?: string): RouteObject[] => (children.get(parentId) ?? []).map((route) => {
      const object: RouteObject = {
        id: route.id,
        path: route.path,
        loader: this._createLoader(route, env),
        children: build(route.id),
      }
      if (route.index) Object.assign(object, { index: true, children: undefined })
      if (this.options.routeModules[route.id]) {
        object.lazy = async () => {
          const module = await this.load(route.id)
          const result: Record<string, unknown> = { Component: module.default ?? Outlet }
          for (const key of LAZY_KEYS) {
            if (module[key] !== undefined) result[key] = module[key]
          }
          return result
        }
      } else {
        // a route without module only renders its children
        object.Component = Outlet
      }
      return object
    })
    return build()
  }

  private _createLoader(route: RouteData, env: 'client' | 'server'): RouteObject['loader'] {
    if (env === 'server') {
      if (!route.hasLoader) return
      return async args => (await this.load(route.id)).loader!(args)
    }
    const serverLoader = (request: Request) => fetchLoader(this.origin + this.base, route.id, request, this.basename)
    if (route.hasClientLoader) {
      return async (args) => {
        const module = await this.load(route.id)
        return module.clientLoader!({ ...args, serverLoader: () => serverLoader(args.request) as any })
      }
    }
    if (route.hasLoader) return args => serverLoader(args.request)
  }
}

/**
 * Fetch the data of a server `loader` from the loader endpoint below `base`.
 * The page URL is rewritten from `basename` (where the router runs) to `base`.
 */
export async function fetchLoader(base: string, id: string, request: Request, basename = base) {
  const url = new URL(request.url)
  let path = url.pathname + url.search
  const prefix = new URL(base, 'http://localhost').pathname
  if (basename !== prefix && path.startsWith(basename)) path = prefix.replace(/\/$/, '') + '/' + path.slice(basename.length).replace(/^\//, '')
  const endpoint = `${base.replace(/\/$/, '')}/${LOADER_ENDPOINT}?route=${encodeURIComponent(id)}&url=${encodeURIComponent(path)}`
  const response = await fetch(endpoint, { signal: request.signal, headers: { accept: 'application/json' } })
  const location = response.headers.get(REDIRECT_HEADER)
  if (location) throw redirect(location)
  if (!response.ok) throw new Response(await response.text(), { status: response.status, statusText: response.statusText })
  return response.json()
}
