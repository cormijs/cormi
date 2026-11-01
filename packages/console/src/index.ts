import { join } from 'node:path'
import type {} from '@cordisjs/plugin-loader'
import type {} from '@cordisjs/plugin-server'
import { type App, Refresher, Schema, winPath } from '@cormi/core'
import { Context, Service } from 'cordis'
import { Awaitable } from 'cosmokit'
import { Builtin } from './builtin.ts'
import { CLIENT, type ConsoleServer, createConsoleServer, ENTRY_URL } from './vite.ts'

export * from './builtin.ts'

declare module 'cordis' {
  interface Context {
    console: Console
  }
}

/** The part of a `ws` socket the console uses. */
interface Socket {
  readyState: number
  send(data: string): void
  on(event: 'message', listener: (data: Buffer) => void): void
  on(event: 'close', listener: () => void): void
}

/** Messages between the console in the browser and the server. */
export type Message =
  | { type: 'data'; name: string; value: unknown }
  | { type: 'event'; name: string; payload: unknown }
  | { type: 'result'; id: number; value?: unknown; error?: string }
  | { type: 'call'; id: number; name: string; args: unknown[] }

const OPEN = 1

/**
 * The console of the app in dev mode (`ctx.console`), served at `/__cormi/`
 * by the app's server, with a Vite and a React of its own: it works the same
 * whatever the bundler and the UI framework of the app. The console is
 * itself a Cormi app in the browser: its pages are browser plugins,
 * registered by plugins with `entry()` like `ctx.app.entry()`. They read data
 * the server pushes (`data()`) and call methods on the server (`method()`),
 * over a WebSocket.
 */
export class Console extends Service {
  static inject = ['server', 'loader']

  /** browser plugins of the console, mounted in registration order */
  entries = new Set<App.Entry>()

  private _sources = new Map<string, Console.Source>()
  private _methods = new Map<string, Console.Method>()
  private _sockets = new Set<Socket>()
  // the context of the console: `this.ctx` is the caller's in methods
  private _ctx: Context
  private _server: Promise<ConsoleServer | undefined> = Promise.resolve(undefined)
  // browsers load the console again when its entry changes; changes in a burst reload once
  private _reload: Refresher

  constructor(ctx: Context, public config: Console.Config) {
    super(ctx, 'console')
    this._ctx = ctx
    const base = this.base
    this._reload = new Refresher(async () => (await this._server)?.reloadEntry(), 50, error => ctx.logger('console').warn(error))

    ctx.effect(() => {
      const server = this._server = createConsoleServer({
        base,
        cwd: ctx.cormi.cwd,
        http: ctx.server._http,
        workspace: ctx.get('workspace'),
        entry: () => renderEntry([...this.entries], { client: CLIENT, base, endpoint: base + 'ws' }),
      }).catch((error) => {
        ctx.logger('console').error(error)
        return undefined
      })
      return async () => {
        this._reload.dispose()
        await (await server)?.close()
      }
    }, 'console dev server')

    // the modules of the console, below its path; other requests (e.g. to the loaders of the app) go on
    ctx.server.use(async (req, res, next) => {
      if (!req.path.startsWith(base)) return next()
      const server = await this._server
      if (!server) return next()
      const response = res._res
      return new Promise<void>((resolve, reject) => {
        const done = () => resolve()
        response.once('finish', done)
        response.once('close', done)
        server.middlewares(req._req, response, (error?: unknown) => {
          response.off('finish', done)
          response.off('close', done)
          if (error) return reject(error)
          next().then(resolve, reject)
        })
      })
    })

    // the HMR socket of the console is accepted by its Vite
    ctx.on('server/upgrade', (req, next) => {
      const protocol = req.headers.get('sec-websocket-protocol')
      if (req.path === base && (protocol === 'vite-hmr' || protocol === 'vite-ping')) return Promise.resolve()
      return next()
    })

    // the document answers page navigations only: endpoints below /__cormi/ (e.g. of loaders) stay reachable
    ctx.server.get(`${base.slice(0, -1)}{/*path}`, async (req, _res, next) => {
      if (!req.headers.get('accept')?.includes('text/html')) return next()
      const server = await this._server
      if (!server) return next()
      // the console's Vite puts its base before the URLs of the document
      const html = await server.transformIndexHtml(req.path, renderDocument(ENTRY_URL, config.title))
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    })

    ctx.server.ws(`${base}ws`, async (_req, accept) => {
      const socket = await accept() as unknown as Socket
      this._accept(socket)
    })

    ctx.plugin(Builtin, config)
    this.entry(join(CLIENT, 'builtin/index.tsx'))
    ctx.logger('console').info('the console is available at %C', getServerUrl(ctx) + base)
  }

  /** the path of the console, ending with `/` */
  get base() {
    return this.config.path.replace(/\/?$/, '/')
  }

  /**
   * Mount a browser plugin in the console, e.g. a page:
   * `ctx.console.entry('@scope/plugin-foo/console')`. Like `ctx.app.entry()`,
   * pass a package specifier; `config` is serialized to JSON.
   */
  entry(module: string, config?: any) {
    const entry: App.Entry = { file: winPath(module), config }
    return this.ctx.effect(() => {
      this.entries.add(entry)
      this._reload.schedule()
      return () => {
        this.entries.delete(entry)
        this._reload.schedule()
      }
    }, `ctx.console.entry(${JSON.stringify(entry.file)})`)
  }

