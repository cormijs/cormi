import type { Server } from '@cordisjs/plugin-server'

type Middleware = Parameters<Server['use']>[0]

/** A request of `ctx.server` (plugin-server does not export the type itself). */
export type ServerRequest = Parameters<Middleware>[0]

/** A response of `ctx.server`. */
export type ServerResponse = Parameters<Middleware>[1]

/** The origin of a request, from its `host` header. */
export function getOrigin(req: ServerRequest) {
  return `http://${req.headers.get('host') ?? 'localhost'}`
}

/** A fetch API `Request` for a request of `ctx.server`, optionally for another URL. */
export function toRequest(req: ServerRequest, url = req.url): Request {
  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers: req.headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body
    init.duplex = 'half'
  }
  return new Request(new URL(url, getOrigin(req)), init)
}

/** Write a fetch API `Response` into a response of `ctx.server`. */
export function send(req: ServerRequest, res: ServerResponse, response: Response) {
  res.status = response.status
  response.headers.forEach((value, key) => res.headers.set(key, value))
  res.body = req.method === 'HEAD' ? null : response.body
}
