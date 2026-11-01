import { getPackageName, getWorkspacePaths } from '@cormi/core'
import type {} from '@cormi/rsbuild'
import type {} from '@cormi/vite'
import { Context } from 'cordis'
import { rsbuildRouteExports, rsbuildVue } from './rsbuild.ts'
import { renderEntry, renderRoutes, renderServer, renderTsconfig, TYPINGS } from './templates.ts'
import { viteRouteExports, viteVue } from './vite.ts'

/**
 * The Vue renderer. It generates the browser entry (`entry.ts`) and the
 * server entry (`server.ts`) from the contributions to `ctx.app` and the
 * route table of `ctx.router`, and adds the Vue plugins to the bundler; the
 * rendering options are the app's (`ctx.app.config`).
 */
export function Renderer(ctx: Context) {
  const config = ctx.app.config
  let routeFiles = new Set<string>()
  const updateRouteFiles = () => {
    routeFiles = new Set(Object.values(ctx.router.routes).map(route => route.file!).filter(Boolean))
  }
  updateRouteFiles()

  const packages = () => [...ctx.app.entries].map(entry => getPackageName(entry.file)).filter(Boolean) as string[]
  const isRouteFile = (file: string) => routeFiles.has(file)
  ctx.bundler.plugin({
    vite: () => viteVue(packages),
    rsbuild: () => rsbuildVue(packages),
  })
  ctx.bundler.plugin({
    vite: () => viteRouteExports(isRouteFile),
    rsbuild: () => rsbuildRouteExports(isRouteFile),
  })

  ctx.app.file('tsconfig.json', () => renderTsconfig(getWorkspacePaths(ctx.app.dir, ctx.get('workspace')?.packages ?? {})))
  ctx.on('workspace/update', () => ctx.app.refresh())
  ctx.app.file('typings.d.ts', TYPINGS)
  ctx.app.file('routes.ts', () => renderRoutes(ctx.app.dir, ctx.router.routes))
  ctx.app.file('entry.ts', () => renderEntry(ctx.app, {
    ...config,
    mountElementId: ctx.html.config.mountElementId,
    hotAccept: (imports, callback) => ctx.bundler.hotAccept(imports, callback),
  }))
  ctx.app.file('server.ts', () => {
    const hasLoader = Object.values(ctx.router.routes).some(route => route.exports?.includes('loader'))
    if (config.ssr || hasLoader || ctx.app.servers.size) return renderServer(ctx.app, config)
  })
  ctx.on('router/update', () => {
    updateRouteFiles()
    ctx.app.refresh()
  })
}

export namespace Renderer {
  export const inject = ['app', 'html', 'router', 'bundler']
}
