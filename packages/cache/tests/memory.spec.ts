import { Context } from 'cordis'
import { afterAll, beforeAll, describe } from 'vitest'
import { type Cache, MemoryCache } from '../src/index.ts'
import { testCache } from './contract.ts'

describe('MemoryCache', () => {
  const ctx = new Context()
  let cache: Cache

  beforeAll(async () => {
    await ctx.plugin(MemoryCache)
    cache = ctx.get('cache')!
  })

  afterAll(() => ctx.registry.delete(MemoryCache))

  testCache(() => cache)
})
