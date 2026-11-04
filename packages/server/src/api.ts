import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { watch } from 'chokidar'
import { getConventionRoutes, ModuleReloader, NODE_DIR, Schema, winPath } from '@cormijs/core'
import type { Context, Fiber } from 'cordis'
import { match, type MatchFunction } from 'path-to-regexp'
import type { ServerRequest } from './http.ts'
import { getRequestContext, type RequestContext } from './middleware.ts'

// `FiberState` is a const enum in cordis' typings
const ACTIVE = 2

type Params = Partial<Record<string, string | string[]>>

/** What an API handler receives besides the request. */
export interface ApiContext<P = Params> extends RequestContext {
  params: P
  /** the context of the route: the services its module injects (`export const inject`) */
  ctx: Context
}

export type ApiHandler<P = Params> = (request: Request, context: ApiContext<P>) => unknown

/** An API route module: handlers by method (`GET`, `POST`…), or `default` for every method. */
export interface ApiModule {
  /** the services the handlers use, as a plugin injects them */
  inject?: string[] | Record<string, unknown>
  [method: string]: unknown
}

interface ApiRoute {
  id: string
  path: string
  file: string
  match: MatchFunction<Params>
  module?: ApiModule
  fiber?: Fiber
  /** the module could not be loaded */
  error?: unknown
}

// by the request of Node, see getRequestContext()
const apiRequests = new WeakSet<object>()

