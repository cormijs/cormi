import { type Context, Schema } from '@cormijs/cormi'
type Dict<T> = Record<string, T>

export interface Config {
  /** `X-Content-Type-Options: nosniff` */
  noSniff: boolean
  /** `X-Frame-Options`: who may show the pages in a frame */
  frameOptions: 'DENY' | 'SAMEORIGIN' | false
  referrerPolicy: string | false
  crossOriginOpenerPolicy: string | false
  /** `Strict-Transport-Security`, in production only: browsers then use HTTPS only */
  hsts: false | { maxAge: number; includeSubDomains: boolean; preload: boolean }
  /** `Content-Security-Policy`, e.g. `default-src 'self'`; none by default */
  contentSecurityPolicy: string | false
  /** other headers */
  headers: Dict<string>
  /** the requests below this path */
  path: string
  /** the order of the middleware, see `ctx.middleware.use()` */
  order: number
}

export const Config: Schema<Config> = Schema.object({
  noSniff: Schema.boolean().default(true).description('X-Content-Type-Options: nosniff'),
  frameOptions: Schema.union([Schema.const('DENY'), Schema.const('SAMEORIGIN'), Schema.const(false)]).default('SAMEORIGIN').description('X-Frame-Options'),
  referrerPolicy: Schema.union([String, Schema.const(false)]).default('strict-origin-when-cross-origin').description('Referrer-Policy'),
  crossOriginOpenerPolicy: Schema.union([String, Schema.const(false)]).default('same-origin').description('Cross-Origin-Opener-Policy'),
  hsts: Schema.union([
    Schema.const(false),
    Schema.object({
      maxAge: Schema.natural().default(180 * 24 * 3600).description('in seconds'),
      includeSubDomains: Schema.boolean().default(true),
      preload: Schema.boolean().default(false),
    }),
  ]).default({ maxAge: 180 * 24 * 3600, includeSubDomains: true, preload: false }).description('Strict-Transport-Security, in production only'),
  contentSecurityPolicy: Schema.union([String, Schema.const(false)]).default(false).description('Content-Security-Policy'),
  headers: Schema.dict(String).default({}).description('other headers'),
  path: Schema.string().default('/').description('the requests below this path'),
  order: Schema.number().default(-400).description('the order of the middleware'),
})

export const name = 'security'
export const inject = ['middleware']

/** Security headers on the responses of the app, unless a response sets them itself. */
export function apply(ctx: Context, config: Config) {
  const headers: Dict<string> = {}
  if (config.noSniff) headers['x-content-type-options'] = 'nosniff'
  if (config.frameOptions) headers['x-frame-options'] = config.frameOptions
  if (config.referrerPolicy) headers['referrer-policy'] = config.referrerPolicy
  if (config.crossOriginOpenerPolicy) headers['cross-origin-opener-policy'] = config.crossOriginOpenerPolicy
  if (config.contentSecurityPolicy) headers['content-security-policy'] = config.contentSecurityPolicy
  // over plain HTTP in development, HSTS would make the browser refuse the dev server
  if (config.hsts && ctx.cormi.mode === 'start') {
    const { maxAge, includeSubDomains, preload } = config.hsts
    headers['strict-transport-security'] = `max-age=${maxAge}${includeSubDomains ? '; includeSubDomains' : ''}${preload ? '; preload' : ''}`
  }
  for (const [key, value] of Object.entries(config.headers)) headers[key.toLowerCase()] = value

  ctx.middleware.use(async (request, context, next) => {
    const response = await next()
    for (const [key, value] of Object.entries(headers)) {
      if (!response.headers.has(key)) response.headers.set(key, value)
    }
    return response
  }, { order: config.order, path: config.path })
}
