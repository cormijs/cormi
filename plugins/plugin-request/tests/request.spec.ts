import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import plugin, { request, RequestError } from '../client/index.ts'

describe('request()', () => {
  let ctx: Context
  let calls: { url: string; init: RequestInit }[]
  const realFetch = globalThis.fetch

  beforeEach(async () => {
    calls = []
    globalThis.fetch = (async (url: URL, init: RequestInit) => {
      calls.push({ url: url.href, init })
      if (url.pathname.endsWith('/broken')) return Response.json({ message: 'boom' }, { status: 500 })
      if (url.pathname.endsWith('/slow')) return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
      return Response.json({ data: { ok: true } })
    }) as any
    ctx = new Context()
    await ctx.plugin(plugin as any, { baseURL: 'https://api.test/v1', headers: { 'x-app': 'cormi' }, timeout: 50 })
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('joins baseURL and params, merges headers and sends JSON', async () => {
    expect(await request.post('/users', { name: 'a' }, { params: { page: 2, skip: undefined }, headers: { 'x-extra': '1' } })).toEqual({ data: { ok: true } })
    const [{ url, init }] = calls
    expect(url).toBe('https://api.test/v1/users?page=2')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"a"}')
    const headers = init.headers as Headers
    expect([headers.get('x-app'), headers.get('x-extra'), headers.get('content-type')]).toEqual(['cormi', '1', 'application/json'])
    expect(init).not.toHaveProperty('dataField')
  })

  it('runs request/fetch listeners around fetch()', async () => {
    ctx.on('request/fetch', async (url, init, config, next) => {
      init.headers.set('authorization', 'token')
      const response = await next()
      return Response.json({ wrapped: await response.json() })
    })
    expect(await request('https://other.test/me')).toEqual({ wrapped: { data: { ok: true } } })
    expect((calls[0].init.headers as Headers).get('authorization')).toBe('token')
  })

  it('reports failures through request/error and throws them', async () => {
    const reported: RequestError[] = []
    ctx.on('request/error', (error) => {
      reported.push(error)
      return true
    })
    const error = await request('/broken').catch(error => error)
    expect(error).toBeInstanceOf(RequestError)
    expect(error.message).toBe('request to /v1/broken failed with status 500')
    expect(error.data).toEqual({ message: 'boom' })
    expect(error.handled).toBe(true)
    expect(reported).toEqual([error])

    await request('/broken', { skipErrorHandler: true }).catch(() => {})
    expect(reported.length).toBe(1)
  })

  it('times out', async () => {
    const error = await request('/slow').catch(error => error)
    expect(error.message).toBe('request to /v1/slow failed: timed out after 50ms')
  })
})
