import type { ApiContext } from '@cormijs/cormi'

export const inject = ['auth']

/** POST /api/logout */
export function POST(request: Request, { ctx, state }: ApiContext) {
  ctx.auth.logout(state)
  return new Response(null, { status: 204 })
}
