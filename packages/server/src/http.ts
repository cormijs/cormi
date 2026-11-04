import type { Server } from '@cordisjs/plugin-server'

type Middleware = Parameters<Server['use']>[0]

/** A request of `ctx.server` (plugin-server does not export the type itself). */
export type ServerRequest = Parameters<Middleware>[0]

/** A response of `ctx.server`. */
export type ServerResponse = Parameters<Middleware>[1]

/** The origin of a request, from its `host` header; `https` behind a proxy that says so (`x-forwarded-proto`) or over TLS. */
export function getOrigin(req: ServerRequest) {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const protocol = forwarded || ((req._req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http')
  return `${protocol}://${req.headers.get('host') ?? 'localhost'}`
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
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.headers.set(key, value)
  })
  // the headers of ctx.server would join several cookies into one: they go to the response of Node
  res.headers.delete('set-cookie')
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res._res.setHeader('set-cookie', cookies)
  else res._res.removeHeader('set-cookie')
  res.body = req.method === 'HEAD' ? null : response.body
}

/** The cookies of a request, by name. */
export function getCookies(request: Request): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of request.headers.get('cookie')?.split(';') ?? []) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    if (!name || name in cookies) continue
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim().replace(/^"(.*)"$/, '$1'))
    } catch {}
  }
  return cookies
}

export interface CookieOptions {
  /** in seconds; 0 deletes the cookie */
  maxAge?: number
  path?: string
  domain?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}

/** Add a `set-cookie` header to a response. */
export function setCookie(response: Response, name: string, value: string, options: CookieOptions = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}`
  if (options.maxAge !== undefined) cookie += `; Max-Age=${Math.floor(options.maxAge)}`
  cookie += `; Path=${options.path ?? '/'}`
  if (options.domain) cookie += `; Domain=${options.domain}`
  if (options.httpOnly) cookie += '; HttpOnly'
  if (options.secure) cookie += '; Secure'
  if (options.sameSite) cookie += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`
  response.headers.append('set-cookie', cookie)
}
