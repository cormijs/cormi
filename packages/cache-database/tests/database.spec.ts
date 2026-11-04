import Logger from '@cordisjs/plugin-logger'
import SQLite from '@minatojs/driver-sqlite'
import { Context } from 'cordis'
import Database from 'minato'
import { afterAll, beforeAll, describe } from 'vitest'
import type { Cache } from '@cormijs/cache'
import { DatabaseCache } from '../src/index.ts'
import { testCache } from '../../cache/tests/contract.ts'

describe('DatabaseCache', () => {
  const ctx = new Context()
  let cache: Cache

  beforeAll(async () => {
    await ctx.plugin(Logger)
    ctx.plugin(Database)
    ctx.plugin(SQLite, { path: ':memory:' })
    ctx.plugin(DatabaseCache)
    // the cache waits for the driver
    for (let i = 0; i < 100 && !ctx.get('cache'); i++) await new Promise(resolve => setTimeout(resolve, 20))
    cache = ctx.get('cache')!
  })

  afterAll(() => ctx.registry.delete(DatabaseCache))

  testCache(() => cache)
})
