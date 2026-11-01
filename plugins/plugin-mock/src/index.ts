import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { watch } from 'chokidar'
import { type Context, createFile, Schema, send, toRequest } from 'cormi'
import { match, type MatchFunction } from 'path-to-regexp'

export const name = 'mock'

export type MockParams = Partial<Record<string, string | string[]>>

/** Receives a fetch API `Request`; returns a `Response`, or a value sent as JSON. */
export type MockHandler = (request: Request, context: { params: MockParams }) => unknown

/**
 * Mocked routes of a module: `'GET /api/users/:id'` (or a path for every
 * method) mapped to a handler or to a value sent as JSON.
 */
export type Mocks = Record<string, MockHandler | unknown>

export function defineMock(mocks: Mocks) {
  return mocks
}

export interface Config {
  /** directory of mock modules, relative to the app root */
  dir: string
  /** delay of every mocked response, in milliseconds */
  delay: number
  /** mock in preview mode as well */
  preview: boolean
}

export const Config: Schema<Config> = Schema.object({
  dir: Schema.string().default('mock').description('directory of mock modules'),
  delay: Schema.natural().role('ms').default(0).description('delay of every mocked response'),
  preview: Schema.boolean().default(false).description('mock in preview mode as well'),
})

interface MockRoute {
  method?: string
  match: MatchFunction<MockParams>
  value: unknown
}

const MODULE_RE = /\.[cm]?[jt]s$/

/**
 * Mock API routes in dev mode. Every module below `mock/` default-exports
 * `defineMock({ ... })`; mocked routes take precedence over the app's API
 * routes, and editing a mock module applies on the next request.
 */
export function apply(ctx: Context, config: Config) {
  const dir = ctx.cormi.resolve(config.dir)
  ctx.cli.generator('mock', {
    description: `mocked routes: ${config.dir}/<name>.ts`,
    async run(name) {
      return [await createFile(join(dir, `${name}.ts`), [
        `import { defineMock } from '@cormijs/plugin-mock'`,
        '',
        `export default defineMock({`,
        `  'GET /api/${name}': { message: 'hello from ${name}' },`,
        `})`,
        '',
      ].join('\n'))]
    },
  })

  const { mode } = ctx.cormi
  if (mode !== 'dev' && !(mode === 'preview' && config.preview)) return
  let routes: Promise<MockRoute[]> | undefined

  const load = async () => {
    if (!existsSync(dir)) return []
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter(file => MODULE_RE.test(file) && !file.endsWith('.d.ts'))
    const result: MockRoute[] = []
    for (const file of files.sort()) {
      // node code, loaded like node plugins; the mtime busts the module cache after edits
      const path = join(dir, file)
      const module = await import(`${pathToFileURL(path).href}?t=${statSync(path).mtimeMs}`)
      for (const [key, value] of Object.entries<unknown>(module.default ?? {})) {
        const [method, pathname] = key.includes(' ') ? key.trim().split(/\s+/) : [undefined, key]
        result.push({ method: method?.toUpperCase(), match: match(pathname, { decode: decodeURIComponent }), value })
      }
    }
    ctx.logger('mock').debug('loaded %d mocked routes', result.length)
    return result
  }

  if (mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(dir, { ignoreInitial: true })
      watcher.on('all', () => routes = undefined)
      return () => watcher.close()
    }, 'watch mock modules')
  }

  ctx.inject(['server'], (ctx) => {
    ctx.server.use(async (req, res, next) => {
      let list: MockRoute[]
      try {
        list = await (routes ??= load())
      } catch (error) {
        routes = undefined
        ctx.logger('mock').error(error)
        return next()
      }
      const { pathname } = new URL(req.url, 'http://localhost')
      for (const route of list) {
        if (route.method && route.method !== req.method) continue
        const matched = route.match(pathname)
        if (!matched) continue
        if (config.delay) await new Promise(resolve => setTimeout(resolve, config.delay))
        const result = typeof route.value === 'function'
          ? await (route.value as MockHandler)(toRequest(req), { params: matched.params })
          : route.value
        return send(req, res, result instanceof Response ? result : Response.json(result ?? null))
      }
      return next()
    })
  })
}
