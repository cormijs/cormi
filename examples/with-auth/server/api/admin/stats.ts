import type { ApiContext } from '@cormijs/cormi'
import type { User } from '@cormijs/plugin-auth'
import { users } from '../../users.ts'

// an admin: 401 without a user, 403 for the others
export const auth = (user: User) => user.role === 'admin'

/** GET /api/admin/stats */
export function GET(request: Request, { state }: ApiContext) {
  return { users: users.length, by: state.user!.name }
}
