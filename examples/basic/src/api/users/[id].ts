import type { ApiHandler } from 'cormi'
import { users } from './index.ts'

export const GET: ApiHandler = (request, { params }) => {
  const user = users.find(user => String(user.id) === params.id)
  if (!user) return Response.json({ error: 'not found' }, { status: 404 })
  return user
}
