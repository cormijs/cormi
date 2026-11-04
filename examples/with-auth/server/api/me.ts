import type { ApiContext } from '@cormijs/cormi'

// a signed-in user: 401 otherwise
export const auth = true

/** GET /api/me */
export function GET(request: Request, { state }: ApiContext) {
  return state.user
}
