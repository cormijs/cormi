import { join } from 'node:path'
import { expandExtensions, getPackageName, getWorkspacePaths, tryPaths } from '@cormijs/core'
import type {} from '@cormijs/rsbuild'
import type {} from '@cormijs/vite'
import { Context } from 'cordis'
import { rsbuildReact, rsbuildRouteExports } from './rsbuild.ts'
import { renderEntry, renderRoutes, renderServer, renderTsconfig, TYPINGS } from './templates.ts'
import { viteReact, viteRouteExports } from './vite.ts'

/**
 * The React renderer. It generates the browser entry (`entry.tsx`) and the
 * server entry (`server.tsx`) from the contributions to `ctx.app` and the
 * route table of `ctx.router`, and adds the React plugins to the bundler;
 * the rendering options are the app's (`ctx.app.config`).
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
    vite: () => viteReact(packages),
    rsbuild: () => rsbuildReact(packages),
  })
  ctx.bundler.plugin({
    vite: () => viteRouteExports(isRouteFile),
    rsbuild: () => rsbuildRouteExports(isRouteFile),
  })

  ctx.app.file('tsconfig.json', () => renderTsconfig(getWorkspacePaths(ctx.app.dir, ctx.get('workspace')?.packages ?? {})))
  ctx.on('workspace/update', () => ctx.app.refresh())
  ctx.app.file('typings.d.ts', TYPINGS)
  ctx.app.file('routes.ts', () => renderRoutes(ctx.app.dir, ctx.router.routes))
  ctx.app.file('entry.tsx', () => renderEntry(ctx.app, {
    ...config,
    mountElementId: ctx.html.config.mountElementId,
    // src/loading: rendered while the first routes of a client-rendered app load
    loading: tryPaths(expandExtensions(join(ctx.cormi.paths.src, 'loading'), ['.tsx', '.jsx', '.ts', '.js'])),
    hotAccept: (imports, callback) => ctx.bundler.hotAccept(imports, callback),
  }))
  ctx.app.file('server.tsx', () => {
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
