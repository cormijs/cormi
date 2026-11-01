import type { Context } from '@cormijs/vue/client'

/** The runtime plugin of the app: it installs a Vue plugin, and titles each page. */
export default (ctx: Context) => {
  ctx.$app.use({
    install(app) {
      app.provide('greeting', 'Hello from a runtime plugin')
    },
  })
  ctx.on('router/change', (location) => {
    document.title = `Cormi · ${location.pathname}`
  })
}
