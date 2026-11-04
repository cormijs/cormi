import { Cache, serialize, type TableName, type Tables } from '@cormijs/cache'
import { Schema } from '@cormijs/core'
import { createClient, type RedisClientType } from '@redis/client'
import { Context, Service } from 'cordis'

export interface Config {
  /** `redis://[[user]:password@]host[:port][/database]` */
  url: string
  /** the prefix of the keys, before `<table>:<key>` */
  prefix: string
}

export const Config: Schema<Config> = Schema.object({
  url: Schema.string().default('redis://localhost:6379').description('redis://[[user]:password@]host[:port][/database]'),
  prefix: Schema.string().default('cormi:').description('the prefix of the keys, before <table>:<key>'),
})

/** The cache in Redis: shared by the processes of the app, kept when it restarts. */
export class RedisCache extends Cache {
  client!: RedisClientType

  constructor(ctx: Context, public config: Config) {
    super(ctx)
  }

  async* [Service.init]() {
    this.client = createClient({ url: this.config.url })
    // a lost connection is reconnected; the commands meanwhile fail
    this.client.on('error', error => this.ctx.logger('cache').warn(error))
    await this.client.connect()
    yield () => this.client.close()
  }

  private _key(table: string, key: string) {
    return `${this.config.prefix}${table}:${key}`
  }

  async get<K extends TableName>(table: K, key: string) {
    const text = await this.client.get(this._key(table, key))
    return text === null ? undefined : JSON.parse(text) as Tables[K]
  }

  async set<K extends TableName>(table: K, key: string, value: Tables[K], maxAge?: number) {
    const text = serialize(value, maxAge)
    if (text === undefined) return this.delete(table, key)
    await this.client.set(this._key(table, key), text, maxAge === undefined ? {} : { expiration: { type: 'PX', value: Math.ceil(maxAge) } })
  }

  async delete(table: TableName, key: string) {
    await this.client.del(this._key(table, key))
  }

  private async* _scan(table: string) {
    const prefix = this._key(table, '')
    // the prefix is matched literally
    const match = prefix.replace(/[*?[\]\\]/g, '\\$&') + '*'
    for await (const keys of this.client.scanIterator({ MATCH: match, COUNT: 100 })) {
      yield keys.map(key => key.slice(prefix.length))
    }
  }

  async clear(table: TableName) {
    for await (const keys of this._scan(table)) {
      if (keys.length) await this.client.unlink(keys.map(key => this._key(table, key)))
    }
  }

  async keys(table: TableName) {
    const result: string[] = []
    for await (const keys of this._scan(table)) result.push(...keys)
    return result
  }

  async increment(table: TableName, key: string, delta = 1, maxAge?: number) {
    const name = this._key(table, key)
    const value = await this.client.incrBy(name, delta)
    // created by this increment: it expires maxAge from now
    if (value === delta && maxAge !== undefined) await this.client.pExpire(name, Math.max(1, Math.ceil(maxAge)))
    return value
  }
}

export const name = 'cache-redis'

/** `ctx.cache` in Redis, when the app serves (`cormi dev`, `cormi start`). */
export function apply(ctx: Context, config: Config) {
  if (!ctx.cormi.serving) return
  ctx.plugin(RedisCache, config)
}
