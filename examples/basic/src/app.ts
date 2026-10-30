import type { Context } from 'cormi/client'

/** The runtime plugin of the app: it receives the browser context. */
export default (ctx: Context) => {
  ctx.on('router/change', (location) => {
    document.title = `Cormi · ${location.pathname}`
  })
}
