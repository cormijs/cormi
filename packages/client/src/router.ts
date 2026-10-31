import { Context as CordisContext, Service } from 'cordis'
import type { ComponentType } from 'react'
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
  /** rendered while the first routes of a client-rendered app load (`src/loading`) */
  loading?: ComponentType
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

  /**
   * Add routes at runtime, e.g. the routes of a package loaded by the app.
   * A route without `parentId`, or whose parent is not among `routes`, is
   * mounted below its `parentId` (at the top without). A rendered app is
   * patched. The routes are removed when the calling plugin is disposed.
   */
  add(routes: RouteData[], modules: RouteModules = {}) {
    return this.ctx.effect(() => {
      for (const route of routes) {
        if (this.options.routes[route.id]) throw new Error(`route ${route.id} exists already`)
      }
      for (const route of routes) this.options.routes[route.id] = route
      Object.assign(this.options.routeModules, modules)
      const roots = this._patch(routes)
      return () => {
        for (const route of routes) {
          delete this.options.routes[route.id]
          delete this.options.routeModules[route.id]
          this._modules.delete(route.id)
        }
        this._unpatch(roots)
      }
    }, 'ctx.$router.add()')
  }

  /** Insert the topmost of `routes` into the rendered router; returns them by parent. */
  private _patch(routes: RouteData[]) {
    const ids = new Set(routes.map(route => route.id))
    const roots = new Map<string | undefined, string[]>()
    for (const route of routes) {
      if (route.parentId && ids.has(route.parentId)) continue
      roots.set(route.parentId, [...roots.get(route.parentId) ?? [], route.id])
    }
    if (this.router) {
      const objects = this.createRoutes('client', ids)
      for (const [parentId, children] of roots) {
        this.router.patchRoutes(parentId ?? null, objects.filter(object => children.includes(object.id!)))
      }
    }
    return roots
  }

  private _unpatch(roots: Map<string | undefined, string[]>) {
    const router = this.router
    if (!router) return
    // react-router can only add routes: remove them from the tree and its manifest, then refresh its branches
    const forget = (route: RouteObject) => {
      delete router.manifest[route.id!]
      route.children?.forEach(forget)
    }
    for (const [parentId, children] of roots) {
      const siblings = parentId ? router.manifest[parentId]?.children : router.routes as RouteObject[]
      if (!siblings) continue
      for (let index = siblings.length - 1; index >= 0; index--) {
        if (!children.includes(siblings[index].id!)) continue
        forget(siblings[index])
        siblings.splice(index, 1)
      }
      router.patchRoutes(parentId ?? null, [])
    }
  }

  /**
   * The route objects of react-router. On the client, server `loader`s are
   * fetched. With `only`, the trees of those routes whose parent is not
   * among them.
   */
  createRoutes(env: 'client' | 'server', only?: Set<string>): RouteObject[] {
    const children = new Map<string | undefined, RouteData[]>()
    for (const route of Object.values(this.routes)) {
      if (only && !only.has(route.id)) continue
      const parentId = only && route.parentId && !only.has(route.parentId) ? undefined : route.parentId
      const siblings = children.get(parentId) ?? []
      siblings.push(route)
      children.set(parentId, siblings)
    }
    const build = (parentId?: string): RouteObject[] => (children.get(parentId) ?? []).map((route) => {
      const object: RouteObject = {
        id: route.id,
        path: route.path,
        loader: this._createLoader(route, env),
        children: build(route.id),
      }
      if (route.index) Object.assign(object, { index: true, children: undefined })
      if (!route.parentId && env === 'client' && this.options.loading) object.HydrateFallback = this.options.loading
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
