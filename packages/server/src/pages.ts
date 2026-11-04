import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LOADER_ENDPOINT } from '@cormijs/runtime/constants'
import { type Html, Schema } from '@cormijs/core'
import { Context } from 'cordis'
import { isApiRequest } from './api.ts'
import { getOrigin, send, type ServerRequest, toRequest } from './http.ts'
import { getRequestContext, type RequestContext } from './middleware.ts'

type Assets = Pick<Html.RenderOptions, 'scripts' | 'styles' | 'preloads'>

/** What the server entry renders, see `@cormijs/react/client/server`. */
interface RenderResult {
  status: number
  content: string
  head: string
  body: string
}

/** The assets of the client entry: the source module in dev mode, the built chunks otherwise. */
async function getAssets(ctx: Context): Promise<Assets> {
  const { js, css, preload } = await ctx.bundler.assets(ctx.app.clientEntry)
  return { scripts: js, styles: css, preloads: preload }
}

/**
 * Pages are the fallback of GET requests accepting HTML, including `fetch()`
 * defaults (`*\/*`), e.g. a qiankun master; not of the API routes' paths.
 */
function isPageRequest(req: ServerRequest) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  if (isApiRequest(req)) return false
  const accept = req.headers.get('accept')
  return !accept || accept.includes('text/html') || accept.includes('*/*')
}

/**
 * What the loaders of pages receive as `context` on the server: the root
 * context of the app (its services) and the state of the request.
 */
export interface LoaderContext extends RequestContext {
  ctx: Context
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
      const { cormi, bundler, html } = ctx
      if (!bundler.ready) {
        return new Response(STARTING, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '1' } })
      }
      const url = new URL(req.url, getOrigin(req))
      let result: RenderResult | undefined
      if (config.ssr) {
        const entry = await bundler.loadServerEntry()
        const { request, state, ip } = getRequestContext(req)
        const rendered: Response | RenderResult = await entry.handler.render(request, { ctx: ctx[Context.root], state, ip } satisfies LoaderContext)
        if (rendered instanceof Response) return rendered
        if (cormi.mode === 'dev') rendered.head += bundler.devStyles?.(ctx.app.serverEntry) ?? ''
        result = rendered
      }
      if (cormi.mode === 'dev') assets = undefined
      let markup = await html.render({
        url: url.pathname + url.search,
        content: result?.content,
        head: result?.head,
        body: result?.body,
        ...await (assets ??= getAssets(ctx)),
      })
      if (cormi.mode === 'dev') markup = await bundler.transformDocument(url.pathname + url.search, markup)
      return new Response(markup, {
        status: result?.status ?? 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    ctx.server.get(`${config.base.replace(/\/$/, '')}/${LOADER_ENDPOINT}`, async (req) => {
      const route = req.query.get('route')
      const url = req.query.get('url')
      if (!route || !url) return new Response('missing route or url', { status: 400 })
      const entry = await ctx.bundler.loadServerEntry()
      const { state, ip } = getRequestContext(req)
      return entry.handler.loader(toRequest(req, url), route, { ctx: ctx[Context.root], state, ip } satisfies LoaderContext)
    })

    // registered after the routes of `ctx.server`, so pages are the fallback
    ctx.on('server/request', async (req, res, next) => {
      if (!isPageRequest(req)) return next()
      try {
        send(req, res, await render(req))
      } catch (error) {
        ctx.bundler.fixStacktrace?.(error as Error)
        ctx.logger('pages').error(error)
        res.status = 500
        res.headers.set('content-type', 'text/plain; charset=utf-8')
        res.body = ctx.cormi.mode === 'dev' ? String((error as Error)?.stack ?? error) : 'Internal Server Error'
      }
    })
  })
}

export namespace Pages {
  export const inject = ['app', 'html', 'bundler']

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
