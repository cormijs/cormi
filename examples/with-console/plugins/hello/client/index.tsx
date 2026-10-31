import type { Context } from 'cormi/client'

export default (ctx: Context, config: { greeting: string }) => {
  ctx.on('app/mount', () => console.info(config.greeting))
}
