import { Context as CordisContext, Service } from 'cordis'
import React, { type ComponentType, type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import type { Context } from './context.ts'

declare module 'cordis' {
  interface Events {
    /**
     * The app was rendered into the page for the first time. Browser only.
     * @mode emit
     */
    'app/mount'(): void
  }
}

export type Wrapper = ComponentType<{ children: ReactNode }>

interface WrapperEntry {
  component: Wrapper
  order: number
}

/**
 * The root of the app in the browser (`ctx.$app`). Plugins wrap the app with
 * providers through `ctx.wrap()`; wrappers are re-applied whenever one is
 * added or disposed.
 */
export class AppService extends Service {
  private _entries: WrapperEntry[] = []
  private _snapshot: Wrapper[] = []
  private _listeners = new Set<() => void>()

  constructor(ctx: CordisContext) {
    super(ctx, '$app')
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

/** Renders `children` inside the wrappers registered with `ctx.wrap()`. */
export function Root(props: { ctx: Context; children: ReactNode }) {
  const { $app } = props.ctx
  const wrappers = useSyncExternalStore($app.subscribe, $app.getWrappers, $app.getWrappers)
  let node = props.children
  for (const Wrapper of wrappers) node = <Wrapper>{node}</Wrapper>
  return <CordisContextReact.Provider value={props.ctx}>{node}</CordisContextReact.Provider>
}
