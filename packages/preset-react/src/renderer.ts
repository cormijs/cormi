import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { expandExtensions, Schema, tryPaths } from '@cormi/core'
import type {} from '@cormi/vite'
import { Context } from 'cordis'
import { SCRIPT_EXTENSIONS } from './conventions.ts'
import { routeExportsPlugin } from './route-exports.ts'
import { getPackageName, getWorkspacePaths, renderEntry, renderRoutes, renderServer, renderTsconfig, TYPINGS } from './templates.ts'

/**
 * The React renderer. It generates the browser entry (`entry.tsx`) and the
 * server entry (`server.tsx`) from the contributions to `ctx.app` and the
 * route table of `ctx.router`, and adds the React plugins to Vite.
 */
export function Renderer(ctx: Context, config: Renderer.Config) {
  let routeFiles = new Set<string>()
  const updateRouteFiles = () => {
    routeFiles = new Set(Object.values(ctx.router.routes).map(route => route.file!).filter(Boolean))
  }
  updateRouteFiles()

  ctx.vite.plugin(() => react())
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
    loading: tryPaths(expandExtensions(join(ctx.cormi.paths.src, 'loading'), SCRIPT_EXTENSIONS)),
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

  export interface Config {
    /** basename of the app */
    base: string
    history: 'browser' | 'hash' | 'memory'
    /** render pages on the server */
    ssr: boolean
  }

  export const Config: Schema<Config> = Schema.object({
    base: Schema.string().default('/').description('basename of the app'),
    history: Schema.union(['browser', 'hash', 'memory'] as const).default('browser'),
    ssr: Schema.boolean().default(false).description('render pages on the server'),
  })
}
