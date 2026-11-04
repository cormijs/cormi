import type { ApiContext } from '@cormijs/cormi'

export const inject = ['storage']

/** DELETE /api/files/uploads/<id>/<name> */
export async function DELETE(request: Request, { ctx, params }: ApiContext<{ key: string[] }>) {
  const key = params.key.join('/')
  if (!key.startsWith('uploads/')) return Response.json({ error: 'not found' }, { status: 404 })
  if (!await ctx.storage.head(key)) return Response.json({ error: 'not found' }, { status: 404 })
  await ctx.storage.delete(key)
  return new Response(null, { status: 204 })
}
