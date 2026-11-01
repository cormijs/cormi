import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { expandExtensions, tryPaths } from '@cormi/core'
import type {} from '@cormi/vite'
import { Context } from 'cordis'
import { routeExportsPlugin } from './route-exports.ts'
import { getPackageName, getWorkspacePaths, renderEntry, renderRoutes, renderServer, renderTsconfig, TYPINGS } from './templates.ts'

/**
 * The React renderer. It generates the browser entry (`entry.tsx`) and the
 * server entry (`server.tsx`) from the contributions to `ctx.app` and the
 * route table of `ctx.router`, and adds the React plugins to Vite; the
 * rendering options are the app's (`ctx.app.config`).
 */
export function Renderer(ctx: Context) {
  const config = ctx.app.config
  let routeFiles = new Set<string>()
  const updateRouteFiles = () => {
    routeFiles = new Set(Object.values(ctx.router.routes).map(route => route.file!).filter(Boolean))
  }
  updateRouteFiles()

  ctx.vite.plugin(() => react())
  ctx.vite.configure({
    // resolved from the app root: only packages the app depends on itself
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'] },
    // one instance of the React API, shared by the server entry, the pages and the runtime plugins
    ssr: { external: ['@cormi/react', '@cormi/runtime'] },
  })
  ctx.vite.plugin(() => routeExportsPlugin({ isRouteFile: file => routeFiles.has(file) }))
  // runtime plugins of packages may ship TypeScript sources: bundle them into the server entry
  ctx.vite.configure((config) => {
    const packages = [...ctx.app.entries].map(entry => getPackageName(entry.file)).filter(Boolean) as string[]
    if (!packages.length) return
    const noExternal = config.ssr?.noExternal
    if (noExternal === true) return
    config.ssr = { ...config.ssr, noExternal: [...[noExternal ?? []].flat(), ...packages] }
    return config
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
  export const inject = ['app', 'html', 'router', 'vite']
}
