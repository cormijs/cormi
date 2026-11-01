export { AppService } from './app.ts'
export { Context } from './context.ts'
export { LOADER_ENDPOINT, REDIRECT_HEADER } from './constants.ts'
export { fetchLoader, RouterService, type RouterOptions } from './router.ts'
export type * from './types.ts'

/** The cordis plugin of a module: its `apply` exports, or its default export. */
export function unwrapExports(module: any) {
  return typeof module?.apply === 'function' ? module : module?.default ?? module
}
