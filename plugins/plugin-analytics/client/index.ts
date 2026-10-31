import type { Context } from 'cormi/client'
import type { ClientConfig } from '../src/types.ts'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    _hmt?: unknown[][]
  }
}

export default (ctx: Context, config: ClientConfig) => {
  let first = true
  ctx.on('router/change', (location) => {
    // the scripts of the document record the first page themselves
    if (first) {
      first = false
      return
    }
    const path = ctx.$router.router!.createHref(location)
    if (config.ga) window.gtag?.('event', 'page_view', { page_path: path, page_location: window.location.href })
    if (config.baidu) window._hmt?.push(['_trackPageview', path])
  })
}
