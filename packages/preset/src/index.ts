import Server from '@cordisjs/plugin-server'
import { Console } from '@cormijs/console'
import { App, Html, Router, Schema } from '@cormijs/core'
import { ApiRoutes, Pages, Proxy, Static } from '@cormijs/server'
import { Context } from 'cordis'
import { Conventions } from './conventions.ts'
import { Generators } from './generators.ts'

export * from './conventions.ts'
export * from './generators.ts'

export const name = 'preset'

export interface Config extends Router.Config, Html.Config, App.Config {
  /** host of the dev and preview server */
  host: string
  /** port of the dev and preview server; the next free port is used if taken */
  port: number
  /** forward requests to other servers in dev and preview mode: `{ '/api': 'http://localhost:3000' }` */
  proxy: Proxy.Config
  /** the console at `/__cormi/` in dev mode, or `false` */
  console: false | Console.Config
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    host: Schema.string().default(process.env.HOST ?? 'localhost').description('host of the dev and preview server'),
    port: Schema.natural().max(65535).default(Number(process.env.PORT) || 8000).description('port of the dev and preview server'),
    proxy: Proxy.Config.description('forward requests to other servers in dev and preview mode'),
    console: Schema.union([Schema.const(false), Console.Config]).default(Console.Config({} as Console.Config)).description('the console in dev mode, or false'),
  }),
  App.Config,
  Router.Config,
  Html.Config,
]) as Schema<Config>

/**
 * The app, without its bundler and its UI framework: the router, html and
 * app services, the file conventions, pages and API routes, and — in dev and
 * preview mode — the HTTP server, with the console in dev mode.
 *
 * Add a bundler (`@cormijs/vite`) and a UI framework (`@cormijs/react`) next to
 * it in cormi.yml, or use a preset of both, e.g. `@cormijs/preset-react`.
 */
export function apply(ctx: Context, config: Config) {
  const { mode } = ctx.cormi
  ctx.plugin(Router, config)
  ctx.plugin(Html, config)
  ctx.plugin(App, { base: config.base, history: config.history, ssr: config.ssr })
  ctx.plugin(Conventions)
  ctx.plugin(Generators)
  ctx.plugin(Pages, { ssr: config.ssr, base: config.base })
  ctx.plugin(ApiRoutes)
  if (mode === 'dev' || mode === 'preview') {
    // `cormi dev --port` and `--host` win over the config
    const host = process.env.CORMI_HOST || config.host
    const port = Number(process.env.CORMI_PORT) || config.port
    ctx.plugin(Server, { host, port, maxPort: port + 99 })
    ctx.plugin(Proxy, config.proxy)
    if (mode === 'preview') ctx.plugin(Static)
    if (mode === 'dev' && config.console) ctx.plugin(Console, config.console)
  }
}
