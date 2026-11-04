import { Schema } from '@cormijs/core'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    cache: Cache
  }
}

/**
 * The values of the tables of the cache, by declaration merging:
 *
 * ```ts
 * declare module '@cormijs/cache' {
 *   interface Tables {
 *     captcha: string
 *   }
 * }
 * ```
 */
export interface Tables {
  [table: string]: unknown
}

export type TableName = keyof Tables & string

type Awaitable<T> = T | Promise<T>

/**
 * The cache of the app (`ctx.cache`): tables of keys and values, each key
 * with an optional expiry (`maxAge`, in milliseconds). Values are stored as
 * JSON, so every implementation reads back the same values: in memory
 * (`@cormijs/cache`), in Redis (`@cormijs/cache-redis`) or in the database
 * (`@cormijs/cache-database`).
 */
export abstract class Cache extends Service {
  constructor(ctx: Context) {
    super(ctx, 'cache')
  }

  /** The value of a key, or `undefined` if it is missing or expired. */
  abstract get<K extends TableName>(table: K, key: string): Promise<Tables[K] | undefined>

  /** Set the value of a key, for `maxAge` milliseconds or until it is deleted; `undefined`, or a `maxAge` of 0 or less, deletes it. */
  abstract set<K extends TableName>(table: K, key: string, value: Tables[K], maxAge?: number): Promise<void>

  abstract delete(table: TableName, key: string): Promise<void>

  /** Delete every key of a table. */
  abstract clear(table: TableName): Promise<void>

  /** The keys of a table that are not expired. */
  abstract keys(table: TableName): Promise<string[]>

  /**
   * Add `delta` to a number (from 0 for a missing key) and return the result.
   * `maxAge` applies when the key is created, so the key expires `maxAge`
   * after its first increment, e.g. a window of a rate limit.
   */
  abstract increment(table: TableName, key: string, delta?: number, maxAge?: number): Promise<number>

  /** The value of a key; if there is none, the value of `factory`, which is set for `maxAge`. */
  async getOrSet<K extends TableName>(table: K, key: string, factory: () => Awaitable<Tables[K]>, maxAge?: number): Promise<Tables[K]> {
    const cached = await this.get(table, key)
    if (cached !== undefined) return cached
    const value = await factory()
    await this.set(table, key, value, maxAge)
    return value
  }
}

/** A value as stored: JSON, or `undefined` when the key is to be deleted (see `Cache.set()`). */
export function serialize(value: unknown, maxAge?: number): string | undefined {
  if (value === undefined || maxAge! <= 0) return
  return JSON.stringify(value)
}

interface Entry {
  value: string
  /** the time it expires at, in milliseconds */
  expire?: number
}

/** The cache in the memory of the process: gone when it exits, not shared by several processes. */
export class MemoryCache extends Cache {
  private _tables = new Map<string, Map<string, Entry>>()

  constructor(ctx: Context) {
    super(ctx)
    // the expired keys that are not read again
    ctx.effect(() => {
      const timer = setInterval(() => this._sweep(), 60_000)
      timer.unref()
      return () => clearInterval(timer)
    }, 'sweep the cache')
  }

  private _sweep() {
    const now = Date.now()
    for (const entries of this._tables.values()) {
      for (const [key, entry] of entries) {
        if (entry.expire! <= now) entries.delete(key)
      }
    }
  }

  private _table(table: string) {
    let entries = this._tables.get(table)
    if (!entries) this._tables.set(table, entries = new Map())
    return entries
  }

  private _entry(table: string, key: string) {
    const entries = this._tables.get(table)
    const entry = entries?.get(key)
    if (!entry) return
    if (entry.expire! <= Date.now()) {
      entries!.delete(key)
      return
    }
    return entry
  }

  async get<K extends TableName>(table: K, key: string) {
    const entry = this._entry(table, key)
    return entry && JSON.parse(entry.value) as Tables[K]
  }

  async set<K extends TableName>(table: K, key: string, value: Tables[K], maxAge?: number) {
    const text = serialize(value, maxAge)
    if (text === undefined) return this.delete(table, key)
    this._table(table).set(key, { value: text, expire: maxAge === undefined ? undefined : Date.now() + maxAge })
  }

  async delete(table: TableName, key: string) {
    this._tables.get(table)?.delete(key)
  }

  async clear(table: TableName) {
    this._tables.delete(table)
  }

  async keys(table: TableName) {
    return [...this._tables.get(table)?.keys() ?? []].filter(key => this._entry(table, key))
  }

  async increment(table: TableName, key: string, delta = 1, maxAge?: number) {
    const entry = this._entry(table, key)
    if (!entry) {
      this._table(table).set(key, { value: String(delta), expire: maxAge === undefined ? undefined : Date.now() + maxAge })
      return delta
    }
    const value = Number(JSON.parse(entry.value)) + delta
    entry.value = String(value)
    return value
  }
}

export const name = 'cache'

export const Config: Schema<{}> = Schema.object({})

/**
 * The cache in memory. Like every implementation of the cache, it provides
 * `ctx.cache` when the app serves (`cormi dev`, `cormi start`), not when it
 * builds or writes files, so a build does not connect to a cache server.
 */
export function apply(ctx: Context) {
  if (!ctx.cormi.serving) return
  ctx.plugin(MemoryCache)
}
