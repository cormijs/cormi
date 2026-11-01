import '@fontsource-variable/recursive/full.css'
import { Context, render, unwrapExports, useCordis } from '@cormijs/react/client'
import { Service } from 'cordis'
import { type ComponentType, type ReactNode, useCallback, useMemo, useSyncExternalStore } from 'react'
import { Shell } from './shell.tsx'
import './style.css'

declare module 'cordis' {
  interface Context {
    $console: ConsoleService
  }
}

export interface PageOptions {
  /** path below the console, e.g. `/plugins` */
  path: string
  /** the title, also shown in the menu */
  name: string
  /** an icon in the menu */
  icon?: ReactNode
  /** pages with a lower order come first in the menu */
  order?: number
  component: ComponentType
}

/** The route of the console's frame; pages are its children. */
export const LAYOUT = 'console'

type Status = 'connecting' | 'open' | 'closed'

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

/**
 * The console in the browser (`ctx.$console`): the connection to the server,
 * its data, and the pages of the console. Provided on the root context.
 */
export class ConsoleService extends Service {
  status: Status = 'connecting'
  private _data: Record<string, unknown> = {}
  private _socket: WebSocket | undefined
  private _id = 0
  private _pending = new Map<number, Pending>()
  private _listeners = new Map<string, Set<() => void>>()
  private _events = new Map<string, Set<(payload: any) => void>>()
  private _retry = 0

  constructor(ctx: Context, private options: { endpoint: string }) {
    super(ctx, '$console')
    this._connect()
  }

  /**
   * Add a page to the console. The page is a route below the console's
   * frame and an item of its menu; it is removed when the plugin is disposed.
   */
  page(options: PageOptions) {
    const id = `${LAYOUT}:${options.path}`
    const meta = { name: options.name, icon: options.icon, order: options.order ?? 100 }
    return (this.ctx as unknown as Context).$router.add(
      [{ id, path: options.path, parentId: LAYOUT, meta }],
      { [id]: async () => ({ default: options.component }) },
    )
  }

  /** Call a method registered on the server with `ctx.console.method()`. */
  call<T = any>(name: string, ...args: unknown[]): Promise<T> {
    const socket = this._socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('the console is not connected'))
    const id = ++this._id
    return new Promise<T>((resolve, reject) => {
      this._pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      socket.send(JSON.stringify({ type: 'call', id, name, args }))
    })
  }

  /** Listen to an event the server broadcasts, as long as the calling plugin lives. */
  listen<T = any>(name: string, listener: (payload: T) => void) {
    return this.ctx.effect(() => {
      let listeners = this._events.get(name)
      if (!listeners) this._events.set(name, listeners = new Set())
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }, `ctx.$console.listen(${JSON.stringify(name)})`)
  }

  get<T>(name: string): T | undefined {
    return this._data[name] as T | undefined
  }

  subscribe = (name: string, listener: () => void) => {
    let listeners = this._listeners.get(name)
    if (!listeners) this._listeners.set(name, listeners = new Set())
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  private _notify(name: string) {
    for (const listener of this._listeners.get(name) ?? []) listener()
  }

  private _setStatus(status: Status) {
    this.status = status
    this._notify('$status')
  }

  private _connect() {
    const url = new URL(this.options.endpoint, location.href)
    url.protocol = url.protocol.replace('http', 'ws')
    const socket = new WebSocket(url)
    this._socket = socket
    this._setStatus('connecting')
    socket.onopen = () => {
      this._retry = 0
      this._setStatus('open')
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'data') {
        this._data = { ...this._data, [message.name]: message.value }
        this._notify(message.name)
      } else if (message.type === 'event') {
        for (const listener of this._events.get(message.name) ?? []) listener(message.payload)
      } else if (message.type === 'result') {
        const pending = this._pending.get(message.id)
        this._pending.delete(message.id)
        if (message.error) pending?.reject(new Error(message.error))
        else pending?.resolve(message.value)
      }
    }
    socket.onclose = () => {
      for (const pending of this._pending.values()) pending.reject(new Error('the connection to the server closed'))
      this._pending.clear()
      this._setStatus('closed')
      // the dev server restarts now and then: keep trying, slower and slower
      const delay = Math.min(5000, 500 * 2 ** this._retry++)
      setTimeout(() => this._connect(), delay)
    }
  }
}

/** The console's service, in a component. Reading `ctx.$console` gives a new proxy every time: keep one. */
export function useConsole(): ConsoleService {
  const ctx = useCordis()
  return useMemo(() => ctx.$console, [ctx])
}

/** The value of a data source of the server, `undefined` until it arrives. */
export function useData<T>(name: string): T | undefined {
  const console = useConsole()
  const subscribe = useCallback((listener: () => void) => console.subscribe(name, listener), [console, name])
  return useSyncExternalStore(subscribe, () => console.get<T>(name))
}

/** The state of the connection to the server. */
export function useStatus(): Status {
  const console = useConsole()
  const subscribe = useCallback((listener: () => void) => console.subscribe('$status', listener), [console])
  return useSyncExternalStore(subscribe, () => console.status)
}

export interface MountOptions {
  base: string
  endpoint: string
  mountElementId: string
}

/** Create the console's context, apply its plugins, then render it. */
export function mountConsole(entries: [any, any][], options: MountOptions) {
  const ctx = new Context({
    routes: { [LAYOUT]: { id: LAYOUT, path: '/', isLayout: true } },
    routeModules: { [LAYOUT]: async () => ({ default: Shell }) },
    base: options.base,
    history: 'browser',
  })
  // eslint-disable-next-line no-new
  new ConsoleService(ctx, { endpoint: options.endpoint })
  const fibers = entries.map(([module, config]) => ctx.plugin(unwrapExports(module), config))
  void Promise.allSettled(fibers).then(() => render(ctx, { mountElementId: options.mountElementId }))
  return {
    ctx,
    /** hot-replace the plugin at `index` */
    replace(index: number, module: any) {
      void fibers[index].dispose()
      fibers[index] = ctx.plugin(unwrapExports(module), entries[index][1])
    },
  }
}

export { CodeLine, Empty, Lamp, Section, Tag } from './ui.tsx'
