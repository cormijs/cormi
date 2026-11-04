import type {} from '@cormijs/cache'
import { type Context, Schema } from '@cormijs/cormi'

declare module '@cormijs/cache' {
  interface Tables {
    'rate-limit': number
  }
}

export interface Config {
  /** the requests of a client in a window */
  max: number
  /** the length of a window, in milliseconds */
  window: number
  /** the requests below this path, e.g. `/api/login` */
  path: string
  /** the methods counted; all by default */
  methods?: string[]
  /** the client is the first address of `x-forwarded-for`, which a proxy in front of the app sets */
  trustProxy: boolean
  /** the order of the middleware, see `ctx.middleware.use()` */
  order: number
}

export const Config: Schema<Config> = Schema.object({
  max: Schema.natural().default(100).description('the requests of a client in a window'),
  window: Schema.natural().role('ms').default(60_000).description('the length of a window'),
  path: Schema.string().default('/api').description('the requests below this path'),
  methods: Schema.array(String).description('the methods counted; all by default'),
  trustProxy: Schema.boolean().default(false).description('the client is the first address of x-forwarded-for'),
  order: Schema.number().default(-200).description('the order of the middleware'),
})

export const name = 'rate-limit'
export const inject = ['cache', 'middleware']

/**
 * At most `max` requests of a client in each window of time, counted in
 * `ctx.cache` (shared by the processes of the app with Redis); then 429 until
 * the next window. The responses tell the limit (`RateLimit-*` headers).
 * Several entries in cormi.yml limit several paths.
 */
export function apply(ctx: Context, config: Config) {
  // an empty list (the default of the schema) is every method
  const methods = config.methods?.length ? config.methods.map(method => method.toUpperCase()) : undefined

  ctx.middleware.use(async (request, { ip }, next) => {
    if (methods && !methods.includes(request.method)) return next()
    const client = (config.trustProxy && request.headers.get('x-forwarded-for')?.split(',')[0].trim()) || ip
    const now = Date.now()
    const window = Math.floor(now / config.window)
    const reset = (window + 1) * config.window - now
    const count = await ctx.cache.increment('rate-limit', `${config.path}:${client}:${window}`, 1, reset)
    const headers = {
      'ratelimit-limit': String(config.max),
      'ratelimit-remaining': String(Math.max(0, config.max - count)),
      'ratelimit-reset': String(Math.ceil(reset / 1000)),
    }
    if (count > config.max) {
      return Response.json({ error: 'too many requests' }, { status: 429, headers: { ...headers, 'retry-after': headers['ratelimit-reset'] } })
    }
    const response = await next()
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
    return response
  }, { order: config.order, path: config.path })
}
