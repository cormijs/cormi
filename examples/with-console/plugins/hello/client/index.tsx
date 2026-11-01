import type { Context } from '@cormijs/cormi/client'

export default (ctx: Context, config: { greeting: string }) => {
  ctx.on('app/mount', () => console.info(config.greeting))
}
