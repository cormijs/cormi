import { existsSync } from 'node:fs'
import { appendFile, readFile } from 'node:fs/promises'
import Logger from '@cordisjs/plugin-logger'
import { CommandError, createFile } from '@cormijs/core'
import { Context } from 'cordis'
import Database from 'minato'

export * from 'minato'

export const name = 'database'

/**
 * The database of the app: minato's `ctx.model` (tables and migrations) and,
 * once a driver is loaded, `ctx.database` (queries). The driver is another
 * plugin of cormi.yml, e.g. `@minatojs/driver-sqlite`, `-mysql`, `-postgres`,
 * `-mongo` or `-memory`.
 *
 * The database runs when the app serves (`cormi dev`, `cormi start`): a
 * build does not connect to it. Tables are declared in plugins that inject
 * `model` (e.g. `server/models/*.ts`), their types by declaration merging:
 *
 * ```ts
 * declare module '@cormijs/database' {
 *   interface Tables { user: { id: number; name: string } }
 * }
 * ```
 */
export function apply(ctx: Context) {
  ctx.plugin(Generators)
  // the database is the server's: when the app builds or writes files, `model` is not provided,
  // and the drivers, which inject it, wait without connecting
  if (!ctx.cormi.serving) return
  // the drivers of minato inject a logger service, which the core of cordis 4 does not provide
  if (!ctx.get('logger' as any)) ctx.plugin(Logger)
  ctx.plugin(Database)
}

const REFERENCE = '/// <reference types="@cormijs/database" />'

/**
 * `cormi g model <name>`: a table, in server/models. The types of the
 * database are referenced by server/env.d.ts, so that `ctx.model` and
 * `ctx.database` are typed in the server code.
 */
function Generators(ctx: Context) {
  ctx.cli.generator('model', {
    description: 'a table of the database: server/models/<name>.ts',
    async run(name) {
      if (!/^[a-z]\w*$/i.test(name)) throw new CommandError(`invalid table name: ${name}`)
      const type = name[0].toUpperCase() + name.slice(1)
      const files = [await createFile(ctx.cormi.resolve('server/models', `${name}.ts`), [
        `import type { Context } from '@cormijs/cormi'`,
        '',
        `export interface ${type} {`,
        `  id: number`,
        `  createdAt: Date`,
        `}`,
        '',
        `declare module '@cormijs/database' {`,
        `  interface Tables {`,
        `    ${name}: ${type}`,
        `  }`,
        `}`,
        '',
        `export const inject = ['model']`,
        '',
        `/** The table of ${name}, created or migrated when the app starts. */`,
        `export function apply(ctx: Context) {`,
        `  ctx.model.extend('${name}', {`,
        `    id: 'unsigned',`,
        `    createdAt: 'timestamp',`,
        `  }, { autoInc: true })`,
        `}`,
        '',
      ].join('\n'))]
      const env = ctx.cormi.resolve('server/env.d.ts')
      if (!existsSync(env)) {
        files.push(await createFile(env, `// The types of the services the server code uses: a line for each plugin of cormi.yml that provides one\n${REFERENCE}\n`))
      } else if (!(await readFile(env, 'utf8')).includes(REFERENCE)) {
        await appendFile(env, `${REFERENCE}\n`)
        files.push(env)
      }
      return files
    },
  })
}
