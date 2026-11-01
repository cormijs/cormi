import { fetchLoader, type RouteData, RouterService as BaseRouterService, type RouterOptions as BaseRouterOptions } from '@cormi/runtime'
import type { Context as CordisContext } from 'cordis'
import type { ComponentType } from 'react'
import { type DataRouter, matchRoutes, type NavigateOptions, Outlet, redirect, type RouteObject, type To } from 'react-router'
import type { RouteModule } from './types.ts'

/** Route module exports that react-router reads lazily. */
const LAZY_KEYS = ['ErrorBoundary', 'HydrateFallback', 'handle', 'shouldRevalidate'] as const

export type { HistoryType } from '@cormi/runtime'

export interface RouterOptions extends BaseRouterOptions<RouteModule> {
  /** rendered while the first routes of a client-rendered app load (`src/loading`) */
  loading?: ComponentType
}

/**
 * The router of a React app (`ctx.$router`), on react-router's data router,
 * which `render()` creates.
 */
export class RouterService extends BaseRouterService<RouteModule> {
  declare options: RouterOptions

  /** the react-router instance, once rendered */
  router: DataRouter | undefined

  constructor(ctx: CordisContext, options: RouterOptions) {
    super(ctx, options)
  }

  /** Import the modules of the routes matching `to` (a path below the basename), e.g. when a link is hovered. */
  async preload(to: string) {
    const matches = matchRoutes(this.createRoutes('client'), to) ?? []
    await Promise.all(matches.map(match => this.load(match.route.id!)))
  }

  href(location: Parameters<BaseRouterService['href']>[0]) {
    return this.router ? this.router.createHref({ state: null, key: 'default', ...location }) : super.href(location)
  }

  navigate(to: To | null, options?: NavigateOptions) {
    if (!this.router) throw new Error('the app is not rendered yet')
    return this.router.navigate(to, options)
  }

  /** Insert the topmost of `routes` into the rendered router; returns them by parent. */
  protected patch(routes: RouteData[]) {
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

  protected unpatch(_routes: RouteData[], roots: Map<string | undefined, string[]>) {
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
    const serverLoader = (request: Request) => fetchLoader({
      base: this.origin + this.base,
      id: route.id,
      request,
      basename: this.basename,
      redirect: (location) => {
        throw redirect(location)
      },
    })
    if (route.hasClientLoader) {
      return async (args) => {
        const module = await this.load(route.id)
        return module.clientLoader!({ ...args, serverLoader: () => serverLoader(args.request) as any })
      }
    }
    if (route.hasLoader) return args => serverLoader(args.request)
  }
}
