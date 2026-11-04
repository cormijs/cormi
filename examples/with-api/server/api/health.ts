import type { ApiContext } from '@cormijs/cormi'

/** No services: it answers while the database starts. The state is the middleware's. */
export function GET(request: Request, { ctx, state }: ApiContext) {
  return { ok: true, mode: ctx.cormi.mode, requestId: state.requestId }
}
