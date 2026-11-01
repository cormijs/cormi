import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Events {
    /**
     * The browser entry is about to mount the app. A listener returning `true`
     * takes over: the app is mounted when the host calls the `mount()` export
     * of the entry, e.g. a micro-frontend framework. Browser only.
     * @mode bail
     */
    'app/bootstrap'(): boolean | void
    /**
     * The app was rendered into the page. Browser only.
     * @mode emit
     */
    'app/mount'(): void
    /**
     * The host updated the props of the app.
     * @mode emit
     * @param props the new props
     */
    'app/props'(props: Record<string, any>): void
  }
}

/**
 * The app in the browser (`ctx.$app`): its lifecycle and the props a host
 * gives it. UI frameworks extend it, e.g. with the wrappers of the app root.
 */
export class AppService extends Service {
  /** Props given by the host that mounted the app, e.g. a qiankun master; empty when the app runs by itself. */
  props: Record<string, any> = {}

  private _propsListeners = new Set<() => void>()

  constructor(ctx: Context) {
    super(ctx, '$app')
  }

  setProps(props: Record<string, any>) {
    this.props = props
    this.ctx.emit('app/props', props)
    for (const listener of this._propsListeners) listener()
  }

  subscribeProps = (listener: () => void) => {
    this._propsListeners.add(listener)
    return () => {
      this._propsListeners.delete(listener)
    }
  }

  getProps = () => this.props
}
