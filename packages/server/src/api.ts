import { join, relative } from 'node:path'
import { watch } from 'chokidar'
import { getConventionRoutes, Schema, winPath } from '@cormijs/core'
import { Context } from 'cordis'
import { match, type MatchFunction } from 'path-to-regexp'
import { toRequest } from './http.ts'

interface ApiRoute {
  id: string
  path: string
  file: string
  match: MatchFunction<Partial<Record<string, string | string[]>>>
}

/** `users/[id]` -> `/api/users/:id`, `files/[...path]` -> `/api/files/*path` */
function toPath(prefix: string, absPath: string) {
  const path = absPath
    .replace(/\/+/g, '/')
    .replace(/\[\.\.\.([^\]]+)\]/g, '*$1')
    .replace(/\[([^\]]+)\]/g, ':$1')
    .replace(/\/(index)?$/, '')
  return prefix + path
}

/** Handlers of an API route module, by method; `default` handles every method. */
export interface ApiModule {
  [method: string]: ApiHandler | undefined
}

export type ApiHandler = (request: Request, context: { params: Partial<Record<string, string | string[]>> }) => unknown

/**
 * API routes: every module below `src/api` is a route
 * (`src/api/users/[id].ts` -> `/api/users/:id`) exporting handlers by
 * method (`GET`, `POST`, ...) or a `default` handler. A handler receives a
 * fetch API `Request` and returns a `Response`, or a value sent as JSON.
 *
 * The modules are bundled into the server entry; requests are served by
 * `ctx.server` in dev and preview mode.
 */
export function ApiRoutes(ctx: Context, config: ApiRoutes.Config) {
  const dir = ctx.cormi.resolve(config.dir)
  let routes: ApiRoute[] = []
  let dispose: (() => void) | undefined

  const scan = () => {
    const found = Object.values(getConventionRoutes({ base: dir })).map((route) => {
      const path = toPath(config.prefix, route.absPath ?? '')
      return { id: route.id, path, file: winPath(join(dir, route.file!)), match: match(path, { decode: decodeURIComponent }) }
    })
    // fewer parameters first, so `/api/users/me` wins over `/api/users/:id`
    const params = (path: string) => path.match(/[:*]/g)?.length ?? 0
    routes = found.sort((a, b) => params(a.path) - params(b.path) || b.path.length - a.path.length)
    if (routes.length && !dispose) {
      const disposeFile = ctx.app.file('api.ts', () => [
        'export default {',
        ...routes.map(route => `  ${JSON.stringify(route.id)}: () => import(${JSON.stringify(winPath(relative(ctx.app.dir, route.file)))}),`),
        '}',
        '',
      ].join('\n'))
      const disposeServer = ctx.app.server('api', join(ctx.app.dir, 'api.ts'))
      dispose = () => {
        disposeServer()
        disposeFile()
      }
    } else if (!routes.length && dispose) {
      dispose()
      dispose = undefined
    } else {
      ctx.app.refresh()
    }
  }

  scan()
  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(dir, { ignoreInitial: true })
      watcher.on('add', scan).on('unlink', scan)
      return () => watcher.close()
    }, 'watch api routes')
  }

  ctx.inject(['server'], (ctx) => {
    ctx.server.all(`${config.prefix}{/*rest}`, async (req, res, next) => {
      const { pathname } = new URL(req.url, 'http://localhost')
      for (const route of routes) {
        const matched = route.match(pathname)
        if (!matched) continue
        const entry = await ctx.bundler.loadServerEntry()
        const module: ApiModule = await entry.modules.api.default[route.id]()
        const handler = module[req.method] ?? (req.method === 'HEAD' ? module.GET : undefined) ?? module.default
        if (typeof handler !== 'function') {
          return new Response(null, { status: 405, headers: { allow: Object.keys(module).filter(key => key !== 'default').join(', ') } })
        }
        const result = await handler(toRequest(req), { params: matched.params })
        return result instanceof Response ? result : Response.json(result ?? null)
      }
      return next()
    })
  })
}

export namespace ApiRoutes {
  export const inject = ['app', 'bundler']

  export interface Config {
    /** directory of API routes, relative to the app root */
    dir: string
    /** URL prefix of API routes */
    prefix: string
  }

  export const Config: Schema<Config> = Schema.object({
    dir: Schema.string().default('src/api'),
    prefix: Schema.string().default('/api'),
  })
}
