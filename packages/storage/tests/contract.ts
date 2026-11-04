// The behavior every implementation of the storage shares: each runs it in its own tests.
import { afterAll, expect, it } from 'vitest'
import type { Storage } from '../src/index.ts'

const text = (file: { body: ReadableStream<Uint8Array> } | undefined) => new Response(file!.body).text()

export function testStorage(getStorage: () => Storage) {
  // keys of their own: a service keeps its files across runs
  const prefix = `test-${Math.random().toString(36).slice(2, 8)}/`

  afterAll(async () => {
    const storage = getStorage()
    for (const { key } of await storage.list(prefix)) await storage.delete(key)
  })

  it('reads back what it puts, with the content type of the extension', async () => {
    const storage = getStorage()
    const object = await storage.put(`${prefix}hello.txt`, 'hello, 世界')
    expect(object).toMatchObject({ key: `${prefix}hello.txt`, size: 13, contentType: 'text/plain; charset=utf-8' })
    expect(object.etag).not.toBe('')
    const file = await storage.get(`${prefix}hello.txt`)
    expect(file).toMatchObject({ size: 13, contentType: 'text/plain; charset=utf-8' })
    expect(await text(file)).toBe('hello, 世界')
    expect(await storage.head(`${prefix}hello.txt`)).toMatchObject({ size: 13, etag: object.etag })
  })

  it('stores bytes, blobs and streams as they are', async () => {
    const storage = getStorage()
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index)
    await storage.put(`${prefix}bytes.bin`, bytes)
    expect(new Uint8Array(await new Response((await storage.get(`${prefix}bytes.bin`))!.body).arrayBuffer())).toEqual(bytes)
    await storage.put(`${prefix}blob`, new Blob(['a blob']), { contentType: 'text/x-blob', cacheControl: 'no-cache' })
    expect(await storage.head(`${prefix}blob`)).toMatchObject({ contentType: 'text/x-blob', cacheControl: 'no-cache' })
    await storage.put(`${prefix}stream.txt`, new Blob(['a stream']).stream())
    expect(await text(await storage.get(`${prefix}stream.txt`))).toBe('a stream')
    await storage.put(`${prefix}empty.txt`, '')
    expect(await storage.head(`${prefix}empty.txt`)).toMatchObject({ size: 0 })
  })

  it('replaces a file, with another version', async () => {
    const storage = getStorage()
    const first = await storage.put(`${prefix}version.txt`, 'one')
    await new Promise(resolve => setTimeout(resolve, 20))
    const second = await storage.put(`${prefix}version.txt`, 'two!')
    expect(second.etag).not.toBe(first.etag)
    expect(await text(await storage.get(`${prefix}version.txt`))).toBe('two!')
  })

  it('lists the files below a prefix, by key', async () => {
    const storage = getStorage()
    await storage.put(`${prefix}list/b.txt`, 'b')
    await storage.put(`${prefix}list/a.txt`, 'a')
    await storage.put(`${prefix}list/nested/c.txt`, 'c')
    await storage.put(`${prefix}lists.txt`, 'not below list/')
    const entries = await storage.list(`${prefix}list/`)
    expect(entries.map(entry => entry.key)).toEqual([`${prefix}list/a.txt`, `${prefix}list/b.txt`, `${prefix}list/nested/c.txt`])
    expect(entries[0]).toMatchObject({ size: 1 })
    expect(entries[0].lastModified).toBeInstanceOf(Date)
  })

  it('keeps keys with spaces and other scripts', async () => {
    const storage = getStorage()
    const key = `${prefix}名字 with space+plus.txt`
    await storage.put(key, 'named')
    expect(await text(await storage.get(key))).toBe('named')
    expect((await storage.list(prefix)).map(entry => entry.key)).toContain(key)
    expect(storage.url(key) ?? '').not.toContain(' ')
  })

  it('deletes files', async () => {
    const storage = getStorage()
    await storage.put(`${prefix}gone.txt`, 'gone')
    await storage.delete(`${prefix}gone.txt`)
    expect(await storage.get(`${prefix}gone.txt`)).toBeUndefined()
    expect(await storage.head(`${prefix}gone.txt`)).toBeUndefined()
    await storage.delete(`${prefix}never.txt`)
  })

  it('rejects keys that leave the storage or name hidden files', async () => {
    const storage = getStorage()
    for (const key of ['', '../x', 'a/../b', '/x', 'a//b', '.env', 'a/.git/config', 'a\\b']) {
      await expect(storage.put(key, 'x'), key).rejects.toThrow(TypeError)
    }
  })

  it('answers with a file, 304 for the version the request has, 404 without it', async () => {
    const storage = getStorage()
    const { etag } = await storage.put(`${prefix}page.html`, '<p>hi</p>', { cacheControl: 'public, max-age=60' })
    const response = await storage.response(`${prefix}page.html`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    expect(await response.text()).toBe('<p>hi</p>')
    const cached = await storage.response(`${prefix}page.html`, new Request('http://localhost/', { headers: { 'if-none-match': `"${etag}"` } }))
    expect(cached.status).toBe(304)
    expect((await storage.response(`${prefix}missing.html`)).status).toBe(404)
    expect((await storage.response('../escape')).status).toBe(404)
  })
}
