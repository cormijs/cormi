// The node API of Cormi, for plugins. The browser API is `@cormijs/cormi/client`.
import type {} from '@cordisjs/plugin-loader'
import type {} from '@cordisjs/plugin-server'

export { Context, type Fiber, type Plugin, Service } from 'cordis'
export * from '@cormijs/core'
export {
  type ApiContext,
  type ApiHandler,
  type ApiModule,
  type ApiRouteInfo,
  type ApiRouteStatus,
  ApiRoutes,
  type CookieOptions,
  createApp,
  type CreateAppOptions,
  getApiRouteModules,
  getApiRoutes,
  getCookies,
  getOrigin,
  getRequestContext,
  json,
  type LoaderContext,
  type Middleware,
  MiddlewareService,
  Pages,
  Proxy,
  type ProxyOptions,
  renderApiTypes,
  type RequestContext,
  scanServerCode,
  send,
  setCookie,
  type ServerCode,
  type ServerRequest,
  type ServerResponse,
  type State,
  Static,
  type TestApp,
  toRequest,
} from '@cormijs/server'
export {
  api,
  type ApiClient,
  type ApiClientOptions,
  type ApiRequest,
  type ApiRequestOptions,
  type ApiRouteContract,
  createApiClient,
  type TypedResponse,
} from '@cormijs/runtime'
export { type AppInfo, Console, formatAppInfo, getAppInfo } from '@cormijs/console'
export { type AppCheckReport, checkApp, type CheckAppOptions, type CheckDiagnostic, formatAppCheck } from './check.ts'
export { createMcpBridge, type McpBridge, type McpBridgeOptions, type McpToolSchema, runMcpServer } from './mcp.ts'
