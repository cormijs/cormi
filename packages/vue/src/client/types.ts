import type { RouteModule as BaseRouteModule } from '@cormijs/runtime'
import type { Component } from 'vue'

export type { HistoryType, RouteData } from '@cormijs/runtime'

/** The arguments of a server `loader`: `LoaderArgs<LoaderContext>` with `LoaderContext` of `@cormijs/cormi`. */
export interface LoaderArgs<Context = any> {
  request: Request
  params: Record<string, string | string[]>
  /** on the server: the context of the app (`ctx`) and the state of the request */
  context: Context
}

/** The arguments of a `clientLoader`: `serverLoader()` fetches the data of the route's `loader`. */
export interface ClientLoaderArgs extends Omit<LoaderArgs, 'context'> {
  serverLoader: () => Promise<unknown>
}

/** Exports of a route module of a Vue app: a `.vue` file, whose `<script>` exports the loaders. */
export interface RouteModule extends BaseRouteModule {
  default?: Component
  /** runs on the server; removed from the client bundle */
  loader?: (args: LoaderArgs) => unknown
  /** runs in the browser */
  clientLoader?: (args: ClientLoaderArgs) => unknown
}

export type RouteModules = Record<string, () => Promise<RouteModule>>
