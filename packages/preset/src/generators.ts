import { join } from 'node:path'
import { createFile } from '@cormijs/core'
import { Context } from 'cordis'

/** Generators of `cormi generate` that every app has: API routes. The UI framework adds pages and components. */
export function Generators(ctx: Context) {
  ctx.cli.generator('api', {
    description: 'an API route: src/api/<name>.ts',
    async run(name) {
      return [await createFile(join(ctx.cormi.paths.src, 'api', `${name}.ts`), [
        `import type { ApiHandler } from '@cormijs/cormi'`,
        '',
        `export const GET: ApiHandler = (request, { params }) => {`,
        `  return { params }`,
        `}`,
        '',
      ].join('\n'))]
    },
  })
}