  /**
   * Provide data to the console. Clients receive the value when they
   * connect, and again after `refresh()`; read it with `useData(name)`.
   */
  data<T>(name: string, get: () => Awaitable<T>) {
    const source: Console.Source = { get, timer: undefined }
    const dispose = this.ctx.effect(() => {
      if (this._sources.has(name)) throw new Error(`console data ${name} is provided twice`)
      this._sources.set(name, source)
      void this._push(name)
      return () => {
        clearTimeout(source.timer)
        if (this._sources.get(name) === source) this._sources.delete(name)
      }
    }, `ctx.console.data(${JSON.stringify(name)})`)
    return Object.assign(dispose, { refresh: () => this.refresh(name) })
  }

  /** Let the console call a function of the server: `ctx.$console.call(name, ...args)`. */
  method(name: string, handler: Console.Method) {
    return this.ctx.effect(() => {
      if (this._methods.has(name)) throw new Error(`console method ${name} is registered twice`)
      this._methods.set(name, handler)
      return () => {
        if (this._methods.get(name) === handler) this._methods.delete(name)
      }
    }, `ctx.console.method(${JSON.stringify(name)})`)
  }

  /** Send the value of a data source to the clients again, soon: refreshes in a burst are sent once. */
  refresh(name: string) {
    const source = this._sources.get(name)
    if (!source || source.timer) return
    source.timer = setTimeout(() => {
      source.timer = undefined
      void this._push(name)
    }, 50)
  }

  /** Send an event to the clients, read with `ctx.$console.on(name, listener)`. */
  broadcast(name: string, payload?: unknown) {
    this._send({ type: 'event', name, payload })
  }

  private async _push(name: string, sockets = this._sockets) {
    const source = this._sources.get(name)
    if (!source || !sockets.size) return
    try {
      const value = await source.get()
      this._send({ type: 'data', name, value }, sockets)
    } catch (error) {
      this._ctx.logger('console').warn('cannot compute console data %s', name)
      this._ctx.logger('console').warn(error)
    }
  }

  private _send(message: Message, sockets = this._sockets) {
    const text = JSON.stringify(message)
    for (const socket of sockets) {
      if (socket.readyState === OPEN) socket.send(text)
    }
  }

  private _accept(socket: Socket) {
    this._sockets.add(socket)
    socket.on('close', () => this._sockets.delete(socket))
    socket.on('message', async (data) => {
      let message: Message
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (message.type !== 'call') return
      const handler = this._methods.get(message.name)
      try {
        if (!handler) throw new Error(`unknown console method ${message.name}`)
        const value = await handler(...message.args)
        this._send({ type: 'result', id: message.id, value }, new Set([socket]))
      } catch (error) {
        this._send({ type: 'result', id: message.id, error: error instanceof Error ? error.message : String(error) }, new Set([socket]))
      }
    })
    for (const name of this._sources.keys()) void this._push(name, new Set([socket]))
  }
}

export namespace Console {
  export interface Config {
    /** where the console is served */
    path: string
    /** title of the console's document */
    title: string
    /** the registry the market searches */
    registry: string
  }

  export const Config: Schema<Config> = Schema.object({
    path: Schema.string().default('/__cormi/').description('where the console is served'),
    title: Schema.string().default('Cormi Console'),
    registry: Schema.string().default('https://registry.npmjs.org').description('the registry the market searches'),
  })

  export interface Source {
    get: () => Awaitable<unknown>
    timer: ReturnType<typeof setTimeout> | undefined
  }

  export type Method = (...args: any[]) => Awaitable<unknown>
}

/** The URL of the dev server, for links. */
export function getServerUrl(ctx: Context) {
  const { host, port } = ctx.server
  return `http://${['0.0.0.0', '::'].includes(host) ? 'localhost' : host}:${port}`
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path d="M5 28.5c4.5 0 8-1 11-2.6C7.2 20.4 3.6 14.6 7.4 9.6c3-3.9 7.6-2.7 8.6 1.4 1-4.1 5.6-5.3 8.6-1.4 3.8 5-.2 11-8.6 16.3" stroke="#D7336D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="4.2" cy="28.5" r="2.4" fill="#D7336D"/></svg>')}`

function renderDocument(script: string, title: string) {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    `<link rel="icon" href="${FAVICON}">`,
    '</head>',
    '<body>',
    '<div id="cormi-console"></div>',
    `<script type="module" src="${script}"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

/**
 * The browser entry of the console: its plugins, hot-replaced one by one like
 * the app's. Files are imported by path, packages from the app root.
 */
function renderEntry(entries: App.Entry[], options: { client: string; base: string; endpoint: string }) {
  const json = (value: unknown) => JSON.stringify(value ?? null)
  const specifiers = entries.map(entry => entry.file)
  return [
    `import { mountConsole } from ${json(`${options.client}/index.tsx`)}`,
    ...specifiers.map((specifier, index) => `import * as entry${index} from ${json(specifier)}`),
    '',
    `const entries: [any, any][] = [${entries.map((entry, index) => `[entry${index}, ${entry.config === undefined ? 'undefined' : json(entry.config)}]`).join(', ')}]`,
    `const app = mountConsole(entries, { base: ${json(options.base)}, endpoint: ${json(options.endpoint)}, mountElementId: 'cormi-console' })`,
    '',
    `if (import.meta.hot) {`,
    `  import.meta.hot.accept(${json(specifiers)}, (modules) => {`,
    `    modules.forEach((module, index) => module && app.replace(index, module))`,
    `  })`,
    `}`,
    '',
  ].join('\n')
}
