import { Schema } from '@cormi/core'
import { Context } from 'cordis'
import { send, toRequest } from './http.ts'

export interface ProxyOptions {
  /** the server requests are forwarded to */
  target: string
  /** send the target's host instead of this server's (`x-forwarded-host` keeps the original) */
  changeOrigin?: boolean
  /** rewrite the path: `{ '^/api': '' }` */
  pathRewrite?: Record<string, string>
  /** headers added to forwarded requests */
  headers?: Record<string, string>
}

// hop-by-hop headers, and those `fetch()` recomputes after decoding the body
const DROPPED_REQUEST = ['host', 'connection', 'keep-alive', 'upgrade', 'transfer-encoding', 'content-length']
const DROPPED_RESPONSE = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length']

/**
 * Forward requests whose path starts with a key of the config to another
 * server, like the `proxy` of umi and Vite (without websockets). Requests are
 * forwarded with `fetch()` and streamed back.
 */
export function Proxy(ctx: Context, config: Proxy.Config) {
  const rules = Object.entries(config).map(([prefix, value]) => {
    const options: ProxyOptions = typeof value === 'string' ? { target: value, changeOrigin: true } : value
    return { prefix, options, rewrites: Object.entries(options.pathRewrite ?? {}).map(([from, to]) => [new RegExp(from), to] as const) }
  })
  if (!rules.length) return

  ctx.server.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    const rule = rules.find(rule => url.pathname.startsWith(rule.prefix))
    if (!rule) return next()

    let path = url.pathname
    for (const [from, to] of rule.rewrites) path = path.replace(from, to)
    const target = new URL(rule.options.target)
    target.pathname = (target.pathname.replace(/\/$/, '') + path) || '/'
    target.search = url.search

    const request = toRequest(req)
    const headers = new Headers(request.headers)
    for (const name of DROPPED_REQUEST) headers.delete(name)
    const host = req.headers.get('host')
    if (host) {
      headers.set('x-forwarded-host', host)
      if (!rule.options.changeOrigin) headers.set('host', host)
    }
    headers.set('x-forwarded-proto', 'http')
    for (const [name, value] of Object.entries(rule.options.headers ?? {})) headers.set(name, value)

    let response: Response
    try {
      response = await fetch(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
        duplex: 'half',
      } as RequestInit)
    } catch (error) {
      ctx.logger('proxy').warn('failed to proxy %s to %s: %s', url.pathname, target.href, (error as Error).message)
      return send(req, res, new Response(`proxy error: ${(error as Error).message}`, { status: 502 }))
    }
    const responseHeaders = new Headers(response.headers)
    for (const name of DROPPED_RESPONSE) responseHeaders.delete(name)
    send(req, res, new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders }))
  })
}

export namespace Proxy {
  export const inject = ['server']

  export type Config = Record<string, string | ProxyOptions>

  export const Config: Schema<Config> = Schema.dict(Schema.union([
    Schema.string(),
    Schema.object({
      target: Schema.string().required(),
      changeOrigin: Schema.boolean(),
      pathRewrite: Schema.dict(String),
      headers: Schema.dict(String),
    }) as Schema<ProxyOptions>,
  ])).default({})
}
