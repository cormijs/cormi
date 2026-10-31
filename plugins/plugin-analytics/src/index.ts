import { type Context, Schema } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'analytics'
export const inject = ['app', 'html']

export interface Config extends ClientConfig {
  /** track in dev mode too */
  dev: boolean
}

export const Config: Schema<Config> = Schema.object({
  ga: Schema.string().description('measurement id of Google Analytics 4, e.g. G-XXXXXXX'),
  baidu: Schema.string().description('site id of Baidu Tongji'),
  dev: Schema.boolean().default(false).description('track in dev mode too'),
})

/**
 * Google Analytics 4 and Baidu Tongji. The document loads their scripts, which
 * record the first page; the browser plugin records the navigations after it.
 */
export function apply(ctx: Context, config: Config) {
  if (ctx.cormi.mode === 'dev' && !config.dev) return
  const json = JSON.stringify
  if (config.ga) {
    ctx.html.head({ tag: 'script', attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga)}` } })
    ctx.html.head({
      tag: 'script',
      content: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config',${json(config.ga)});`,
    })
  }
  if (config.baidu) {
    ctx.html.head({
      tag: 'script',
      content: `var _hmt=_hmt||[];(function(){var s=document.createElement('script');s.src='https://hm.baidu.com/hm.js?'+${json(config.baidu)};var f=document.getElementsByTagName('script')[0];f.parentNode.insertBefore(s,f)})();`,
    })
  }
  ctx.app.entry('@cormi/plugin-analytics/client', { ga: config.ga, baidu: config.baidu } satisfies ClientConfig)
}
