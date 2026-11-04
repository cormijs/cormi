import { type Context, Schema } from '@cormijs/cormi'

export interface Config {
  /** the origins that may request, e.g. `https://app.example.com`, or `*` for any */
  origin: '*' | string[]
  /** whether requests may carry cookies and credentials; not with `*` */
  credentials: boolean
  methods: string[]
  /** the request headers allowed; by default those the preflight asks for */
  allowHeaders?: string[]
  /** the response headers the browser may read */
  exposeHeaders: string[]
  /** how long a preflight is cached, in seconds */
  maxAge: number
  /** the requests below this path */
  path: string
  /** the order of the middleware, see `ctx.middleware.use()` */
  order: number
}

export const Config: Schema<Config> = Schema.object({
  origin: Schema.union([Schema.const('*'), Schema.array(String)]).default('*').description('the origins that may request, or * for any'),
  credentials: Schema.boolean().default(false).description('whether requests may carry cookies'),
  methods: Schema.array(String).default(['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']),
  allowHeaders: Schema.array(String).description('the request headers allowed; by default those the preflight asks for'),
  exposeHeaders: Schema.array(String).default([]).description('the response headers the browser may read'),
  maxAge: Schema.natural().default(600).description('how long a preflight is cached, in seconds'),
  path: Schema.string().default('/api').description('the requests below this path'),
  order: Schema.number().default(-300).description('the order of the middleware'),
})

export const name = 'cors'
export const inject = ['middleware']

/** Cross-origin requests to the API routes (or another `path`): preflights and the headers of responses. */
export function apply(ctx: Context, config: Config) {
  // a browser rejects credentials with any origin: the origins are to be listed
  if (config.credentials && config.origin === '*') throw new Error('credentials need a list of origins, not *')
  const allows = (origin: string) => config.origin === '*' || config.origin.includes(origin)

  ctx.middleware.use(async (request, context, next) => {
    const origin = request.headers.get('origin')
    if (!origin) return next()
    const headers = new Headers()
    if (allows(origin)) {
      headers.set('access-control-allow-origin', config.origin === '*' ? '*' : origin)
      if (config.credentials) headers.set('access-control-allow-credentials', 'true')
    }
    if (config.origin !== '*') headers.set('vary', 'origin')

    // a preflight: answered here, without the headers when the origin is not allowed
    if (request.method === 'OPTIONS' && request.headers.has('access-control-request-method')) {
      if (headers.has('access-control-allow-origin')) {
        headers.set('access-control-allow-methods', config.methods.join(', '))
        const requested = request.headers.get('access-control-request-headers')
        const allowed = config.allowHeaders?.length ? config.allowHeaders.join(', ') : requested
        if (allowed) headers.set('access-control-allow-headers', allowed)
        headers.set('access-control-max-age', String(config.maxAge))
      }
      return new Response(null, { status: 204, headers })
    }

    const response = await next()
    headers.forEach((value, key) => key === 'vary' ? response.headers.append(key, value) : response.headers.set(key, value))
    if (headers.has('access-control-allow-origin') && config.exposeHeaders.length) {
      response.headers.set('access-control-expose-headers', config.exposeHeaders.join(', '))
    }
    return response
  }, { order: config.order, path: config.path })
}
