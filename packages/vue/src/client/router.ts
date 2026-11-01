import { fetchLoader, type Location, type RouteData, RouterService as BaseRouterService, type RouterOptions as BaseRouterOptions } from '@cormi/runtime'
import type { Context as CordisContext } from 'cordis'
import { computed, type ComputedRef, inject, type InjectionKey } from 'vue'
import {
  createRouter,
  matchedRouteKey,
  type RouteLocationNormalized,
  type RouteLocationRaw,
  type Router,
  type RouteRecordRaw,
  type RouterHistory,
  RouterView,
} from 'vue-router'
import type { RouteModule } from './types.ts'

export type { HistoryType } from '@cormi/runtime'

export interface RouterOptions extends BaseRouterOptions<RouteModule> {}

/** The data of the loaders of a router's current routes, by route id. */
export type LoaderData = Record<string, unknown>

export const loaderDataKey: InjectionKey<LoaderData> = Symbol('loader data')

/** A redirect, returned or thrown by a loader: `return redirect('/login')`. */
export function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } })
}

class Redirect {
  constructor(public location: string) {}
}

/** The value of a server loader: a redirect is thrown, a `Response` is read as JSON. */
async function unwrap(value: unknown) {
  if (!(value instanceof Response)) return value
  if (value.status >= 300 && value.status < 400) throw new Redirect(value.headers.get('location') ?? '/')
  return value.json()
}

/** Vue Router's path of a route: React Router's splats (`*`) are `:pathMatch(.*)*`. */
function toPath(route: RouteData) {
  if (route.index) return ''
  const path = (route.path ?? '').replace(/(^|\/)\*$/, '$1:pathMatch(.*)*')
  // routes at the top are absolute
  return route.parentId || path.startsWith('/') ? path : `/${path}`
}

export interface CreateRouterOptions {
  /** where the loaders run: `loader`s on the server, `clientLoader`s and fetched `loader`s in the browser */
  env: 'client' | 'server'
  history: RouterHistory
  /** the data of the loaders, written once a navigation is confirmed */
  data: LoaderData
  /** the data of the server-rendered page, used by the first navigation */
  hydrated?: LoaderData
  /** origin of the URLs given to loaders */
  origin: string
  /** called for a redirect of a loader, which then aborts the navigation; by default the router follows it */
  onRedirect?: (location: string) => void
}

/**
 * The router of a Vue app (`ctx.$router`), on Vue Router, which `render()`
 * creates. The routes are named by their ids.
 */
export class RouterService extends BaseRouterService<RouteModule> {
  declare options: RouterOptions

  /** the Vue Router instance, once rendered */
  router: Router | undefined

  constructor(ctx: CordisContext, options: RouterOptions) {
    super(ctx, options)
  }

  /** Import the modules of the routes matching `to` (a path below the basename), e.g. when a link is hovered. */
  async preload(to: string) {
    const matched = this.router?.resolve(to).matched ?? []
    await Promise.all(matched.map(record => this.load(record.name as string)))
  }

  href(location: Location) {
    return this.router ? this.router.resolve(location.pathname + location.search + location.hash).href : super.href(location)
  }

  navigate(to: RouteLocationRaw, options: { replace?: boolean } = {}) {
    if (!this.router) throw new Error('the app is not rendered yet')
    return options.replace ? this.router.replace(to) : this.router.push(to)
  }

  /** Add the topmost of `routes` to the rendered router; returns their ids. */
  protected patch(routes: RouteData[]) {
    const ids = new Set(routes.map(route => route.id))
    const roots = routes.filter(route => !route.parentId || !ids.has(route.parentId)).map(route => route.id)
    if (this.router) {
      for (const record of this.createRoutes(ids)) {
        const parentId = this.routes[record.name as string]?.parentId
        if (parentId && this.router.hasRoute(parentId)) this.router.addRoute(parentId, record)
        else this.router.addRoute(record)
      }
    }
    return roots
  }

  protected unpatch(_routes: RouteData[], roots: string[]) {
    for (const id of roots) {
      if (this.router?.hasRoute(id)) this.router.removeRoute(id)
    }
  }

  /**
   * The route records of Vue Router. With `only`, the trees of those routes
   * whose parent is not among them.
   */
  createRoutes(only?: Set<string>): RouteRecordRaw[] {
    const children = new Map<string | undefined, RouteData[]>()
    for (const route of Object.values(this.routes)) {
      if (only && !only.has(route.id)) continue
      const parentId = only && route.parentId && !only.has(route.parentId) ? undefined : route.parentId
      const siblings = children.get(parentId) ?? []
      siblings.push(route)
      children.set(parentId, siblings)
    }
    const build = (parentId?: string): RouteRecordRaw[] => (children.get(parentId) ?? []).map(route => ({
      path: toPath(route),
      name: route.id,
      meta: { ...route.meta, id: route.id },
      // a route without module only renders its children
      component: this.options.routeModules[route.id]
        ? () => this.load(route.id).then(module => module.default ?? RouterView)
        : RouterView,
      children: build(route.id),
    }) as RouteRecordRaw)
    return build()
  }

  /**
   * A Vue Router for the route table. The loaders of the matched routes run
   * before a navigation resolves; their data goes to `options.data` when it
   * is confirmed.
   */
  createRouter(options: CreateRouterOptions): Router {
    const router = createRouter({ history: options.history, routes: this.createRoutes() })
    let hydrated = options.hydrated
    let pending: LoaderData | undefined

    router.beforeResolve(async (to) => {
      const url = new URL(this.basename.replace(/\/$/, '') + to.fullPath, options.origin)
      try {
        const entries = await Promise.all(to.matched.map(async (record) => {
          const id = record.name as string
          const value = await this._runLoader(id, new Request(url), to, options.env, hydrated)
          return [id, value] as const
        }))
        hydrated = undefined
        pending = Object.fromEntries(entries.filter(([, value]) => value !== undefined))
      } catch (error) {
        if (!(error instanceof Redirect)) throw error
        if (!options.onRedirect) return error.location
        options.onRedirect(error.location)
        return false
      }
    })
    router.afterEach((_to, _from, failure) => {
      if (failure || !pending) return
      for (const key of Object.keys(options.data)) delete options.data[key]
      Object.assign(options.data, pending)
      pending = undefined
    })
    return router
  }

  private async _runLoader(id: string, request: Request, to: RouteLocationNormalized, env: 'client' | 'server', hydrated?: LoaderData) {
    const route = this.routes[id]
    if (!route?.hasLoader && !route?.hasClientLoader) return
    const params = to.params as Record<string, string | string[]>
    if (env === 'server') {
      if (!route.hasLoader) return
      return unwrap(await (await this.load(id)).loader!({ request, params }))
    }
    const serverLoader = () => hydrated && id in hydrated
      ? Promise.resolve(hydrated[id])
      : fetchLoader({
          base: this.origin + this.base,
          id,
          request,
          basename: this.basename,
          redirect: (location) => {
            throw new Redirect(location)
          },
        })
    if (route.hasClientLoader) return unwrap(await (await this.load(id)).clientLoader!({ request, params, serverLoader }))
    return serverLoader()
  }
}

/** The data of the current route's loader, in the component of that route. */
export function useLoaderData<T = unknown>(): ComputedRef<T> {
  const data = inject(loaderDataKey)!
  const record = inject(matchedRouteKey)!
  return computed(() => data[record.value?.name as string] as T)
}
