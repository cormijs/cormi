import { AppService as BaseAppService } from '@cormijs/runtime'
import type { Context as CordisContext } from 'cordis'
import { type App, type Component, defineComponent, h, inject, type InjectionKey, onScopeDispose, type Plugin, type ShallowRef, shallowRef, type VNode } from 'vue'
import { RouterView } from 'vue-router'
import type { Context } from './context.ts'

/** A component that renders the app in its default slot, e.g. a provider. */
export type Wrapper = Component

interface WrapperEntry {
  component: Wrapper
  order: number
}

/**
 * The root of a Vue app in the browser (`ctx.$app`). Plugins install Vue
 * plugins with `ctx.$app.use()` and wrap the app with `ctx.wrap()`; the app
 * is mounted again when a Vue plugin is disposed, as Vue cannot uninstall it.
 */
export class AppService extends BaseAppService {
  private _plugins: [Plugin, any[]][] = []
  private _entries: WrapperEntry[] = []
  private _snapshot: Wrapper[] = []
  private _listeners = new Set<(remount: boolean) => void>()

  constructor(ctx: CordisContext) {
    super(ctx)
  }

  /** Install a Vue plugin in the app, like `app.use()`: a store, a component library. */
  use(plugin: Plugin, ...options: any[]) {
    const entry: [Plugin, any[]] = [plugin, options]
    return this.ctx.effect(() => {
      this._plugins.push(entry)
      this._update(true)
      return () => {
        this._plugins = this._plugins.filter(item => item !== entry)
        this._update(true)
      }
    }, 'ctx.$app.use()')
  }

  /**
   * Wrap the app root with a component that renders its default slot.
   * Wrappers with a higher `order` are outer; with equal orders, later
   * registrations are outer.
   */
  wrap(component: Wrapper, order = 0) {
    const entry: WrapperEntry = { component, order }
    return this.ctx.effect(() => {
      const index = this._entries.findIndex(item => item.order > order)
      this._entries.splice(index < 0 ? this._entries.length : index, 0, entry)
      this._update(false)
      return () => {
        this._entries = this._entries.filter(item => item !== entry)
        this._update(false)
      }
    }, 'ctx.wrap()')
  }

  /** Install the Vue plugins in a Vue app. */
  install(app: App) {
    for (const [plugin, options] of this._plugins) app.use(plugin, ...options)
  }

  /** Listen to registrations: `remount` when the Vue plugins changed. */
  subscribe = (listener: (remount: boolean) => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getWrappers = () => this._snapshot

  private _update(remount: boolean) {
    this._snapshot = this._entries.map(entry => entry.component)
    for (const listener of this._listeners) listener(remount)
  }
}

export const cordisKey: InjectionKey<Context> = Symbol('cordis')

/** The context of the app. */
export function useCordis(): Context {
  return inject(cordisKey)!
}

/**
 * A context whose effects are disposed with the component, like koishi's
 * `useContext()`: listeners and wrappers registered through it live as long
 * as the component.
 */
export function useContext(): Context {
  const fiber = useCordis().plugin(() => {})
  onScopeDispose(() => {
    void fiber.dispose()
  })
  return fiber.ctx as Context
}

/** The props given by the host that mounted the app (see `AppService.props`), as a ref. */
export function useHostProps<T extends Record<string, any> = Record<string, any>>(): ShallowRef<T> {
  const { $app } = useCordis()
  const props = shallowRef($app.getProps()) as ShallowRef<T>
  onScopeDispose($app.subscribeProps(() => {
    props.value = $app.getProps() as T
  }))
  return props
}

/** The root component: the matched routes inside the wrappers registered with `ctx.wrap()`. */
export function createRoot(ctx: Context) {
  return defineComponent({
    name: 'CormiRoot',
    setup() {
      const wrappers = shallowRef(ctx.$app.getWrappers())
      onScopeDispose(ctx.$app.subscribe(() => {
        wrappers.value = ctx.$app.getWrappers()
      }))
      return () => wrappers.value.reduce<VNode>((node, wrapper) => h(wrapper, null, { default: () => node }), h(RouterView))
    },
  })
}
