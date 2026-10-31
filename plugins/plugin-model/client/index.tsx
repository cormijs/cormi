import models from '@@/plugin-model/models'
import type { Context } from 'cormi/client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/** Models of the app by namespace; declared in the generated `src/.cormi/plugin-model/types.d.ts`. */
export interface Models {}

class Store {
  values = new Map<string, unknown>()
  private _listeners = new Map<string, Set<() => void>>()

  subscribe(namespace: string, listener: () => void) {
    let listeners = this._listeners.get(namespace)
    if (!listeners) this._listeners.set(namespace, listeners = new Set())
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  notify(namespace: string) {
    for (const listener of this._listeners.get(namespace) ?? []) listener()
  }
}

const StoreContext = createContext<Store | null>(null)

// modules exporting something else than a hook (e.g. dva models) are not models
const hooks = Object.entries<unknown>(models).filter((entry): entry is [string, () => unknown] => typeof entry[1] === 'function')
const namespaces = new Set(hooks.map(([namespace]) => namespace))

/** Runs the hook of a model. The value is stored during render, so later siblings read it in the same pass. */
function Executor(props: { store: Store; namespace: string; hook: () => unknown }) {
  const value = props.hook()
  props.store.values.set(props.namespace, value)
  useEffect(() => props.store.notify(props.namespace), [value])
  return null
}

export default (ctx: Context) => {
  ctx.wrap(({ children }) => {
    // one store per rendered app: server-rendered requests do not share state
    const [store] = useState(() => new Store())
    return (
      <StoreContext.Provider value={store}>
        {hooks.map(([namespace, hook]) => (
          <Executor key={namespace} store={store} namespace={namespace} hook={hook} />
        ))}
        {children}
      </StoreContext.Provider>
    )
  })
}

/** The value of a model; with a selector, the component only re-renders when the selected value changes. */
export function useModel<K extends keyof Models>(namespace: K): Models[K]
export function useModel<K extends keyof Models, T>(namespace: K, selector: (model: Models[K]) => T): T
export function useModel(namespace: string, selector?: (model: any) => unknown) {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useModel() is called outside of the app')
  if (!namespaces.has(namespace)) throw new Error(`model ${namespace} is not found in src/models`)
  const cache = useRef<{ value: unknown; result: unknown }>(undefined)
  const subscribe = useCallback((listener: () => void) => store.subscribe(namespace, listener), [store, namespace])
  const getSnapshot = () => {
    const value = store.values.get(namespace)
    if (!selector) return value
    if (!cache.current || cache.current.value !== value) cache.current = { value, result: selector(value) }
    return cache.current.result
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
