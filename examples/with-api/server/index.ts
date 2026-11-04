import { randomUUID } from 'node:crypto'
import type { Context } from '@cormijs/cormi'

declare module '@cormijs/cormi' {
  interface State {
    /** the id of the request, set by the middleware below */
    requestId: string
  }
}

export const inject = ['middleware']

/** The app's own plugin on the server: a middleware around the API routes. */
export function apply(ctx: Context) {
  ctx.middleware.use(async (request, { state }, next) => {
    const start = performance.now()
    state.requestId = request.headers.get('x-request-id') ?? randomUUID()
    const response = await next()
    response.headers.set('x-request-id', state.requestId)
    response.headers.set('server-timing', `app;dur=${(performance.now() - start).toFixed(1)}`)
    return response
  }, { path: '/api' })
}
