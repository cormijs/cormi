import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/index.ts'

describe('passwords', () => {
  it('verifies the password of a hash', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/)
    expect(await hashPassword('correct horse')).not.toBe(hash)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('correct horses', hash)).toBe(false)
  })

  it('rejects what is not a hash', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'md5$abc')).toBe(false)
    // an empty key, which any password derives
    expect(await verifyPassword('x', 'scrypt$0$0$0$a$b')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$16384$8$1$a$')).toBe(false)
    expect(await verifyPassword('x', 'scrypt$16384$8$1$c2FsdA$AAAA')).toBe(false)
  })
})
