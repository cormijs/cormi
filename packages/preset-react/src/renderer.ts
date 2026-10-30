import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { watch } from 'chokidar'
import { expandExtensions, Schema, tryPaths } from '@cormi/core'
import type {} from '@cormi/vite'
import { Context } from 'cordis'
import { routeExportsPlugin } from './route-exports.ts'
import { renderEntry, renderRoutes, renderServer, renderTsconfig, TYPINGS } from './templates.ts'

const APP_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']

/**
 * The React renderer. It generates the browser entry (`entry.tsx`) and the
 * server entry (`server.tsx`) from the contributions to `ctx.app` and the
 * route table of `ctx.router`, and adds the React plugins to Vite.
 *
 * `src/app` is the runtime plugin of the app itself: its default export
 * receives the browser context, like the runtime plugins of other plugins.
 */
export function Renderer(ctx: Context, config: Renderer.Config) {
  let routeFiles = new Set<string>()
  const updateRouteFiles = () => {
    routeFiles = new Set(Object.values(ctx.router.routes).map(route => route.file!).filter(Boolean))
  }
  updateRouteFiles()

  ctx.vite.plugin(() => react())
  ctx.vite.plugin(() => routeExportsPlugin({ isRouteFile: file => routeFiles.has(file) }))

  ctx.app.file('tsconfig.json', renderTsconfig())
  ctx.app.file('typings.d.ts', TYPINGS)
  ctx.app.file('routes.ts', () => renderRoutes(ctx.app.dir, ctx.router.routes))
  ctx.app.file('entry.tsx', () => renderEntry(ctx.app, { ...config, mountElementId: ctx.html.config.mountElementId }))
  ctx.app.file('server.tsx', () => {
    const hasLoader = Object.values(ctx.router.routes).some(route => route.exports?.includes('loader'))
    if (config.ssr || hasLoader || ctx.app.servers.size) return renderServer(ctx.app, config)
  })
  ctx.on('router/update', () => {
    updateRouteFiles()
    ctx.app.refresh()
  })

  const { paths } = ctx.cormi
  let disposeApp: (() => void) | undefined
  const updateApp = () => {
    const file = tryPaths(expandExtensions(join(paths.src, 'app'), APP_EXTENSIONS))
    if (file && !disposeApp) {
      disposeApp = ctx.app.entry(file)
    } else if (!file && disposeApp) {
      disposeApp()
      disposeApp = undefined
    }
  }
  updateApp()
  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(paths.src, { ignoreInitial: true, depth: 0 })
      watcher.on('add', updateApp).on('unlink', updateApp)
      return () => watcher.close()
    }, 'watch src/app')
  }
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
