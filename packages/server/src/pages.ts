import { readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { LOADER_ENDPOINT } from '@cormi/client/constants'
import { type Html, Schema, winPath } from '@cormi/core'
import type {} from '@cormi/vite'
import { getEntryAssets } from '@cormi/vite'
import { Context } from 'cordis'
import { getOrigin, send, type ServerRequest, toRequest } from './http.ts'

type Assets = Pick<Html.RenderOptions, 'scripts' | 'styles' | 'preloads'>

/** The assets of the client entry: the source module in dev mode, the built chunks otherwise. */
async function getAssets(ctx: Context): Promise<Assets> {
  const { cormi, app, vite } = ctx
  const entry = winPath(relative(cormi.cwd, app.clientEntry))
  if (cormi.mode === 'dev') return { scripts: [vite.config.publicPath + entry] }
  const manifest = JSON.parse(await readFile(join(vite.outDir, '.vite/manifest.json'), 'utf8'))
  const { js, css, preload } = getEntryAssets(manifest, entry, vite.config.publicPath)
  return { scripts: js, styles: css, preloads: preload }
}

function isPageRequest(req: ServerRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  return !!req.headers.get('accept')?.includes('text/html')
}

const STARTING = '<!DOCTYPE html><meta http-equiv="refresh" content="1"><p>Cormi is starting…</p>'

/**
 * Serve the pages of the app: the HTML document (server-rendered with
 * `ssr: true`) and the endpoint of server `loader`s. In build mode, write the
 * document of the client-rendered app to `index.html`.
 */
export function Pages(ctx: Context, config: Pages.Config) {
  ctx.on('build/after', async ({ outDir }) => {
    const html = await ctx.html.render(await getAssets(ctx))
    await writeFile(join(outDir, 'index.html'), html)
  })

  ctx.inject(['server'], (ctx) => {
    let assets: Promise<Assets> | undefined

    const render = async (req: ServerRequest): Promise<Response> => {
      const { cormi, vite, html } = ctx
      if (cormi.mode === 'dev' && !vite.devServer) {
        return new Response(STARTING, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '1' } })
      }
      const url = new URL(req.url, getOrigin(req))
      let result: { status: number; content: string; head: string } | undefined
      if (config.ssr) {
        const entry = await vite.loadServerEntry()
        const rendered = await entry.handler.render(toRequest(req))
        if (rendered instanceof Response) return rendered
        result = rendered
      }
      if (cormi.mode === 'dev') assets = undefined
      let markup = await html.render({
        url: url.pathname + url.search,
        content: result?.content,
        head: result?.head,
        ...await (assets ??= getAssets(ctx)),
      })
      if (vite.devServer) markup = await vite.devServer.transformIndexHtml(url.pathname + url.search, markup)
      return new Response(markup, {
        status: result?.status ?? 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    ctx.server.get(`${config.base.replace(/\/$/, '')}/${LOADER_ENDPOINT}`, async (req) => {
      const route = req.query.get('route')
      const url = req.query.get('url')
      if (!route || !url) return new Response('missing route or url', { status: 400 })
      const entry = await ctx.vite.loadServerEntry()
      return entry.handler.loader(toRequest(req, url), route)
    })

    // registered after the routes of `ctx.server`, so pages are the fallback
    ctx.on('server/request', async (req, res, next) => {
      if (!isPageRequest(req)) return next()
      try {
        send(req, res, await render(req))
      } catch (error) {
        ctx.vite.devServer?.ssrFixStacktrace(error as Error)
        ctx.logger('pages').error(error)
        res.status = 500
        res.headers.set('content-type', 'text/plain; charset=utf-8')
        res.body = ctx.cormi.mode === 'dev' ? String((error as Error)?.stack ?? error) : 'Internal Server Error'
      }
    })
  })
}

export namespace Pages {
  export const inject = ['app', 'html', 'vite']

  export interface Config {
    /** render pages on the server */
    ssr: boolean
    /** basename of the app */
    base: string
  }

  export const Config: Schema<Config> = Schema.object({
    ssr: Schema.boolean().default(false),
    base: Schema.string().default('/'),
  })
}
