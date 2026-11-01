import type { RouteModule as BaseRouteModule } from '@cormijs/runtime'
import type { ComponentType } from 'react'
import type { ClientLoaderFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunction } from 'react-router'

export type { HistoryType, RouteData } from '@cormijs/runtime'

/** Exports of a route module of a React app. */
export interface RouteModule extends BaseRouteModule {
  default?: ComponentType
  /** runs on the server; removed from the client bundle */
  loader?: (args: LoaderFunctionArgs) => unknown
  /** runs in the browser */
  clientLoader?: (args: ClientLoaderFunctionArgs) => unknown
  ErrorBoundary?: ComponentType
  HydrateFallback?: ComponentType
  handle?: unknown
  shouldRevalidate?: ShouldRevalidateFunction
}

export type RouteModules = Record<string, () => Promise<RouteModule>>
