import { type Context, Schema } from '@cormijs/cormi'

export const name = 'basic-local'
export const inject = ['html']

export interface Config {
  generator: string
}

export const Config: Schema<Config> = Schema.object({
  generator: Schema.string().default('cormi'),
})

/**
 * A node plugin of the app. Edit `config.generator` in cormi.yml while the dev
 * server runs: only this plugin reloads, and the meta tag follows.
 */
export function apply(ctx: Context, config: Config) {
  ctx.html.head({ tag: 'meta', attrs: { name: 'generator', content: config.generator } })
  ctx.logger('basic').info('local plugin loaded')
}
