import { type Context, Schema } from '@cormijs/cormi'

export const name = 'hello'
export const inject = ['app']

export interface Config {
  greeting: string
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello from cormi-plugin-hello').description('logged by the browser plugin'),
})

export function apply(ctx: Context, config: Config) {
  ctx.logger('hello').info('loaded, greeting: %s', config.greeting)
  // the browser plugin, registered by package name; config goes along as JSON
  ctx.app.entry('cormi-plugin-hello/client', { greeting: config.greeting })
  // a page of the console in dev mode, with data from this plugin
  ctx.inject(['console'], (ctx) => {
    const loadedAt = new Date().toISOString()
    ctx.console.data('hello', () => ({ greeting: config.greeting, loadedAt }))
    ctx.console.entry('cormi-plugin-hello/console')
  })
}
