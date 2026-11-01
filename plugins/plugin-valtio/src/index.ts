import { type Context, Schema } from 'cormi'

export const name = 'valtio'
export const inject = ['app', 'react']

export interface Config {
  /** connect the stores of `defineStore()` to Redux DevTools in dev mode */
  devtools: boolean
}

export const Config: Schema<Config> = Schema.object({
  devtools: Schema.boolean().default(true).description('connect stores to Redux DevTools in dev mode'),
})

/** valtio, with stores connected to Redux DevTools in dev mode. */
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@cormi/plugin-valtio/client', { devtools: config.devtools && ctx.cormi.mode === 'dev' })
}
