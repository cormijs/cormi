import * as cordis from 'cordis'
import type { AppService } from './app.ts'
import type { RouterService } from './router.ts'

export interface Context {
  $app: AppService
  $router: RouterService
}

/**
 * The cordis context of the app in the browser (and during server
 * rendering), as plugins that do not depend on a UI framework see it. The
 * renderer creates it with its own `$app` and `$router`; like koishi's
 * client, they are provided on the root context, so every browser plugin
 * reaches them without `inject`.
 */
export abstract class Context extends cordis.Context {}
