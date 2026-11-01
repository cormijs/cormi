import type { Location, NavigationType } from '@cormi/runtime'
import { type App, createApp, createSSRApp, shallowReactive } from 'vue'
import { createMemoryHistory, createWebHashHistory, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { cordisKey, createRoot } from './app.ts'
import type { Context } from './context.ts'
import { type HistoryType, type LoaderData, loaderDataKey } from './router.ts'

export interface RenderOptions {
  /** id of the element the app is mounted into */
  mountElementId: string
  /**
   * Render into this element instead, without hydrating: the app is mounted
   * by a host, e.g. a micro-frontend framework.
   */
  container?: Element
  /** basename of the router, when the host mounts the app below a path */
  basename?: string
  /** origin of the app's own server, when the app runs in a foreign page */
  origin?: string
  /** props of the host, read with `useHostProps()` */
  props?: Record<string, any>
}

function createHistory(type: HistoryType, base: string) {
  if (type === 'hash') return createWebHashHistory(base)
  if (type === 'memory') return createMemoryHistory(base)
  return createWebHistory(base)
}

function toLocation(route: RouteLocationNormalized): Location {
  const search = route.fullPath.slice(route.path.length).split('#')[0]
  return { pathname: route.path, search, hash: route.hash, state: window.history.state }
}

/** A Vue app of the context: its root, its Vue plugins and its router. */
export function createVueApp(ctx: Context, data: LoaderData, hydrate: boolean): App {
  const app = (hydrate ? createSSRApp : createApp)(createRoot(ctx))
  app.provide(cordisKey, ctx)
  app.provide(loaderDataKey, data)
  ctx.$app.install(app)
  return app
}

/**
 * Render the app into the page, hydrating server-rendered markup if any.
 * Returns a function that unmounts the app.
 */
export async function render(ctx: Context, options: RenderOptions) {
  const { $app, $router } = ctx
  $router.basename = options.basename ?? $router.base
  $router.origin = options.origin ?? ''
  if (options.props) $app.setProps(options.props)
  // server-rendered markup only belongs to the app's own document
  const hydration = options.container ? undefined : window.__staticRouterHydrationData
  const container = options.container ?? document.getElementById(options.mountElementId)
  if (!container) throw new Error(`cannot find the mount element #${options.mountElementId}`)

  const data = shallowReactive<LoaderData>({})
  const router = $router.createRouter({
    env: 'client',
    history: createHistory($router.options.history ?? 'browser', $router.basename),
    data,
    hydrated: hydration?.loaderData,
    origin: window.location.origin,
  })
  $router.router = router

  // how the next location is reached: Vue Router does not tell
  let action: NavigationType = 'POP'
  const { push, replace } = router
  router.push = (to) => {
    action = 'PUSH'
    return push(to)
  }
  router.replace = (to) => {
    action = 'REPLACE'
    return replace(to)
  }
  const stopListening = router.options.history.listen(() => {
    action = 'POP'
  })
  router.afterEach((to, _from, failure) => {
    if (!failure) ctx.emit('router/change', toLocation(to), action)
  })

  let app = createVueApp(ctx, data, !!hydration)
  app.use(router)
  await router.isReady()
  app.mount(container)
  // stylesheets linked by the dev server; the modules have injected the same styles by now
  for (const link of document.querySelectorAll('link[data-cormi-dev]')) link.remove()
  ctx.emit('app/mount')

  // Vue plugins cannot be uninstalled: the app is mounted again without the disposed one
  const unsubscribe = $app.subscribe((remount) => {
    if (!remount) return
    app.unmount()
    app = createVueApp(ctx, data, false)
    app.use(router)
    app.mount(container)
  })

  return () => {
    unsubscribe()
    stopListening()
    app.unmount()
    $router.router = undefined
  }
}
