import { type Context, readJSON, Schema } from 'cormi'
import { toQiankunDocument } from './document.ts'

export { toQiankunDocument } from './document.ts'

export const name = 'qiankun-slave'
export const inject = ['app', 'html', 'vite']

export interface Config {
  /** name of the micro app, as configured in the master; defaults to the package name */
  name?: string
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().description('name of the micro app, defaults to the package name'),
})

/**
 * A micro app of qiankun. The document of the app loads its modules through
 * a loader qiankun can evaluate, which mounts the app into the master's
 * container, or into the page when the app runs by itself.
 */
export function apply(ctx: Context, config: Config) {
  const name = config.name ?? readJSON(ctx.cormi.resolve('package.json'))?.name ?? 'app'
  const { mountElementId } = ctx.html.config
  const transform = (html: string) => toQiankunDocument(html, name, mountElementId)

  // the loader mounts the app, so the entry does not mount itself
  ctx.app.entry('@cormi/plugin-qiankun/slave/client')

  // the dev server adds its own module scripts, so the dev document is transformed by Vite, last
  ctx.html.transform(html => ctx.cormi.mode === 'dev' ? html : transform(html))
  ctx.vite.plugin({
    name: 'cormi:qiankun-slave',
    apply: 'serve',
    transformIndexHtml: { order: 'post', handler: transform },
  })

  // chunks run in the master's page: assets they load resolve against the chunk, not the page
  ctx.vite.configure({
    experimental: {
      renderBuiltUrl: (_, { hostType, ssr }) => !ssr && hostType === 'js' ? { relative: true } : undefined,
    },
  })

  ctx.inject(['server'], (ctx) => {
    // the master fetches the document and imports the modules from another origin
    ctx.server.use((req, res, next) => {
      res._res.setHeader('access-control-allow-origin', '*')
      return next()
    })
    // assets imported by modules of the dev server point to this server
    const host = ['0.0.0.0', '::'].includes(ctx.server.host) ? 'localhost' : ctx.server.host
    ctx.vite.configure(config => ({
      ...config,
      server: { ...config.server, origin: `http://${host}:${ctx.server.port}` },
    }))
  })
}
