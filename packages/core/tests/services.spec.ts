import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App, Cormi, Html, idle, Router } from '../src/index.ts'

function write(file: string, content: string) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

describe('services', () => {
  let cwd: string
  let ctx: Context

  beforeEach(async () => {
    cwd = mkdtempSync(join(tmpdir(), 'cormi-core-'))
    write(join(cwd, 'src/pages/index.tsx'), 'export default () => null')
    write(join(cwd, 'src/pages/about.tsx'), 'export default () => null\nexport async function loader() {}')
    write(join(cwd, 'src/layouts/index.tsx'), 'export default () => null')
    ctx = new Context()
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd, mode: 'setup' })
    await ctx.plugin(Router, {})
    await ctx.plugin(Html, { title: 'Test' })
    await ctx.plugin(App)
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('scans convention routes, their exports and the layout', () => {
    const router = ctx.get('router')!
    expect(router.routes.index).toMatchObject({ path: '/', parentId: '@@/global-layout', exports: ['default'] })
    expect(router.routes.about).toMatchObject({ path: 'about', exports: ['default', 'loader'] })
    expect(router.routes['@@/global-layout']).toMatchObject({ path: '/', isLayout: true })
  })

  it('routes, layouts and patches are effects of the registering plugin', async () => {
    const fiber = ctx.inject(['router'], (ctx) => {
      ctx.router.route({ id: 'docs', path: 'docs' })
      ctx.router.patch((routes) => {
        routes.about.meta = { title: 'About' }
      })
    })
    await fiber
    const router = ctx.get('router')!
    await router.flush()
    expect(router.routes.docs).toMatchObject({ path: 'docs', parentId: '@@/global-layout' })
    expect(router.routes.about.meta).toEqual({ title: 'About' })

    await fiber.dispose()
    router.refresh()
    await router.flush()
    expect(router.routes.docs).toBeUndefined()
    expect(router.routes.about.meta).toBeUndefined()
  })

  it('renders the document with registered tags and transforms', async () => {
    const fiber = await ctx.inject(['html'], (ctx) => {
      ctx.html.head({ tag: 'meta', attrs: { name: 'x', content: 'a"b' } })
      ctx.html.body({ tag: 'script', content: 'window.x = 1' })
      ctx.html.transform(html => html.replace('</body>', '<!-- end --></body>'))
    })
    const html = ctx.get('html')!
    const markup = await html.render({ content: '<p>app</p>', scripts: ['/entry.js'] })
    expect(markup).toContain('<title>Test</title>')
    expect(markup).toContain('<meta name="x" content="a&quot;b">')
    expect(markup).toContain('<div id="root"><p>app</p></div>')
    expect(markup).toContain('<script type="module" src="/entry.js"></script>\n<script>window.x = 1</script>')
    expect(markup).toContain('<!-- end --></body>')

    await fiber.dispose()
    expect(await html.render()).not.toContain('name="x"')
  })

  it('generates files from contributions and removes them with their plugin', async () => {
    let value = 1
    const fiber = await ctx.inject(['app'], (ctx) => {
      ctx.app.file('plugin-test/value.ts', () => `export const value = ${value}`)
      ctx.app.file('plugin-test/skipped.ts', () => undefined)
      ctx.app.entry('@scope/plugin/client', { a: 1 })
      ctx.app.import('./global.css')
    })
    const app = ctx.get('app')!
    await app.flush()
    const file = join(app.dir, 'plugin-test/value.ts')
    expect(readFileSync(file, 'utf8')).toContain('export const value = 1')
    expect(existsSync(join(app.dir, 'plugin-test/skipped.ts'))).toBe(false)
    expect([...app.entries]).toEqual([{ file: '@scope/plugin/client', config: { a: 1 } }])
    expect([...app.imports]).toEqual([{ source: './global.css' }])

    value = 2
    app.refresh()
    await app.flush()
    expect(readFileSync(file, 'utf8')).toContain('export const value = 2')

    await fiber.dispose()
    await app.flush()
    expect(existsSync(file)).toBe(false)
    expect(app.entries.size).toBe(0)
  })

  it('rejects two registrations of one generated file', async () => {
    const fiber = ctx.inject(['app'], (ctx) => {
      ctx.app.file('same.ts', '')
      ctx.app.file('same.ts', '')
    })
    await expect(Promise.resolve(fiber)).rejects.toThrow('generated file same.ts is registered twice')
  })

  it('waits for loading plugins with idle()', async () => {
    let loaded = false
    ctx.plugin({
      async apply() {
        await new Promise(resolve => setTimeout(resolve, 20))
        loaded = true
      },
    })
    await idle(ctx)
    expect(loaded).toBe(true)
  })
})
