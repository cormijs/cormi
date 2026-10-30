import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createBrowserRouter, createHashRouter, createMemoryRouter, matchRoutes, type RouteObject } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Root } from './app.tsx'
import type { Context } from './context.ts'

export interface RenderOptions {
  /** id of the element the app is mounted into */
  mountElementId: string
}

const createRouter = {
  browser: createBrowserRouter,
  hash: createHashRouter,
  memory: createMemoryRouter,
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
  const { $router } = ctx
  const routes = $router.createRoutes('client')
  const hydrationData = window.__staticRouterHydrationData
  if (hydrationData) await resolveLazyRoutes(routes, window.location.pathname, $router.base)
  const router = createRouter[$router.options.history ?? 'browser'](routes, { basename: $router.base, hydrationData })
  $router.router = router

  let location = router.state.location
  ctx.emit('router/change', location, router.state.historyAction)
  const unsubscribe = router.subscribe((state) => {
    if (state.location === location) return
    location = state.location
    ctx.emit('router/change', location, state.historyAction)
  })

  const container = document.getElementById(options.mountElementId)
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
