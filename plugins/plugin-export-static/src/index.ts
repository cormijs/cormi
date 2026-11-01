import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { type Context, type Route, Schema } from 'cormi'

export const name = 'export-static'
export const inject = ['app', 'router', 'html', 'bundler']

export interface Config {
  /** paths rendered besides the static routes, e.g. of dynamic routes: `/users/1` */
  extraRoutePaths: string[]
  /** write `/about` as `about.html` instead of `about/index.html` */
  htmlSuffix: boolean
  /** skip the pages that fail to render instead of failing the build */
  ignorePreRenderError: boolean
}

export const Config: Schema<Config> = Schema.object({
  extraRoutePaths: Schema.array(String).default([]).description('paths rendered besides the static routes'),
  htmlSuffix: Schema.boolean().default(false).description('write /about as about.html'),
  ignorePreRenderError: Schema.boolean().default(false).description('skip pages that fail to render'),
})

/** Paths of the routes without parameters, from their full paths. */
export function getStaticPaths(routes: Record<string, Route>) {
  const paths = new Set<string>()
  for (const route of Object.values(routes)) {
    if (route.isLayout || route.absPath === undefined) continue
    if (/[:*]/.test(route.absPath)) continue
    paths.add(('/' + route.absPath).replace(/\/+/g, '/').replace(/(.)\/$/, '$1'))
  }
  return [...paths].sort()
}

/** The file of a page: `/` -> `index.html`, `/about` -> `about/index.html` (or `about.html`). */
export function getOutputFile(path: string, htmlSuffix: boolean) {
  const name = path.replace(/^\/+|\/+$/g, '')
  if (!name) return 'index.html'
  return htmlSuffix ? `${name}.html` : `${name}/index.html`
}

/**
 * Pre-render the pages of the app into HTML files after builds, to deploy it
 * on a static host. Pages hydrate in the browser; server loaders run at build
 * time, so their data is the data of the build.
 */
export function apply(ctx: Context, config: Config) {
  // pre-rendering needs the server entry, which is generated when a server module exists
  ctx.app.file('plugin-export-static/index.ts', 'export {}\n')
  ctx.app.server('exportStatic', join(ctx.app.dir, 'plugin-export-static/index.ts'))

  ctx.on('build/after', async (result) => {
    const entry = await ctx.bundler.loadServerEntry()
    const origin = 'http://localhost'
    const prefix = (entry.base ?? '/').replace(/\/$/, '')
    const pages = [...new Set([...getStaticPaths(ctx.router.routes), ...config.extraRoutePaths])]
    const hasNotFound = Object.values(ctx.router.routes).some(route => route.path === '*' && !route.parentId)
      || Object.values(ctx.router.routes).some(route => route.absPath === '/*')
    if (hasNotFound) pages.push('/404')

    const logger = ctx.logger('export-static')
    for (const path of pages) {
      const file = path === '/404' && hasNotFound ? '404.html' : getOutputFile(path, config.htmlSuffix)
      try {
        const rendered = await entry.handler.render(new Request(origin + prefix + path))
        if (rendered instanceof Response) {
          logger.warn('%s redirects to %s, skipped', path, rendered.headers.get('location'))
          continue
        }
        const html = await ctx.html.render({
          url: path,
          content: rendered.content,
          head: rendered.head,
          body: rendered.body,
          scripts: result.assets.js,
          styles: result.assets.css,
          preloads: result.assets.preload,
        })
        const target = join(result.outDir, file)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, html)
        logger.info('exported %s', file)
      } catch (error) {
        if (!config.ignorePreRenderError) throw new Error(`failed to pre-render ${path}`, { cause: error })
        logger.warn('failed to pre-render %s', path)
        logger.warn(error)
      }
    }
  })
}
