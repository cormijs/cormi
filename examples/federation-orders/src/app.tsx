import type { Context } from '@cormijs/react/client'

// the runtime plugin of the package: in the host, it runs when the package loads
export default (ctx: Context) => {
  ctx.effect(() => {
    document.documentElement.dataset.orders = 'loaded'
    return () => delete document.documentElement.dataset.orders
  })
}
