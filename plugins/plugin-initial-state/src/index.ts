import type { Context } from 'cormi'

export const name = 'initial-state'
export const inject = ['app']

/**
 * The initial state of the app, e.g. the current user. A runtime plugin
 * provides it by listening to `initialState/load`:
 *
 * ```ts
 * // src/app.ts
 * export default (ctx: Context) => {
 *   ctx.on('initialState/load', () => fetch('/api/me').then(res => res.json()))
 * }
 * ```
 *
 * Components read it with `useInitialState()` from `@cormi/plugin-initial-state/client`.
 */
export function apply(ctx: Context) {
  ctx.app.entry('@cormi/plugin-initial-state/client')
}
