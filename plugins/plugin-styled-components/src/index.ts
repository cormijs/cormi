import { type Context, Schema } from 'cormi'
import type { ClientConfig } from './types.ts'
import type {} from '@cormi/vite'

export type * from './types.ts'

export const name = 'styled-components'
export const inject = ['app', 'vite']

export interface Config extends ClientConfig {}

export const Config: Schema<Config> = Schema.object({
  theme: Schema.dict(Schema.any()).default({}).description('the theme of ThemeProvider'),
})

/**
 * styled-components. The app is wrapped with a `ThemeProvider`; during server
 * rendering the styles are collected into `<head>`.
 */
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@cormi/plugin-styled-components/client', config satisfies ClientConfig)
  // styled-components has no `exports`: Node would import its CommonJS build,
  // whose default export is not `styled`; the server bundle uses its ES build
  ctx.vite.configure({ ssr: { noExternal: ['styled-components'] } })
}
