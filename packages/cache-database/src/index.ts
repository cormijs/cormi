import { Cache, serialize, type TableName, type Tables } from '@cormijs/cache'
import { Schema } from '@cormijs/core'
import type {} from '@cormijs/database'
import { Context } from 'cordis'

/** A key of the cache, as a row of the database. */
export interface CacheRow {
  table: string
  key: string
  /** JSON */
  value: string
  expire: Date | null
}

declare module '@cormijs/database' {
  interface Tables {
    cormi_cache: CacheRow
  }
}

const TABLE = 'cormi_cache'

/**
 * The cache in the database of the app (`@cormijs/database`), table
 * `cormi_cache`: shared by the processes of the app, kept when it restarts,
 * without a server of its own. `increment()` reads and writes the row: it is
 * not atomic across processes.
 */
export class DatabaseCache extends Cache {
  static inject = ['model', 'database']

  constructor(ctx: Context) {
    super(ctx)
    ctx.model.extend(TABLE, {
      table: 'string(64)',
      key: 'string(255)',
      value: 'text',
      expire: 'timestamp',
    }, { primary: ['table', 'key'] })
    // the expired rows that are not read again
    ctx.effect(() => {
      const timer = setInterval(() => {
        ctx.database.remove(TABLE, { expire: { $lte: new Date() } }).catch(error => ctx.logger('cache').warn(error))
      }, 10 * 60_000)
      timer.unref()
      return () => clearInterval(timer)
    }, 'sweep the cache')
  }

  private async _row(table: string, key: string) {
    const [row] = await this.ctx.database.get(TABLE, { table, key })
    if (!row) return
    if (row.expire && +row.expire <= Date.now()) {
      await this.delete(table, key)
      return
    }
    return row
  }

  async get<K extends TableName>(table: K, key: string) {
    const row = await this._row(table, key)
    return row && JSON.parse(row.value) as Tables[K]
  }

  async set<K extends TableName>(table: K, key: string, value: Tables[K], maxAge?: number) {
    const text = serialize(value, maxAge)
    if (text === undefined) return this.delete(table, key)
    const expire = maxAge === undefined ? null : new Date(Date.now() + maxAge)
    await this.ctx.database.upsert(TABLE, [{ table, key, value: text, expire }])
  }

  async delete(table: TableName, key: string) {
    await this.ctx.database.remove(TABLE, { table, key })
  }

  async clear(table: TableName) {
    await this.ctx.database.remove(TABLE, { table })
  }

  async keys(table: TableName) {
    const rows = await this.ctx.database.get(TABLE, { table }, ['key', 'expire'])
    const now = Date.now()
    return rows.filter(row => !row.expire || +row.expire > now).map(row => row.key)
  }

  async increment(table: TableName, key: string, delta = 1, maxAge?: number) {
    const row = await this._row(table, key)
    if (!row) {
      await this.set(table, key, delta as Tables[TableName], maxAge)
      return delta
    }
    const value = Number(JSON.parse(row.value)) + delta
    await this.ctx.database.set(TABLE, { table, key }, { value: String(value) })
    return value
  }
}

export const name = 'cache-database'

export const Config: Schema<{}> = Schema.object({})

/** `ctx.cache` in the database, when the app serves (`cormi dev`, `cormi start`). */
export function apply(ctx: Context) {
  if (!ctx.cormi.serving) return
  ctx.plugin(DatabaseCache)
}
