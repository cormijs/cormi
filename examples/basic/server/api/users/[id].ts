import type { ApiContext } from '@cormijs/cormi'
import { users } from './index.ts'

export function GET(request: Request, { params }: ApiContext) {
  const user = users.find(user => String(user.id) === params.id)
  if (!user) return Response.json({ error: 'not found' }, { status: 404 })
  return user
}
