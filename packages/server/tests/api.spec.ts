import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiClient } from '@cormijs/runtime'
import { describe, expect, it } from 'vitest'
import { createApp, toApiPath } from '../src/index.ts'

const root = fileURLToPath(new URL('../../..', import.meta.url))

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

describe('createApp & typed RPC client', () => {
  it('dispatches requests in-process via app.fetch and createApiClient without binding a port', async () => {
    const app = await createApp({ cwd: join(root, 'examples/with-auth') })
    try {
      // Unauthenticated request to a protected route returns 401
      const unauth = await app.fetch('/api/me')
      expect(unauth.status).toBe(401)

      // Sign in via POST /api/login
      const loginRes = await app.fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'alice', password: 'cormi' }),
      })
      expect(loginRes.status).toBe(200)
      expect(await loginRes.json()).toEqual({ name: 'alice', role: 'admin' })
      const cookie = loginRes.headers.getSetCookie()[0]?.split(';')[0]
      expect(cookie).toMatch(/^cormi\.sid=/)

      // Authenticated request using the session cookie
      const client = createApiClient({
        fetch: (input, init) => app.fetch(input, init),
        headers: { cookie: cookie! },
      })
      const me = await client.get('/api/me')
      expect(me).toEqual({ name: 'alice', role: 'admin' })

      // Hono-style RPC chain call
      const statsRes = await (client as any).admin.stats.$get()
      expect(statsRes.status).toBe(200)
      expect(await statsRes.json()).toEqual({ users: 2, by: 'alice' })
    } finally {
      await app.close()
    }
  })
})
