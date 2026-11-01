import { type Context, Schema } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'react-query'
export const inject = ['app', 'react']

export interface Config extends ClientConfig {}

export const Config: Schema<Config> = Schema.object({
  defaultOptions: Schema.dict(Schema.any()).default({}).description('defaultOptions of the QueryClient'),
  devtools: Schema.boolean().default(true).description('show the devtools in dev mode'),
})

/**
 * TanStack Query. The app is wrapped with a `QueryClientProvider`; runtime
 * plugins configure the client on `reactQuery/client`.
 */
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@cormi/plugin-react-query/client', {
    ...config,
    devtools: config.devtools && ctx.cormi.mode === 'dev',
  } satisfies ClientConfig)
}
