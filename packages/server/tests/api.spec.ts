import { describe, expect, it } from 'vitest'
import { toApiPath } from '../src/api.ts'

describe('toApiPath', () => {
  it('turns the ids of API modules into paths', () => {
    expect(toApiPath('/api', 'users/index')).toBe('/api/users')
    expect(toApiPath('/api', 'index')).toBe('/api')
    expect(toApiPath('/api', 'users/[id]')).toBe('/api/users/:id')
    expect(toApiPath('/api', 'files/[...key]')).toBe('/api/files/*key')
    expect(toApiPath('/api', 'v1.2/status')).toBe('/api/v1.2/status')
    expect(toApiPath('/api', 'users/[id]/posts/index')).toBe('/api/users/:id/posts')
  })
})
