import { Context as BaseContext } from '@cormi/runtime'
import { AppService } from './app.tsx'
import { RouterService, type RouterOptions } from './router.ts'

export interface Context {
  $app: AppService
  $router: RouterService
  /** shortcut of `ctx.$app.wrap()` */
  wrap: AppService['wrap']
}

/**
 * The cordis context of a React app in the browser (and during server
 * rendering).
 *
 * Like koishi's client, the core services are provided on the root context,
 * so every runtime plugin reaches them without `inject`. Their names start
 * with `$` so they never collide with the node services of the same app.
 */
export class Context extends BaseContext {
  constructor(options: Context.Options) {
    super()
    // eslint-disable-next-line no-new
    new AppService(this)
    // eslint-disable-next-line no-new
    new RouterService(this, options)
    this.mixin('$app', ['wrap'])
  }
}

export namespace Context {
  export interface Options extends RouterOptions {}
}
