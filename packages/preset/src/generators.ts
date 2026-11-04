import { join } from 'node:path'
import { createFile } from '@cormijs/core'
import { Context } from 'cordis'

/** Generators of `cormi generate` that every app has: API routes. The UI framework adds pages and components. */
export function Generators(ctx: Context) {
  ctx.cli.generator('api', {
    description: 'an API route: server/api/<name>.ts, e.g. users/[id]',
    async run(name) {
      return [await createFile(ctx.cormi.resolve('server/api', `${name}.ts`), [
        `import type { ApiContext } from '@cormijs/cormi'`,
        '',
        `// the services the handlers use, e.g. ['database']`,
        `export const inject: string[] = []`,
        '',
        `export async function GET(request: Request, { params }: ApiContext) {`,
        `  return { params }`,
        `}`,
        '',
      ].join('\n'))]
    },
  })
}
