import type { ApiContext } from '@cormijs/cormi'

export const inject = ['database']

export async function GET(request: Request, { ctx }: ApiContext) {
  return ctx.database.get('todo', {}, { sort: { id: 'asc' } })
}

export async function POST(request: Request, { ctx }: ApiContext) {
  const { title } = await request.json()
  if (typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'title is required' }, { status: 400 })
  }
  const todo = await ctx.database.create('todo', { title: title.trim(), done: false, createdAt: new Date() })
  return Response.json(todo, { status: 201 })
}
