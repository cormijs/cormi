import { IncomingMessage, ServerResponse as NodeServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { Readable } from 'node:stream'
import Server, * as pluginServer from '@cordisjs/plugin-server'
import { settle, start, type StartOptions, stop } from '@cormijs/core'
import type { TypedResponse } from '@cormijs/runtime'
import { type Context, Service } from 'cordis'
import { setRequestContext, type State, toResponse } from './middleware.ts'

const { Request: CordisRequest, Response: CordisResponse, ValidationError } = pluginServer as any

declare module '@cordisjs/plugin-server' {
  interface Server {
    /**
     * Dispatch a request through the middlewares and routes of `ctx.server`
     * in-process, without opening a network connection.
     */
    fetch(input: string | URL | globalThis.Request, init?: RequestInit): Promise<globalThis.Response>
  }
}

type Middleware = Parameters<Server['use']>[0]

/** A request of `ctx.server` (plugin-server does not export the type itself). */
export type ServerRequest = Parameters<Middleware>[0]

/** A response of `ctx.server`. */
export type ServerResponse = Parameters<Middleware>[1]

// In `test` mode, `ctx.server` registers middlewares and routes without binding a TCP port.
const originalInit = Server.prototype[Service.init]
Server.prototype[Service.init] = async function* (this: Server) {
  if (this.ctx.cormi?.mode === 'test') {
    this.host = this.config.host || 'localhost'
    this.port = this.config.port || 8000
    return
  }
  yield* originalInit.call(this)
}

Server.prototype.fetch = async function (this: Server, input: string | URL | globalThis.Request, init?: RequestInit): Promise<globalThis.Response> {
  const host = ['0.0.0.0', '::', ''].includes(this.host) ? 'localhost' : (this.host ?? 'localhost')
  const base = `http://${host}:${this.port || 8000}`
  const request = input instanceof globalThis.Request
    ? (init ? new globalThis.Request(input, init) : input)
    : new globalThis.Request(new URL(String(input), base), init)
  const url = new URL(request.url)

  const headers: Record<string, string> = { host: url.host }
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  const setCookies = typeof (request.headers as any).getSetCookie === 'function' ? (request.headers as any).getSetCookie() : []
  if (setCookies.length && !headers.cookie) headers.cookie = setCookies.join('; ')

  const bodyStream = request.body && request.method !== 'GET' && request.method !== 'HEAD'
    ? Readable.fromWeb(request.clone().body as any)
    : Readable.from([])
  const socket = { remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:' } as unknown as Socket
  const rawReq = Object.assign(bodyStream, {
    url: url.pathname + url.search,
    method: request.method,
    headers,
    socket,
  }) as unknown as IncomingMessage
  const rawRes = new NodeServerResponse(rawReq)

  setRequestContext(rawReq, { request, state: {} as State, ip: '127.0.0.1' })
  const req = new CordisRequest(rawReq)
  const res = new CordisResponse(rawRes)

  try {
    await this.ctx.waterfall(this, 'server/request', req, res, async () => {})
  } catch (error) {
    if (ValidationError && error instanceof ValidationError) {
      if (!res.claimed) {
        res.status = 422
        res.json({ issues: (error as any).issues })
      }
    } else {
      this.ctx.logger?.error(error)
      if (!res.claimed) {
        res.status = 500
      }
    }
  }
  return toResponse(res)
}

export interface CreateAppOptions extends Omit<StartOptions, 'cwd' | 'mode'> {
  /** root directory of the app (default `process.cwd()`) */
  cwd?: string
}

export interface TestApp {
  readonly ctx: Context
  /** Send an HTTP request to the app in-process, without starting a server or binding a port. */
  fetch(input: string | URL | globalThis.Request, init?: RequestInit): Promise<globalThis.Response>
  /** Dispose the app and its services. */
  close(): Promise<void>
}

/**
 * Load a Cormi app in `test` mode for in-process testing (`await app.fetch(request)`),
 * without starting a dev server or binding a network port.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<TestApp> {
  const ctx = await start({
    cwd: options.cwd ?? process.cwd(),
    mode: 'test',
    logger: options.logger ?? false,
    config: options.config,
  })
  try {
    await settle(ctx)
  } catch (error) {
    await stop(ctx)
    throw error
  }
  return {
    ctx,
    fetch(input, init) {
      const server = ctx.get('server')
      if (!server) throw new Error('ctx.server is not available: is @cormijs/preset in cormi.yml?')
      return server.fetch(input, init)
    },
    close() {
      return stop(ctx)
    },
  }
}

/** Create a JSON `Response` that preserves the compile-time type of `data` and `status`. */
export function json<T, S extends number = 200>(
  data: T,
  init?: S | (ResponseInit & { status?: S }),
): TypedResponse<T, S> {
  const responseInit = typeof init === 'number' ? { status: init } : init
  return Response.json(data, responseInit) as TypedResponse<T, S>
}

/** The origin of a request, from its `host` header; `https` behind a proxy that says so (`x-forwarded-proto`) or over TLS. */
export function getOrigin(req: ServerRequest) {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const protocol = forwarded || ((req._req.socket as { encrypted?: boolean })?.encrypted ? 'https' : 'http')
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
