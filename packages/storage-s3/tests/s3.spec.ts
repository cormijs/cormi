import { Context } from 'cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Storage } from '@cormijs/storage'
import { S3Storage } from '../src/index.ts'
import { testStorage } from '../../storage/tests/contract.ts'

// an S3 service to test with, e.g. MinIO: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
const endpoint = process.env.S3_ENDPOINT

describe.skipIf(!endpoint)('S3Storage', () => {
  const ctx = new Context()
  let storage: Storage

  beforeAll(async () => {
    await ctx.plugin(S3Storage, {
      endpoint: endpoint!,
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET!,
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      pathStyle: true,
      prefix: 'cormi/',
      private: false,
    })
    storage = ctx.get('storage')!
  })

  afterAll(() => ctx.registry.delete(S3Storage))

  testStorage(() => storage)

  it('has the URLs of the bucket, below its prefix', async () => {
    expect(storage.url('a b/c.png')).toBe(`${new URL(endpoint!).origin}/${process.env.S3_BUCKET}/cormi/a%20b/c.png`)
  })
})
