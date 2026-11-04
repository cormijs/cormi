import type {} from '@cordisjs/plugin-server'
import { Context, Service } from 'cordis'
import { send, type ServerRequest, type ServerResponse, toRequest } from './http.ts'

declare module 'cordis' {
  interface Context {
    middleware: MiddlewareService
  }
}

/**
 * The state of a request, shared by the middlewares, the API routes and the
 * loaders of pages. Plugins extend it:
 *
 * ```ts
 * declare module '@cormijs/server' {
 *   interface State { session: Session }
 * }
 * ```
 */
export interface State {}

/** What a request carries besides itself, for middlewares, API routes and loaders. */
export interface RequestContext {
  state: State
  /** the address of the client; behind a proxy, the proxy's (see `x-forwarded-for`) */
  ip: string
}

/**
 * A middleware of the app: it receives the request, and returns the response
 * of `next()` (the middlewares after it, the routes and the pages), changed
 * or not, or a response of its own.
 */
export type Middleware = (request: Request, context: RequestContext, next: () => Promise<Response>) => Awaitable<Response>

interface Entry {
  middleware: Middleware
  order: number
  path: string
}

type Awaitable<T> = T | Promise<T>

// by the request of Node: the middlewares and the routes of `ctx.server` receive different objects for a request
const requests = new WeakMap<object, RequestContext & { request: Request }>()

/**
 * The fetch API request, the state and the client of a request of
 * `ctx.server`: one of each per request, so that the body is read once and
 * the state is shared.
 */
export function getRequestContext(req: ServerRequest): RequestContext & { request: Request } {
  let value = requests.get(req._req)
  if (!value) {
    const ip = req._req.socket.remoteAddress?.replace(/^::ffff:/, '') ?? ''
    requests.set(req._req, value = { request: toRequest(req), state: {} as State, ip })
  }
  return value
}

/** The response that `ctx.server` holds for a request, as a fetch API response. */
function toResponse(res: ServerResponse) {
  const status = res.status || 404
  // a null body status cannot have a body
  const body = [101, 204, 205, 304].includes(status) ? null : res.body
  const headers = new Headers(res.headers)
  // the cookies are on the response of Node, see send()
  for (const cookie of [res._res.getHeader('set-cookie') ?? []].flat()) headers.append('set-cookie', String(cookie))
  return new Response(body as BodyInit | null, { status, statusText: res.statusText, headers })
}

/** A response whose headers a middleware can change: those of `fetch()` or `Response.redirect()` are immutable. */
function toMutable(response: Response) {
  return new Response(response.body, response)
}

function matches(path: string, pathname: string) {
  return path === '/' || pathname === path || pathname.startsWith(path.endsWith('/') ? path : path + '/')
}

/**
 * The middlewares of the app (`ctx.middleware`), around its routes and pages
 * on `ctx.server`. They are fetch-based, ordered (`order`, the lower outside)
 * and limited to a path; a request has one `state` for all of them.
 */
export class MiddlewareService extends Service {
  static inject = ['server']

  private _entries: Entry[] = []

  constructor(ctx: Context) {
    super(ctx, 'middleware')
    ctx.server.use(async (req, res, next) => {
      const entries = this._entries.filter(entry => matches(entry.path, req.path))
      if (!entries.length) return next()
      const { request, state, ip } = getRequestContext(req)
      const run = async (index: number): Promise<Response> => {
        if (index < entries.length) return entries[index].middleware(request, { state, ip }, () => run(index + 1).then(toMutable))
        await next()
        return toResponse(res)
      }
      const response = await run(0)
      // a response that was written to the socket already (e.g. by a dev server) cannot be changed
      if (res._res.headersSent) return
      send(req, res, response)
    })
  }

  /**
   * Add a middleware. A lower `order` is outside: it sees the request first
   * and the response last (default `0`); `path` limits it to the requests
   * below a path.
   */
  use(middleware: Middleware, options: MiddlewareService.Options = {}) {
    const entry: Entry = { middleware, order: options.order ?? 0, path: options.path ?? '/' }
    return this.ctx.effect(() => {
      const index = this._entries.findIndex(item => item.order > entry.order)
      this._entries.splice(index < 0 ? this._entries.length : index, 0, entry)
      return () => {
        this._entries = this._entries.filter(item => item !== entry)
      }
    }, `ctx.middleware.use(${entry.path === '/' ? '' : JSON.stringify(entry.path)})`)
  }
}

export namespace MiddlewareService {
  export interface Options {
    /** the lower, the outer: it sees the request first and the response last (default `0`) */
    order?: number
    /** the requests below this path only */
    path?: string
  }
}