/** Whether a request is below the prefix of the API routes: pages do not answer it. */
export function isApiRequest(req: ServerRequest) {
  return apiRequests.has(req._req)
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

/** The plugin of a module: its namespace with `apply`, or its default export. */
function unwrapPlugin(module: any) {
  const plugin = typeof module?.apply === 'function' ? module : module?.default
  if (typeof plugin === 'function' || typeof plugin?.apply === 'function') return plugin
}

/** The files of the server code, by their paths relative to the app root. */
interface ServerCode {
  /** `server/index.ts`, then `server/models/*.ts` */
  plugins: string[]
  routes: { id: string; path: string; file: string }[]
}

/** The server code of the sources, in dev mode and for builds. */
function scanServerCode(ctx: Context, prefix: string): ServerCode {
  const { cwd, paths } = ctx.cormi
  const root = paths.server
  const apiDir = join(root, 'api')
  const toRelative = (file: string) => winPath(relative(cwd, file))
  const plugins = [
    ...['index.ts', 'index.js'].map(file => join(root, file)).filter(existsSync).slice(0, 1),
    ...existsSync(join(root, 'models')) ? readdirSync(join(root, 'models')).filter(file => /\.[cm]?[jt]s$/.test(file) && !file.endsWith('.d.ts')).sort().map(file => join(root, 'models', file)) : [],
  ]
  const routes = existsSync(apiDir)
    ? Object.values(getConventionRoutes({ base: apiDir, extensions: ['.ts', '.js'] })).map(route => ({
        id: route.id,
        path: toPath(prefix, route.absPath ?? ''),
        file: toRelative(join(apiDir, route.file!)),
      }))
    : []
  return { plugins: plugins.map(toRelative), routes }
}

/**
 * The server code of the app (`server/`):
 *
 * - `server/index.ts`: the app's own plugin, like `src/app.ts` in the browser
 * - `server/models/*.ts`: plugins, e.g. the tables of the database
 * - `server/api/**`: API routes, `users/[id].ts` -> `/api/users/:id`
 *
 * An API module exports handlers by method (`GET`, `POST`…) or a `default`
 * handler, and the services they use (`export const inject`): a handler
 * receives a fetch API `Request` and `{ params, ctx, state }`, where `ctx`
 * has those services, and returns a `Response` or a value sent as JSON.
 * Until the services are there, the route answers 503.
 *
 * The code runs when the app serves: in dev mode from its sources, and a
 * change below `server/` loads it again, with the files of the app it
 * imports; in production (`cormi start`) as `cormi build` compiled it.
 */
export function ApiRoutes(ctx: Context, config: ApiRoutes.Config) {
  const { cormi } = ctx
  if (cormi.mode === 'build') {
    // compiled with the Node code of the app; the routes are known from the build in production
    ctx.on('build/node', (build) => {
      const code = scanServerCode(ctx, config.prefix)
      for (const file of [...code.plugins, ...code.routes.map(route => route.file)]) build.entries.add(cormi.resolve(file))
      build.data.server = code
    })
    return
  }
  // the server code runs when the app serves, not when it writes files
  if (!cormi.serving) return

  let getCode: () => ServerCode
  let importModule: (file: string) => Promise<any>
  // the next imports evaluate the modules anew
  let reload = () => {}
  if (cormi.mode === 'start') {
    const build = cormi.build!
    getCode = () => build.data.server ?? { plugins: [], routes: [] }
    importModule = file => import(pathToFileURL(join(cormi.cwd, NODE_DIR, build.files[file])).href)
  } else {
    if (existsSync(join(cormi.paths.src, 'api'))) {
      ctx.logger('server').warn('src/api is not loaded: the API routes are in server/api now')
    }
    const reloader = new ModuleReloader(cormi.cwd)
    getCode = () => scanServerCode(ctx, config.prefix)
    importModule = file => reloader.import(cormi.resolve(file))
    reload = () => reloader.invalidate()
  }
  let routes: ApiRoute[] = []
  let fibers: Fiber[] = []

  const load = async () => {
    const code = getCode()
    // the plugins of the app: server/index.ts, then the models
    for (const file of code.plugins) {
      try {
        const plugin = unwrapPlugin(await importModule(file))
        if (!plugin) throw new Error(`${file} exports no plugin`)
        fibers.push(ctx.plugin(plugin))
      } catch (error) {
        ctx.logger('server').error(error)
      }
    }

    const found: ApiRoute[] = code.routes.map(route => ({ ...route, match: match(route.path, { decode: decodeURIComponent }) }))
    for (const route of found) {
      try {
        const module: ApiModule = await importModule(route.file)
        route.module = module
        // a route is a plugin: its handlers run with the services it injects
        route.fiber = ctx.plugin({ name: `api ${route.path}`, inject: module.inject ?? [], apply: () => {} })
        fibers.push(route.fiber)
      } catch (error) {
        route.error = error
        ctx.logger('server').error(error)
      }
    }
    // fewer parameters first, so `/api/users/me` wins over `/api/users/:id`
    const params = (path: string) => path.match(/[:*]/g)?.length ?? 0
    routes = found.sort((a, b) => params(a.path) - params(b.path) || b.path.length - a.path.length)
  }

  const unload = async () => {
    const disposing = fibers
    fibers = []
    routes = []
    await Promise.all(disposing.map(fiber => fiber.dispose()))
  }

  ctx.effect(() => {
    const task = load()
    return async () => {
      await task
      await unload()
    }
  }, 'load server code')

  if (ctx.cormi.mode === 'dev') {
    // the code is loaded again as a whole: the old plugins go before the new ones come, so a service is not provided twice
    let reloading: Promise<void> = Promise.resolve()
    let timer: ReturnType<typeof setTimeout> | undefined
    // changes in a burst (a save of several files) reload once
    const reload = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        reloading = reloading.then(async () => {
          await unload()
          reload()
          await load()
          ctx.logger('server').info('reloaded the server code')
        })
      }, 100)
    }
    ctx.effect(() => {
      const watcher = watch(cormi.paths.server, { ignoreInitial: true })
      watcher.on('all', reload)
      return () => {
        clearTimeout(timer)
        return watcher.close()
      }
    }, 'watch server code')
  }

  ctx.inject(['server'], (ctx) => {
    ctx.server.all(`${config.prefix}{/*rest}`, async (req, res, next) => {
      apiRequests.add(req._req)
      const { pathname } = new URL(req.url, 'http://localhost')
      for (const route of routes) {
        const matched = route.match(pathname)
        if (!matched) continue
        if (route.error || !route.module || !route.fiber) {
          const message = ctx.cormi.mode === 'dev' ? String((route.error as Error)?.stack ?? route.error) : 'Internal Server Error'
          return new Response(message, { status: 500 })
        }
        const { module, fiber } = route
        const handler = module[req.method] ?? (req.method === 'HEAD' ? module.GET : undefined) ?? module.default
        if (typeof handler !== 'function') {
          const methods = Object.keys(module).filter(key => /^[A-Z]+$/.test(key) && typeof module[key] === 'function')
          return new Response(null, { status: 405, headers: { allow: methods.join(', ') } })
        }
        if (fiber.state !== ACTIVE) {
          const missing = Object.keys(fiber.inject).filter(name => !fiber.ctx.get(name as any))
          return Response.json({ error: `the route waits for ${missing.join(', ') || 'its services'}` }, { status: 503, headers: { 'retry-after': '1' } })
        }
        const { request, state } = getRequestContext(req)
        const result = await (handler as ApiHandler)(request, { params: matched.params, ctx: fiber.ctx, state })
        return result instanceof Response ? result : Response.json(result ?? null)
      }
      // the other routes of ctx.server (not the pages), then not found: an unknown path is not a method that is not allowed
      const response = await next()
      if (response !== undefined || res.claimed) return response
      return Response.json({ error: 'not found' }, { status: 404 })
    })
  })
}

export namespace ApiRoutes {
  export interface Config {
    /** URL prefix of the API routes of `server/api` */
    prefix: string
  }

  export const Config: Schema<Config> = Schema.object({
    prefix: Schema.string().default('/api').description('URL prefix of the API routes of server/api'),
  })
}
