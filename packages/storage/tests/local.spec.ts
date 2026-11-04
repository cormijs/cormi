import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Cormi } from '@cormijs/core'
import { Context } from 'cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalStorage, type Storage } from '../src/index.ts'
import { testStorage } from './contract.ts'

describe('LocalStorage', () => {
  const ctx = new Context()
  let storage: Storage
  let cwd: string

  beforeAll(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'cormi-storage-'))
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd, mode: 'dev' })
    await ctx.plugin(LocalStorage, { root: 'files', path: false, baseUrl: 'https://cdn.example.com/files/', cacheControl: 'public, max-age=3600' })
    storage = ctx.get('storage')!
  })

  afterAll(async () => {
    ctx.registry.delete(LocalStorage)
    await rm(cwd, { recursive: true, force: true })
  })

  testStorage(() => storage)

  it('has the URLs of baseUrl, and the cache control of the config', async () => {
    const object = await storage.put('a b/c.png', new Uint8Array([1]))
    expect(object).toMatchObject({ url: 'https://cdn.example.com/files/a%20b/c.png', contentType: 'image/png', cacheControl: 'public, max-age=3600' })
  })
})
