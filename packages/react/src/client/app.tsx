import { AppService as BaseAppService } from '@cormi/runtime'
import type { Context as CordisContext } from 'cordis'
import React, { type ComponentType, type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import type { Context } from './context.ts'

export type Wrapper = ComponentType<{ children: ReactNode }>

interface WrapperEntry {
  component: Wrapper
  order: number
}

/**
 * The root of a React app in the browser (`ctx.$app`). Plugins wrap the app
 * with providers through `ctx.wrap()`; wrappers are re-applied whenever one
 * is added or disposed.
 */
export class AppService extends BaseAppService {
  private _entries: WrapperEntry[] = []
  private _snapshot: Wrapper[] = []
  private _listeners = new Set<() => void>()

  constructor(ctx: CordisContext) {
    super(ctx)
  }

  /**
   * Wrap the app root with a component. Wrappers with a higher `order` are
   * outer; with equal orders, later registrations are outer.
   */
  wrap(component: Wrapper, order = 0) {
    const entry: WrapperEntry = { component, order }
    return this.ctx.effect(() => {
      const index = this._entries.findIndex(item => item.order > order)
      this._entries.splice(index < 0 ? this._entries.length : index, 0, entry)
      this._update()
      return () => {
        this._entries = this._entries.filter(item => item !== entry)
        this._update()
      }
    }, 'ctx.wrap()')
  }

  subscribe = (listener: () => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getWrappers = () => this._snapshot

  private _update() {
    this._snapshot = this._entries.map(entry => entry.component)
    for (const listener of this._listeners) listener()
  }
}

export const CordisContextReact = React.createContext<Context>(null!)

/** The context of the app. */
export function useCordis(): Context {
  return React.useContext(CordisContextReact)
}

/**
 * A context whose effects are disposed when the component unmounts, like
 * koishi's `useContext()`: listeners and wrappers registered through it
 * live as long as the component.
 */
export function useContext(): Context {
  const parent = useCordis()
  const [fiber] = useState(() => parent.plugin(() => {}))
  useEffect(() => () => {
    void fiber.dispose()
  }, [fiber])
  return fiber.ctx as Context
}

/** The props given by the host that mounted the app (see `AppService.props`). */
export function useHostProps<T extends Record<string, any> = Record<string, any>>(): T {
  const { $app } = useCordis()
  return useSyncExternalStore($app.subscribeProps, $app.getProps, $app.getProps) as T
}

/** Renders `children` inside the wrappers registered with `ctx.wrap()`. */
export function Root(props: { ctx: Context; children: ReactNode }) {
  const { $app } = props.ctx
  const wrappers = useSyncExternalStore($app.subscribe, $app.getWrappers, $app.getWrappers)
  let node = props.children
  for (const Wrapper of wrappers) node = <Wrapper>{node}</Wrapper>
  return <CordisContextReact.Provider value={props.ctx}>{node}</CordisContextReact.Provider>
}
