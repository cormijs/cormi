import { existsSync } from 'node:fs'
import { appendFile, readFile } from 'node:fs/promises'
import Logger from '@cordisjs/plugin-logger'
import type {} from '@cormijs/console'
import { CommandError, createFile } from '@cormijs/core'
import { Context } from 'cordis'
import Database, { $ } from 'minato'

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
  // the page of the console, in dev mode
  ctx.inject(['console', 'model', 'database'], ConsolePage)
}

/** A table, as the page of the console shows it. */
export interface TableInfo {
  name: string
  primary: string[]
  autoInc: boolean
  fields: { name: string; type: string; length?: number; nullable?: boolean; initial?: unknown }[]
  unique: string[][]
  indexes: { name?: string; unique: boolean; keys: string[] }[]
  /** the number of rows; `null` if it could not be counted */
  count: number | null
}

const DATE_TYPES = ['timestamp', 'date', 'time']

/** The tables and their rows, in the console: browsed by pages, created, edited and removed. */
function ConsolePage(ctx: Context) {
  ctx.console.entry('@cormijs/database/console')

  const primaryOf = (table: string) => [ctx.model.tables[table].primary].flat()
  // any table of the app: the typings know the declared ones only
  const database: any = ctx.database
  const tables = ctx.console.data('database/tables', async () => {
    return Promise.all(Object.entries(ctx.model.tables).map(async ([name, model]): Promise<TableInfo> => {
      const primary = [model.primary].flat()
      const count = await database.eval(name, (row: any) => $.count(row[primary[0]])).catch(() => null)
      return {
        name,
        primary,
        autoInc: !!model.autoInc,
        fields: Object.entries(model.fields).filter(([, field]) => field && !field.deprecated).map(([key, field]) => ({
          name: key,
          type: field!.deftype ?? String(field!.type?.type ?? ''),
          length: field!.length,
          nullable: field!.nullable,
          initial: field!.initial,
        })),
        unique: model.unique.map(keys => [keys].flat()),
        indexes: (model.indexes ?? []).map(index => ({ name: index.name, unique: !!index.unique, keys: Object.keys(index.keys) })),
        count,
      }
    }))
  })
  ctx.on('minato/model', () => tables.refresh())

  // values come as JSON: the dates of a row are strings
  const revive = (table: string, data: Record<string, any>) => {
    const fields = ctx.model.tables[table].fields
    return Object.fromEntries(Object.entries(data).map(([key, value]) => {
      const type = fields[key]?.deftype
      return [key, DATE_TYPES.includes(type!) && typeof value === 'string' ? new Date(value) : value]
    }))
  }
  const keyOf = (table: string, key: Record<string, any>) => {
    const query = Object.fromEntries(primaryOf(table).map(name => [name, key[name]]))
    if (Object.values(query).some(value => value === undefined)) throw new Error(`the primary key of ${table} is ${primaryOf(table).join(', ')}`)
    return revive(table, query)
  }

  ctx.console.method('database/rows', async (table: string, options: { offset: number; limit: number }) => {
    const sort = Object.fromEntries(primaryOf(table).map(name => [name, 'asc' as const]))
    return database.get(table, {}, { offset: options.offset, limit: Math.min(options.limit, 200), sort })
  })
  ctx.console.method('database/create', async (table: string, row: Record<string, any>) => {
    const created = await database.create(table, revive(table, row))
    tables.refresh()
    return created
  })
  ctx.console.method('database/update', async (table: string, key: Record<string, any>, changes: Record<string, any>) => {
    const primary = primaryOf(table)
    const patch = revive(table, Object.fromEntries(Object.entries(changes).filter(([name]) => !primary.includes(name))))
    await database.set(table, keyOf(table, key), patch)
  })
  ctx.console.method('database/remove', async (table: string, key: Record<string, any>) => {
    await database.remove(table, keyOf(table, key))
    tables.refresh()
  })
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
