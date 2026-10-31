import React, { type ComponentType } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createBrowserRouter, createHashRouter, createMemoryRouter, matchRoutes, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Root } from './app.tsx'
import type { Context } from './context.ts'
import type { HistoryType } from './router.ts'

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

// react-router is read when the app renders, not when this module is evaluated:
// shared by module federation, it may be resolved later than this module
function createRouter(history: HistoryType, ...args: Parameters<typeof createBrowserRouter>) {
  if (history === 'hash') return createHashRouter(...args)
  if (history === 'memory') return createMemoryRouter(...args)
  return createBrowserRouter(...args)
}

/** The lazy routes matching the initial location must be loaded before hydration. */
async function resolveLazyRoutes(routes: RouteObject[], pathname: string, base: string) {
  const matches = matchRoutes(routes, pathname, base) ?? []
  await Promise.all(matches.map(async ({ route }) => {
    if (typeof route.lazy !== 'function') return
    Object.assign(route, await route.lazy())
    route.lazy = undefined
  }))
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
  const routes = $router.createRoutes('client')
  // server-rendered markup only belongs to the app's own document
  const hydrationData = options.container ? undefined : window.__staticRouterHydrationData
  if (hydrationData) await resolveLazyRoutes(routes, window.location.pathname, $router.basename)
  const router = createRouter($router.options.history ?? 'browser', routes, { basename: $router.basename, hydrationData })
  $router.router = router

  let location = router.state.location
  ctx.emit('router/change', location, router.state.historyAction)
  const unsubscribe = router.subscribe((state) => {
    if (state.location === location) return
    location = state.location
    ctx.emit('router/change', location, state.historyAction)
  })

  const container = options.container ?? document.getElementById(options.mountElementId)
  if (!container) throw new Error(`cannot find the mount element #${options.mountElementId}`)
  const element = <Root ctx={ctx}><RouterProvider router={router} /></Root>
  const root = hydrationData ? hydrateRoot(container, element) : createRoot(container)
  if (!hydrationData) root.render(element)
  // stylesheets linked by the dev server; the modules have injected the same styles by now
  for (const link of document.querySelectorAll('link[data-cormi-dev]')) link.remove()
  ctx.emit('app/mount')

  return () => {
    unsubscribe()
    root.unmount()
    router.dispose()
    $router.router = undefined
  }
}

/**
 * Render a single page, without a router (a page of a multi-page app). The
 * wrappers of the runtime plugins apply; returns a function that unmounts it.
 */
export function renderPage(ctx: Context, Page: ComponentType, options: RenderOptions) {
  const container = options.container ?? document.getElementById(options.mountElementId)
  if (!container) throw new Error(`cannot find the mount element #${options.mountElementId}`)
  if (options.props) ctx.$app.setProps(options.props)
  const root = createRoot(container)
  root.render(<Root ctx={ctx}><Page /></Root>)
  ctx.emit('app/mount')
  return () => root.unmount()
}
