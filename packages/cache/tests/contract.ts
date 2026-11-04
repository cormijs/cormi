// The behavior every implementation of the cache shares: each runs it in its own tests.
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, expect, it } from 'vitest'
import type { Cache } from '../src/index.ts'

export function testCache(getCache: () => Cache) {
  // tables of their own: a cache server keeps its keys across runs
  const run = Math.random().toString(36).slice(2, 8)
  const tables = new Set<string>()
  const table = (name: string) => {
    tables.add(`${name}-${run}`)
    return `${name}-${run}`
  }

  afterAll(async () => {
    for (const name of tables) await getCache().clear(name)
  })

  it('reads back what it sets, as JSON', async () => {
    const cache = getCache()
    expect(await cache.get(table('json'), 'missing')).toBeUndefined()
    await cache.set(table('json'), 'user', { id: 1, tags: ['a'], at: new Date(0) })
    expect(await cache.get(table('json'), 'user')).toEqual({ id: 1, tags: ['a'], at: '1970-01-01T00:00:00.000Z' })
    await cache.set(table('json'), 'user', 'replaced')
    expect(await cache.get(table('json'), 'user')).toBe('replaced')
  })

  it('expires keys after maxAge', async () => {
    const cache = getCache()
    await cache.set(table('expire'), 'short', 1, 100)
    await cache.set(table('expire'), 'long', 2, 10_000)
    await cache.set(table('expire'), 'forever', 3)
    expect(await cache.get(table('expire'), 'short')).toBe(1)
    await sleep(150)
    expect(await cache.get(table('expire'), 'short')).toBeUndefined()
    expect((await cache.keys(table('expire'))).sort()).toEqual(['forever', 'long'])
  })

  it('deletes keys: delete(), undefined, a maxAge of 0', async () => {
    const cache = getCache()
    await cache.set(table('delete'), 'a', 1)
    await cache.set(table('delete'), 'b', 2)
    await cache.set(table('delete'), 'c', 3)
    await cache.delete(table('delete'), 'a')
    await cache.set(table('delete'), 'b', undefined)
    await cache.set(table('delete'), 'c', 3, 0)
    expect(await cache.keys(table('delete'))).toEqual([])
  })

  it('clears a table, not the others', async () => {
    const cache = getCache()
    await cache.set(table('clear'), 'a', 1)
    await cache.set(table('clear'), 'b', 2)
    await cache.set(table('kept'), 'a', 1)
    await cache.clear(table('clear'))
    expect(await cache.keys(table('clear'))).toEqual([])
    expect(await cache.keys(table('kept'))).toEqual(['a'])
    await cache.clear(table('kept'))
  })

  it('increments numbers, expiring maxAge after the first increment', async () => {
    const cache = getCache()
    expect(await cache.increment(table('count'), 'hits')).toBe(1)
    expect(await cache.increment(table('count'), 'hits', 2)).toBe(3)
    expect(await cache.get(table('count'), 'hits')).toBe(3)
    expect(await cache.increment(table('count'), 'window', 1, 100)).toBe(1)
    await sleep(50)
    expect(await cache.increment(table('count'), 'window', 1, 100)).toBe(2)
    await sleep(80)
    expect(await cache.increment(table('count'), 'window', 1, 100)).toBe(1)
    await cache.clear(table('count'))
  })

  it('gets or sets a value', async () => {
    const cache = getCache()
    let calls = 0
    const factory = () => ++calls
    expect(await cache.getOrSet(table('memo'), 'n', factory, 10_000)).toBe(1)
    expect(await cache.getOrSet(table('memo'), 'n', factory, 10_000)).toBe(1)
    expect(calls).toBe(1)
    await cache.clear(table('memo'))
  })
}
