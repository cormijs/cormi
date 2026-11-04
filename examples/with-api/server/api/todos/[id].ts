import type { ApiContext } from '@cormijs/cormi'

export const inject = ['database']

type Params = { id: string }

export async function GET(request: Request, { params, ctx }: ApiContext<Params>) {
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo ?? Response.json({ error: 'not found' }, { status: 404 })
}

export async function PATCH(request: Request, { params, ctx }: ApiContext<Params>) {
  const { title, done } = await request.json()
  const { matched } = await ctx.database.set('todo', { id: Number(params.id) }, {
    ...typeof title === 'string' && { title },
    ...typeof done === 'boolean' && { done },
  })
  if (!matched) return Response.json({ error: 'not found' }, { status: 404 })
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo
}

export async function DELETE(request: Request, { params, ctx }: ApiContext<Params>) {
  const { removed } = await ctx.database.remove('todo', { id: Number(params.id) })
  return new Response(null, { status: removed ? 204 : 404 })
}
