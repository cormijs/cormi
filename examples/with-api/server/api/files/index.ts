import { randomUUID } from 'node:crypto'
import type { ApiContext } from '@cormijs/cormi'

export const inject = ['storage']

/** GET /api/files: the uploaded files */
export function GET(request: Request, { ctx }: ApiContext) {
  return ctx.storage.list('uploads/')
}

/** POST /api/files: a form with a `file`, stored with its type; the response has its public URL */
export async function POST(request: Request, { ctx }: ApiContext) {
  const file = (await request.formData()).get('file')
  if (!(file instanceof File)) return Response.json({ error: 'file is required' }, { status: 400 })
  // the name as a part of a key: no directories, no dots in front, nothing that a URL would escape
  const name = file.name.split(/[\\/]/).pop()!.replace(/[^\w.-]+/g, '-').replace(/^[.-]+/, '') || 'file'
  const object = await ctx.storage.put(`uploads/${randomUUID()}/${name}`, file, { contentType: file.type })
  return Response.json(object, { status: 201 })
}
