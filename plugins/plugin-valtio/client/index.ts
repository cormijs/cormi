import type { Context } from '@cormi/react/client'
import { proxy } from 'valtio'
import { devtools } from 'valtio/utils'

export * from 'valtio'
export * from 'valtio/utils'

const stores = new Map<string, object>()
let connect: ((name: string, store: object) => () => void) | undefined

/**
 * A store: a valtio proxy of `state`, named for Redux DevTools.
 *
 * Stores are module state: during server rendering they are shared by every
 * request, so keep request-specific data out of them.
 */
export function defineStore<T extends object>(name: string, state: T): T {
  const store = proxy(state)
  stores.set(name, store)
  connect?.(name, store)
  return store
}

export default (ctx: Context, config: { devtools: boolean }) => {
  if (!config.devtools || import.meta.env.SSR) return
  // stores are usually defined before the plugin is applied, and may be defined after
  const disposables: (() => void)[] = []
  connect = (name, store) => {
    const dispose = devtools(store, { name, enabled: true })
    if (dispose) disposables.push(dispose)
    return dispose ?? (() => {})
  }
  for (const [name, store] of stores) connect(name, store)
  ctx.effect(() => () => {
    connect = undefined
    for (const dispose of disposables.splice(0)) dispose()
  }, 'valtio devtools')
}
