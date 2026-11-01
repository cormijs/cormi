import { type Context, Schema } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'request'
export const inject = ['app', 'react']

export interface Config extends ClientConfig {}

export const Config: Schema<Config> = Schema.object({
  baseURL: Schema.string().description('prefix of relative request URLs'),
  timeout: Schema.natural().role('ms').description('abort requests after this many milliseconds'),
  headers: Schema.dict(String).default({}).description('headers of every request'),
  credentials: Schema.union(['omit', 'same-origin', 'include'] as const),
  dataField: Schema.string().description('useRequest() returns this field of the response body, e.g. data'),
})

/**
 * HTTP requests in the browser: `request()` and `useRequest()` from
 * `@cormijs/plugin-request/client`. Runtime plugins intercept requests through
 * the `request/fetch` event and report errors through `request/error`.
 */
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@cormijs/plugin-request/client', config satisfies ClientConfig)
}
