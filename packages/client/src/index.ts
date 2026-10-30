export * from 'react-router'
export { AppService, Root, useContext, useCordis, type Wrapper } from './app.tsx'
export { Context } from './context.ts'
export { ServerInsertedHTMLContext, useServerInsertedHTML } from './inserted.tsx'
export { Link, type LinkProps, type PrefetchMode } from './link.tsx'
export { render, type RenderOptions } from './render.tsx'
export { LOADER_ENDPOINT, REDIRECT_HEADER } from './constants.ts'
export { fetchLoader, type HistoryType, RouterService, type RouterOptions } from './router.ts'
export type * from './types.ts'

/** The cordis plugin of a module: its `apply` exports, or its default export. */
export function unwrapExports(module: any) {
  return typeof module?.apply === 'function' ? module : module?.default ?? module
}
