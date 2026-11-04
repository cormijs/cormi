import { Context } from 'cordis'
import { afterAll, beforeAll, describe } from 'vitest'
import type { Cache } from '@cormijs/cache'
import { RedisCache } from '../src/index.ts'
import { testCache } from '../../cache/tests/contract.ts'

// a Redis server to test with, e.g. `docker run -p 6379:6379 redis`
const url = process.env.REDIS_URL

describe.skipIf(!url)('RedisCache', () => {
  const ctx = new Context()
  let cache: Cache

  beforeAll(async () => {
    await ctx.plugin(RedisCache, { url: url!, prefix: 'cormi-test:' })
    cache = ctx.get('cache')!
  })

  afterAll(() => ctx.registry.delete(RedisCache))

  testCache(() => cache)
})
