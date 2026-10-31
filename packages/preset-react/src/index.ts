import Server from '@cordisjs/plugin-server'
import { App, Html, Router, Schema } from '@cormi/core'
import { ApiRoutes, Pages, Proxy, Static } from '@cormi/server'
import Vite from '@cormi/vite'
import { Context } from 'cordis'
import { Conventions } from './conventions.ts'
import { Renderer } from './renderer.ts'

export * from './conventions.ts'
export * from './renderer.ts'
export * from './route-exports.ts'
export * from './templates.ts'

export const name = 'preset-react'

export interface Config extends Router.Config, Html.Config, Vite.Config, Renderer.Config {
  /** host of the dev and preview server */
  host: string
  /** port of the dev and preview server; the next free port is used if taken */
  port: number
  /** forward requests to other servers in dev and preview mode: `{ '/api': 'http://localhost:3000' }` */
  proxy: Proxy.Config
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    host: Schema.string().default(process.env.HOST ?? 'localhost').description('host of the dev and preview server'),
    port: Schema.natural().max(65535).default(Number(process.env.PORT) || 8000).description('port of the dev and preview server'),
    proxy: Proxy.Config.description('forward requests to other servers in dev and preview mode'),
  }),
  Renderer.Config,
  Router.Config,
  Html.Config,
  Vite.Config,
]) as Schema<Config>

/**
 * A React app: the router, html, app and vite services, the React renderer,
 * the file conventions, pages and API routes, and — in dev and preview
 * mode — the HTTP server.
 *
 * Every part is a plugin of its own, so the services can also be composed
 * without this preset.
 */
export function apply(ctx: Context, config: Config) {
  const { mode } = ctx.cormi
  ctx.plugin(Router, config)
  ctx.plugin(Html, config)
  ctx.plugin(App)
  ctx.plugin(Vite, config)
  ctx.plugin(Renderer, config)
  ctx.plugin(Conventions)
  ctx.plugin(Pages, config)
  ctx.plugin(ApiRoutes)
  if (mode === 'dev' || mode === 'preview') {
    // `cormi dev --port` and `--host` win over the config
    const host = process.env.CORMI_HOST || config.host
    const port = Number(process.env.CORMI_PORT) || config.port
    ctx.plugin(Server, { host, port, maxPort: port + 99 })
    ctx.plugin(Proxy, config.proxy)
    if (mode === 'preview') ctx.plugin(Static)
  }
}
