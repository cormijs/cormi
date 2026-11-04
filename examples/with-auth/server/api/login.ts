import type { ApiContext } from '@cormijs/cormi'
import { users } from '../users.ts'

export const inject = ['auth']

/** POST /api/login `{ name, password }` */
export async function POST(request: Request, { ctx, state }: ApiContext) {
  const { name, password } = await request.json()
  const user = users.find(user => user.name === name)
  if (!user || typeof password !== 'string' || !await ctx.auth.verify(password, user.password)) {
    return Response.json({ error: 'wrong name or password' }, { status: 401 })
  }
  ctx.auth.login(state, { name: user.name, role: user.role })
  return state.user
}
