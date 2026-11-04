// End-to-end checks of the examples in a browser.
//
//   node --import tsx scripts/e2e.mts [--dev] [--bundler rsbuild] [example ...]
//
// Without `--dev`, each example is built and served with `cormi start`;
// with `--dev`, it is served by the dev server. With `--bundler`, the examples
// that support another bundler run with it instead of Vite.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright-core'
import { conclude } from '../packages/core/src/index.ts'
import { launch } from './browser.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = `${root}packages/cormi/bin/cormi.js`
const dev = process.argv.includes('--dev')
const bundlerIndex = process.argv.indexOf('--bundler')
const bundler = bundlerIndex < 0 ? 'vite' : process.argv[bundlerIndex + 1]

/** `bases` are the URLs of `servers`; `base` is the first one. */
type Check = (page: Page, base: string, browser: Browser, bases: string[]) => Promise<void>

interface Example {
  check: Check
  /** the example directories to serve (default: the example itself), with their environment */
  servers?: { dir: string; env?: (bases: string[]) => Record<string, string> }[]
  /** console errors the check causes on purpose */
  ignore?: RegExp[]
  /** the bundlers the example runs with (default: vite) */
  bundlers?: string[]
  /** the path that answers once the server is up (default: `/`, a page) */
  ready?: string
  /** files of the example to remove before it runs, e.g. its database */
  clean?: string[]
}

/** The plugin tree of an example with another bundler: in place of @cormijs/vite, or next to @cormijs/preset for the shorthand. */
function withBundler(config: string, name: string) {
  if (config.includes(`- name: '@cormijs/vite'`)) return config.replace(`- name: '@cormijs/vite'`, `- name: '@cormijs/${name}'`)
  const lines = config.split('\n')
  const start = lines.indexOf(`- name: '@cormijs/preset-react'`)
  if (start < 0) throw new Error('the example has neither @cormijs/vite nor @cormijs/preset-react')
  const end = lines.findIndex((line, index) => index > start && line.startsWith('- '))
  lines.splice(end < 0 ? lines.length : end, 0, `- name: '@cormijs/${name}'`, `- name: '@cormijs/react'`)
  lines[start] = `- name: '@cormijs/preset'`
  return lines.join('\n')
}

/** the plugin tree an example runs with, besides its cormi.yml */
const VARIANT = `.cormi.${bundler}.yml`

async function text(page: Page, selector: string) {
  return (await page.textContent(selector))?.trim()
}

/** A static host for exported pages: files, then `<path>/index.html`. */
async function serveStatic(dir: string, port: number) {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname)
    for (const file of [join(dir, path), join(dir, path, 'index.html')]) {
      if (!(await stat(file).catch(() => undefined))?.isFile()) continue
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
      return res.end(await readFile(file))
    }
    res.writeHead(404).end()
  })
  await new Promise<void>(resolve => server.listen(port, resolve))
  return server
}

/**
 * A registry with a few plugins for the market of the console: their search
 * results have the keywords that mirror their manifests.
 */
const REGISTRY_PORT = 8399
const REGISTRY = `http://localhost:${REGISTRY_PORT}`
const MARKET: { name: string; version: string; description: string; keywords: string[]; versions?: Record<string, object> }[] = [
  { name: 'cormi-plugin-anywhere', version: '1.0.0', description: 'works in any app', keywords: ['cormi-plugin', 'bundler:*', 'renderer:*'] },
  {
    name: 'cormi-plugin-vue-only',
    version: '2.0.0',
    description: 'Vue only since 2.0',
    keywords: ['cormi-plugin', 'bundler:*', 'renderer:vue'],
    versions: { '1.0.0': { cormi: { renderer: ['react'] } }, '2.0.0': { cormi: { renderer: ['vue'] } } },
  },
  { name: 'cormi-plugin-undeclared', version: '0.1.0', description: 'declares nothing', keywords: ['cormi-plugin'] },
  { name: 'cormi-plugin-webpack', version: '1.0.0', description: 'a bundler', keywords: ['cormi-plugin', 'bundler:webpack', 'renderer:*', 'impl:bundler', 'impl:webpack'] },
]

function serveRegistry() {
  const server = createServer((req, res) => {
    const url = new URL(req.url!, REGISTRY)
    // the index of cormijs/registry: manifests, verification, downloads
    if (url.pathname === '/index.json') {
      const objects = MARKET.map(({ versions, ...pkg }) => ({
        ...pkg,
        date: '2026-11-01T00:00:00.000Z',
        links: { npm: `https://www.npmjs.com/package/${pkg.name}` },
        manifest: conclude(pkg),
        official: pkg.name === 'cormi-plugin-anywhere',
        downloads: { lastMonth: 1234 },
        verified: pkg.name === 'cormi-plugin-anywhere' ? { time: '2026-11-01T00:00:00.000Z', compat: {}, matches: true } : undefined,
      }))
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ version: 1, time: '2026-11-01T00:00:00.000Z', objects }))
    }
    if (url.pathname === '/-/v1/search') {
      const objects = MARKET.map(({ versions, ...pkg }) => ({ package: { ...pkg, links: {} } }))
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ objects }))
    }
    const pkg = MARKET.find(pkg => pkg.name === decodeURIComponent(url.pathname.slice(1)))
    if (!pkg) return res.writeHead(404).end()
    const versions = Object.fromEntries(Object.entries(pkg.versions ?? { [pkg.version]: {} }).map(([version, meta]) => [version, { name: pkg.name, version, ...meta }]))
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ 'name': pkg.name, 'dist-tags': { latest: pkg.version }, versions }))
  })
  server.listen(REGISTRY_PORT)
  return server
}

async function waitFor(condition: () => boolean | Promise<boolean>, timeout = 10000) {
  const start = Date.now()
  while (!await condition()) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting for a condition')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/** Click until the element reads `expected`: server-rendered markup ignores clicks until it hydrates. */
async function clickUntil(page: Page, selector: string, expected: string) {
  for (let i = 0; i < 50; i++) {
    await page.click(selector)
    if (await text(page, selector) === expected) return
    await page.waitForTimeout(200)
  }
  assert.equal(await text(page, selector), expected)
}

const checks: Record<string, Check> = {
  async basic(page, base, browser) {
    // server-rendered, complete without JavaScript
    const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
    await noJs.goto(`${base}/about`)
    assert.match((await text(noJs, '#loader'))!, /^served by \w+ on \d{4}-\d{2}-\d{2}$/)
    // the loader's context is the app's
    assert.equal(await text(noJs, '#mode'), `rendered in ${dev ? 'dev' : 'start'} mode`)
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('nav')!).display), 'flex')
    assert.equal(await noJs.getAttribute('meta[name=generator]', 'content'), 'cormi')
    // file conventions: global.css, overrides.css (prefixed with body), public/favicon.svg
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.body).margin), '0px')
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('nav a')!).color), 'rgb(124, 58, 237)')
    assert.equal(await noJs.getAttribute('link[rel=icon]', 'href'), '/favicon.svg')

    // hydrated, with the runtime plugin of src/app.ts
    await page.goto(`${base}/`)
    await page.waitForFunction(() => document.title === 'Cormi · /')
    assert.equal(await page.evaluate(() => document.documentElement.dataset.global), 'loaded')
    await page.click('button')
    await page.click('button')
    assert.equal(await text(page, 'button'), 'clicked 2')

    // client navigation fetches the server loader
    await page.click('text=About')
    await page.waitForFunction(() => document.querySelector('#loader')?.textContent?.startsWith('served by'))
    assert.equal(await page.title(), 'Cormi · /about')

    await page.click('text=Users')
    await page.click('#users >> text=Bob')
    assert.equal(await text(page, '#user'), 'User 2')

    assert.deepEqual(await fetch(`${base}/api/users/2`).then(res => res.json()), { id: 2, name: 'Bob' })
    assert.equal((await fetch(`${base}/api/users/9`)).status, 404)
    assert.equal((await fetch(`${base}/api/users`, { method: 'POST' })).status, 405)
    assert.deepEqual(await fetch(`${base}/proxy/users/1`).then(res => res.json()), { id: 1, name: 'Alice' })

    // pages exported by @cormijs/plugin-export-static work on a static host
    if (!dev) {
      const port = Number(new URL(base).port) + 5
      const host = await serveStatic(`${root}examples/basic/dist`, port)
      try {
        await page.goto(`http://localhost:${port}/about`)
        assert.match((await text(page, '#loader'))!, /^served by \w+ on \d{4}-\d{2}-\d{2}$/)
        assert.equal(await text(page, '#mode'), 'rendered in build mode')
        await page.waitForFunction(() => document.title === 'Cormi · /about')
        await page.goto(`http://localhost:${port}/users/1`)
        assert.equal(await text(page, '#user'), 'User 1')
        await page.click('text=Home')
        await page.waitForSelector('#title')
      } finally {
        host.close()
      }
    }
  },

  async 'with-tailwind'(page, base, browser) {
    const html = await fetch(base, { headers: { accept: 'text/html' } }).then(res => res.text())
    assert.match(html, /<script type="module" src="[^"]+" crossorigin="anonymous">/)
    await page.goto(`${base}/`)
    await page.click('button')
    assert.equal(await text(page, 'button'), 'clicked 1')
    const background = await page.evaluate(() => getComputedStyle(document.querySelector('button')!).backgroundColor)
    assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'utility classes are applied')
    await page.click('text=About')
    await page.waitForSelector('text=Tailwind scans')

    // @cormijs/plugin-legacy (Vite only): without module scripts, the legacy bundle renders the app
    if (dev || bundler !== 'vite') return
    assert.match(html, /<script nomodule [^>]*id="vite-legacy-entry"/)
    const legacy = await (await browser.newContext()).newPage()
    await legacy.route(`${base}/`, async (route) => {
      const response = await route.fetch()
      const body = (await response.text())
        .replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/ nomodule/g, '')
      await route.fulfill({ response, body })
    })
    await legacy.goto(`${base}/`)
    await clickUntil(legacy, 'button', 'clicked 1')
    assert.ok(await legacy.evaluate(() => 'System' in window), 'the legacy bundle runs with SystemJS')
    await legacy.context().close()
  },

  async 'with-antd'(page, base, browser) {
    // the styles of antd are rendered on the server
    const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
    await noJs.goto(`${base}/`)
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('.ant-btn-primary')!).backgroundColor), 'rgb(99, 102, 241)')
    assert.equal(await noJs.getAttribute('.ant-picker input', 'placeholder'), '请选择日期')

    await page.goto(`${base}/`)
    // server-rendered markup ignores clicks until it hydrates, later on a first visit that optimizes dependencies (CI)
    for (let i = 0; i < 60 && !await page.locator('.ant-message-notice').count(); i++) {
      await page.click('.ant-btn-primary')
      await page.waitForTimeout(500)
    }
    assert.equal(await text(page, '.ant-message-notice'), 'Thanks!')
    await page.click('text=About')
    await page.waitForSelector('text=only the antd plugin reloads')
  },

  async 'with-api'(page, base) {
    // a backend: no pages
    assert.equal((await fetch(base, { headers: { accept: 'text/html' } })).status, 404)
    // the middleware of server/index.ts and the route share the state of the request
    const health = await fetch(`${base}/api/health`, { headers: { 'x-request-id': 'e2e' } })
    assert.equal(health.headers.get('x-request-id'), 'e2e')
    assert.match(health.headers.get('server-timing')!, /^app;dur=/)
    assert.deepEqual(await health.json(), { ok: true, mode: dev ? 'dev' : 'start', requestId: 'e2e' })

    // the routes of the database answer 503 until it is there
    await waitFor(async () => (await fetch(`${base}/api/todos`)).status === 200)
    assert.deepEqual((await fetch(`${base}/api/todos`).then(res => res.json())).map((todo: any) => todo.title), ['Try Cormi'])
    const created = await fetch(`${base}/api/todos`, { method: 'POST', body: JSON.stringify({ title: 'Ship it' }) })
    assert.equal(created.status, 201)
    const { id } = await created.json()
    const patched = await fetch(`${base}/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) }).then(res => res.json())
    assert.equal(patched.done, true)
    assert.equal((await fetch(`${base}/api/todos/${id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await fetch(`${base}/api/todos/${id}`)).status, 404)
    assert.equal((await fetch(`${base}/api/todos`, { method: 'POST', body: '{}' })).status, 400)

    const put = await fetch(`${base}/api/todos/1`, { method: 'PUT' })
    assert.equal(put.status, 405)
    assert.equal(put.headers.get('allow'), 'DELETE, GET, PATCH')
    assert.deepEqual(await fetch(`${base}/api/nothing`).then(res => res.json()), { error: 'not found' })

    // ctx.cache: the count of the todos is cached, the visits are counted
    const first = await fetch(`${base}/api/stats`).then(res => res.json())
    const second = await fetch(`${base}/api/stats`).then(res => res.json())
    assert.equal(first.todos, 1)
    assert.equal(second.visits, first.visits + 1)
  },

  async 'with-auth'(page, base) {
    // security headers on the pages and the API; HSTS in production only
    const home = await fetch(base, { headers: { accept: 'text/html' } })
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(home.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.equal(home.headers.has('strict-transport-security'), !dev)

    // a route of `export const auth`, the session of a login
    assert.equal((await fetch(`${base}/api/me`)).status, 401)
    const login = (name: string, password: string, cookie = '') => fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ name, password }), headers: { cookie } })
    const wrong = await login('bob', 'nope')
    assert.equal(wrong.status, 401)
    assert.equal(wrong.headers.get('set-cookie'), null, 'no session without data')
    const signed = await login('bob', 'cormi')
    const cookie = signed.headers.get('set-cookie')!
    assert.match(cookie, /^cormi\.sid=[\w-]{32}; Max-Age=604800; Path=\/; HttpOnly; SameSite=Lax$/)
    const sid = cookie.split(';')[0]
    assert.deepEqual(await fetch(`${base}/api/me`, { headers: { cookie: sid } }).then(res => res.json()), { name: 'bob', role: 'member' })
    assert.equal((await fetch(`${base}/api/admin/stats`, { headers: { cookie: sid } })).status, 403)
    // the session gets a new id at a login: the one before is gone
    const again = (await login('bob', 'cormi', sid)).headers.get('set-cookie')!.split(';')[0]
    assert.notEqual(again, sid)
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: sid } })).status, 401)
    const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie: again } })
    assert.match(logout.headers.get('set-cookie')!, /^cormi\.sid=; Max-Age=0;/)
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: again } })).status, 401)

    // CORS: the listed origin, with credentials; in dev, the dev server of Vite answers preflights itself
    const preflight = await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { 'origin': 'http://localhost:5173', 'access-control-request-method': 'GET' } })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    if (!dev) assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
    assert.equal((await fetch(`${base}/api/me`, { headers: { origin: 'http://evil.test' } })).headers.get('access-control-allow-origin'), null)

    // the pages: the loaders read the user of the session, on the server
    await page.goto(`${base}/admin`)
    await page.waitForURL(/\/login$/)
    await page.fill('input[name=name]', 'alice')
    await page.fill('input[name=password]', 'cormi')
    for (let i = 0; i < 50 && new URL(page.url()).pathname !== '/'; i++) {
      await page.click('button[type=submit]').catch(() => {})
      await page.waitForTimeout(200)
    }
    await page.waitForSelector('#user:text("Signed in as alice (admin)")')
    await page.click('text=Admin')
    await page.waitForSelector('#admin:text("Admin of alice")')
    const [{ value }] = (await page.context().cookies()).filter(cookie => cookie.name === 'cormi.sid')
    const html = await fetch(base, { headers: { accept: 'text/html', cookie: `cormi.sid=${value}` } }).then(res => res.text())
    assert.match(html, /Signed in as <!-- -->alice/)
    await page.goto(base)
    await page.click('text=Sign out')
    await page.waitForSelector('#user:text("Not signed in")')

    // 5 attempts to sign in a minute (a window may begin meanwhile)
    let limited: Response | undefined
    for (let i = 0; i < 12 && !limited; i++) {
      const res = await login('alice', 'nope')
      if (res.status === 429) limited = res
    }
    assert.ok(limited, 'the attempts are limited')
    assert.match(limited.headers.get('retry-after')!, /^\d+$/)
    assert.equal(limited.headers.get('ratelimit-remaining'), '0')
  },

  async 'with-model'(page, base) {
    await page.goto(`${base}/`)
    await page.waitForFunction(() => document.querySelector('#user')?.textContent?.startsWith('signed in'))
    assert.equal(await text(page, '#user'), 'signed in as Cormi (admin)')
    assert.equal(await text(page, '#open'), '(1)')

    await page.click('text=Counter')
    await page.click('text=+')
    await page.click('text=+')
    assert.equal(await text(page, '#count'), '2')

    await page.click('text=Todos')
    await page.fill('input[placeholder="Add a todo"]', 'Ship plugins')
    await page.click('button[type=submit]')
    assert.deepEqual(await page.$$eval('#todos li span', items => items.map(item => item.textContent)), ['Try Cormi', 'Write a model', 'Ship plugins'])
    assert.equal(await text(page, '#open'), '(2)')

    // the model outlives the page
    await page.click('text=Counter')
    assert.equal(await text(page, '#count'), '2')
  },
}

const examples: Record<string, Example> = {
  ...Object.fromEntries(Object.entries(checks).map(([name, check]) => [name, { check }])),
  'basic': { check: checks.basic, bundlers: ['vite', 'rsbuild'] },
  'with-api': { check: checks['with-api'], ready: '/api/health', clean: ['data/app.db'] },
  'with-tailwind': { check: checks['with-tailwind'], bundlers: ['vite', 'rsbuild'] },

  'with-request': {
    ignore: [/status of 500/],
    async check(page, base) {
      await page.goto(`${base}/`)
      await page.waitForFunction(() => document.querySelectorAll('#users li').length === 5)
      assert.equal(await text(page, '#users li'), 'User 1')
      assert.equal(await text(page, '#headers'), 'headers seen by the server: x-app=cormi, authorization=Bearer demo-token')
      await page.click('text=next')
      await page.waitForFunction(() => document.querySelector('#users li')?.textContent === 'User 6')
      assert.equal(await text(page, '#page'), '2 / 3')
      // request/error is reported by src/app.tsx, and the error reaches useRequest() too
      await page.click('#broken')
      await page.waitForSelector('#toast')
      assert.equal(await text(page, '#toast'), 'the server is on fire')
      assert.equal(await text(page, '#error'), 'request to /api/broken failed with status 500')
    },
  },

  'with-styles': {
    async check(page, base, browser) {
      // both kinds of styles are server-rendered
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.goto(`${base}/`)
      assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('#styled')!).backgroundColor), 'rgb(219, 39, 119)')
      assert.notEqual(await noJs.evaluate(() => getComputedStyle(document.querySelector('#title')!).color), 'rgb(0, 0, 0)')
      await page.goto(`${base}/`)
      await clickUntil(page, '#styled', 'clicked 1')
    },
  },

  'with-data': {
    async check(page, base) {
      await page.goto(`${base}/`)
      await page.waitForFunction(() => document.querySelectorAll('#todos li').length === 2)
      await clickUntil(page, '#add', 'add')
      await page.waitForFunction(() => document.querySelector('#count')?.textContent === 'count: 1')
      await page.click('#add-later')
      await page.waitForFunction(() => document.querySelector('#add-later')?.textContent === 'adding…')
      await page.waitForFunction(() => document.querySelector('#count')?.textContent === 'count: 2')
      await page.check('#compact')
      assert.equal(await text(page, '#mode'), 'compact')
    },
  },

  'with-layout': {
    async check(page, base, browser) {
      // the analytics script is answered locally; gtag queues its calls in dataLayer
      await page.route('https://www.googletagmanager.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }))

      // the menu, built from the configured routes, is server-rendered with antd's styles
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.route('https://www.googletagmanager.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
      await noJs.goto(`${base}/`)
      assert.deepEqual(await noJs.$$eval('.ant-menu-root > li', items => items.map(item => item.textContent)), ['Dashboard', 'Users', 'Settings'])
      assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('.ant-layout-sider')!).backgroundColor), 'rgb(0, 21, 41)')

      await page.goto(`${base}/`)
      await page.waitForSelector('.ant-menu-item-selected >> text=Dashboard')
      await clickUntil(page, '.ant-menu-root > li:nth-child(2) .ant-menu-submenu-title', 'Users')
      await page.click('.ant-menu >> text=List')
      await page.click('#users >> text=Bob')
      await page.waitForSelector('#user >> text=User 2')
      assert.equal(await text(page, '.ant-breadcrumb'), 'Users/Detail')
      // client navigations are reported to Google Analytics (not in dev mode)
      if (dev) return
      const views = await page.evaluate(() => (window as any).dataLayer.filter((args: any) => args[1] === 'page_view').map((args: any) => args[2].page_path))
      assert.deepEqual(views, ['/users', '/users/2'])
    },
  },

  'with-mpa': {
    async check(page, base) {
      await page.goto(`${base}/`)
      assert.equal(await page.title(), 'Home · Cormi MPA')
      await clickUntil(page, 'button', 'clicked 1')
      // pages are documents of their own: links load them
      await page.click('nav >> text=About')
      await page.waitForSelector('#title >> text=About page')
      assert.equal(new URL(page.url()).pathname, '/about.html')
      assert.equal(await page.title(), 'About · Cormi MPA')
      await page.goto(`${base}/about`)
      await page.waitForSelector('#title >> text=About page')
      assert.equal((await fetch(`${base}/nothing`)).status, 404)
    },
  },

  'with-vue': {
    bundlers: ['vite', 'rsbuild'],
    async check(page, base, browser) {
      // server-rendered with the data of the server loader, and the scoped styles of the layout
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.goto(`${base}/about`)
      assert.match((await text(noJs, '#loader'))!, /^served by \w+ on \d{4}-\d{2}-\d{2}$/)
      assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('nav')!).display), 'flex')
      assert.equal(await noJs.evaluate(() => getComputedStyle(document.body).margin), '0px')
      assert.equal((await fetch(`${base}/nowhere`, { headers: { accept: 'text/html' } })).status, 404)

      // hydrated, with the Vue plugin and the title of the runtime plugin
      await page.goto(`${base}/`)
      await page.waitForFunction(() => document.title === 'Cormi · /')
      assert.equal(await text(page, '#greeting'), 'Hello from a runtime plugin')
      await clickUntil(page, 'button', 'clicked 1')

      // client navigation fetches the server loader
      await page.click('text=About')
      await page.waitForFunction(() => document.querySelector('#loader')?.textContent?.startsWith('served by'))
      assert.equal(await page.title(), 'Cormi · /about')
      await page.click('text=User 2')
      await page.waitForSelector('#user >> text=User 2')

      // the console is a React app of its own, also in a Vue app
      if (!dev) return
      await page.goto(`${base}/__cormi/`)
      await page.waitForSelector('[data-stack=renderer] >> text=Vue')
    },
  },

  mf: {
    bundlers: ['vite', 'rsbuild'],
    servers: [
      { dir: 'mf-remote' },
      { dir: 'mf-host', env: ([remote]) => ({ REMOTE_ORIGIN: remote }) },
    ],
    async check(page, base, browser, [remote, host]) {
      await page.goto(`${host}/`)
      await page.waitForSelector('#greeting >> text=Hello host, from the remote app.')
      await clickUntil(page, '#remote-count', 'clicked 1')
    },
  },

  'with-console': {
    bundlers: ['vite', 'rsbuild'],
    servers: [{ dir: 'with-console', env: () => ({ npm_config_registry: REGISTRY, CORMI_MARKET: `${REGISTRY}/index.json` }) }],
    async check(page, base) {
      // a workspace plugin, loaded from its sources by package name
      const greetings: string[] = []
      page.on('console', message => message.type() === 'info' && greetings.push(message.text()))
      await page.goto(`${base}/`)
      await page.waitForSelector('#title')
      await page.waitForFunction(() => document.title === 'Cormi · console')
      await waitFor(() => greetings.includes('Hello from cormi-plugin-hello'))
      if (!dev) {
        const html = await fetch(`${base}/__cormi/`, { headers: { accept: 'text/html' } }).then(res => res.text())
        assert.ok(!html.includes('cormi-console'), 'the console only runs in dev mode')
        return
      }

      const dir = `${root}examples/with-console`
      // the plugin tree the app runs with, which the console writes
      const file = `${dir}/${bundler === 'vite' ? 'cormi.yml' : VARIANT}`
      const config = await readFile(file, 'utf8')
      try {
        await page.goto(`${base}/__cormi/`)
        await page.waitForSelector('.cc-status >> text=已连接')
        await page.waitForSelector('.cc-stat >> text=插件已加载')
        // the console runs on its own Vite and React, whatever the app's
        await page.waitForSelector(`[data-stack=bundler] >> text=${bundler === 'vite' ? 'Vite' : 'Rsbuild'}`)
        await page.waitForSelector('[data-stack=renderer] >> text=React')

        // edit the config of a plugin through its form: cormi.yml is written, the plugin reloads
        await page.click('.cc-nav-item >> text=插件')
        await page.click('.cc-entry-main >> text=cormi-plugin-hello')
        await page.fill('.cc-row:has(code:text-is("greeting")) input', 'Hi from the console')
        await page.click('.cc-config button:text-is("保存")')
        await page.waitForSelector('.cc-saved >> text=已保存')
        assert.match(await readFile(file, 'utf8'), /greeting: Hi from the console/)
        await page.click('.cc-nav-item >> text=日志')
        await page.waitForSelector('.cc-log >> text=loaded, greeting: Hi from the console')

        // the registrations of the plugin, withdrawn when it is disabled
        await page.click('.cc-nav-item >> text=插件')
        await page.click('.cc-entry-main >> text=cormi-plugin-hello')
        await page.click('.cc-tab >> text=注册')
        await page.waitForSelector('.cc-codeline >> text=ctx.app.entry("cormi-plugin-hello/client")')
        await page.click('.cc-detail-head button:text-is("停用")')
        await page.waitForSelector('.cc-detail-head >> text=已停用')
        assert.match(await readFile(file, 'utf8'), /disabled: true/)
        await waitFor(async () => !(await readFile(`${dir}/src/.cormi/entry.tsx`, 'utf8')).includes('cormi-plugin-hello'))
        await page.click('.cc-detail-head button:text-is("启用")')
        await page.waitForSelector('.cc-detail-head >> text=运行中')
        // the console pages of the plugin come back: the console reloads with its new entry
        await page.waitForSelector('.cc-nav-item >> text=Hello')

        // a new workspace plugin, created and enabled from the console
        await page.click('.cc-nav-item >> text=工作区')
        await page.fill('.cc-create input.cc-input', 'e2e')
        await page.click('.cc-create button:text-is("新建")')
        await page.waitForSelector('.cc-saved >> text=已创建 cormi-plugin-e2e')
        await page.waitForSelector('.cc-package:has-text("cormi-plugin-e2e") >> text=已启用')
        await page.click('.cc-nav-item >> text=插件')
        await page.waitForSelector('.cc-entry[data-state=active] >> text=cormi-plugin-e2e')

        // a page the workspace plugin adds to the console, with its own data
        await page.click('.cc-nav-item >> text=Hello')
        await page.waitForSelector('#hello-greeting >> text=Hi from the console')

        // the internals of the app
        await page.click('.cc-nav-item >> text=服务')
        await page.waitForSelector('.cc-table >> text=ctx.router')
        await page.click('.cc-nav-item >> text=应用')
        await page.waitForSelector('.cc-codeline >> text=cormi-plugin-hello/client')
        // the plugins of the app's bundler, those of the renderer included
        await page.waitForSelector('.cc-pills >> text=cormi:route-exports')

        // the market tells what works in this app, from the keywords of the search results
        await page.click('.cc-nav-item >> text=市场')
        const item = (name: string) => page.locator('.cc-package', { has: page.locator(`.cc-package-name:text-is("${name}")`) })
        await item('cormi-plugin-anywhere').locator('text=通用').waitFor()
        // from the index of the registry: official, verified, downloads
        await item('cormi-plugin-anywhere').locator('text=已验证').waitFor()
        await item('cormi-plugin-anywhere').locator('text=月下载 1234').waitFor()
        await item('cormi-plugin-undeclared').locator('text=未声明兼容性').waitFor()
        // the Vue plugin is hidden until asked for; its older version works here
        assert.equal(await item('cormi-plugin-vue-only').count(), 0)
        await page.click('text=显示它们')
        const vue = item('cormi-plugin-vue-only')
        await vue.locator('text=只支持 Vue，当前应用的 UI 框架是 React').waitFor()
        await vue.locator('button:text-is("仍要安装")').click()
        await vue.locator('.cc-confirm').waitFor()
        await vue.locator('text=查找兼容的版本').click()
        await vue.locator('button:text-is("安装 1.0.0（兼容）")').waitFor()
        // a bundler: what switching to it would change
        const webpack = item('cormi-plugin-webpack')
        await webpack.locator('text=启用它会把打包器换成 webpack').waitFor()
        await webpack.locator(`code:text-is("@cormijs/${bundler}")`).waitFor()
      } finally {
        await writeFile(file, config)
        await rm(`${dir}/plugins/e2e`, { recursive: true, force: true })
      }
    },
  },

  federation: {
    servers: [
      { dir: 'federation-host', env: ([, users, orders]) => ({ USERS_URL: `${users}/`, ORDERS_URL: `${orders}/` }) },
      { dir: 'federation-users' },
      { dir: 'federation-orders' },
    ],
    async check(page, base, browser, [host, , orders]) {
      // the menu lists the routes of both packages from their manifests; the eager users package is loaded
      await page.goto(`${host}/users`)
      await page.waitForSelector('#users >> text=Alice')
      assert.deepEqual(await page.$$eval('#menu a', links => links.map(link => link.textContent)), ['Home', 'Users', 'Orders'])
      assert.equal(await page.evaluate(() => document.documentElement.dataset.orders), undefined, 'the orders package loads on demand')

      // a component exposed by the orders package loads the package, with its models
      await page.click('#menu >> text=Home')
      assert.equal(await text(page, '#packages'), 'packages: users, orders')
      await page.waitForSelector('#cart >> text=cart: 0')
      assert.equal(await page.evaluate(() => document.documentElement.dataset.orders), 'loaded')

      // the pages of a package render in the host's layout
      await page.click('#menu >> text=Orders')
      await page.waitForSelector('#title >> text=Orders')
      assert.equal(await page.$('#standalone'), null)
      await page.click('#add-1')
      await page.click('#add-2')
      await page.click('#menu >> text=Home')
      await page.waitForSelector('#cart >> text=cart: 2')

      // a client loader of a package, and the service of another package
      await page.click('#menu >> text=Orders')
      await page.click('#orders >> text=Monitor')
      await page.waitForSelector('#order >> text=Monitor')
      assert.equal(await text(page, '#customer'), 'customer: Carol')
      await page.click('#menu >> text=Users')
      await page.waitForSelector('#users >> text=Alice')

      // a route of a package loads directly
      await page.goto(`${host}/orders/1`)
      await page.waitForSelector('#order >> text=Keyboard')
      assert.equal(await text(page, '#customer'), 'customer: Bob')

      // a package runs by itself in its own frame
      await page.goto(`${orders}/orders`)
      await page.waitForSelector('#standalone >> #cart >> text=cart: 0')
      await clickUntil(page, '#add-1', 'add to cart')
      await page.waitForSelector('#cart >> text=cart: 1')
    },
  },

  qiankun: {
    servers: [
      { dir: 'qiankun-slave' },
      { dir: 'qiankun-master', env: ([slave]) => ({ SLAVE_ENTRY: slave.replace(/^http:/, '') }) },
    ],
    async check(page, base, browser, [slave, master]) {
      // the micro app also runs by itself, server-rendered and hydrated
      await page.goto(`${slave}/`)
      await clickUntil(page, '#slave-count', 'clicked 1')
      assert.equal(await text(page, '#where'), 'by itself')
      assert.equal(await text(page, '#from'), 'props from: nobody')

      await page.goto(`${master}/`)
      await page.click('nav >> text="App 1"')
      // the template of the micro app holds its own server-rendered markup until it mounts
      await page.waitForFunction(() => document.querySelector('[data-micro-app=app1] #where')?.textContent === 'inside the master')
      assert.equal(await text(page, '#from'), 'props from: master')
      await page.click('#slave-count')
      assert.equal(await text(page, '#slave-count'), 'clicked 1')

      // the micro app's router runs below /app1
      await page.click('#slave >> text=About')
      await page.waitForSelector('#slave-about')
      assert.equal(new URL(page.url()).pathname, '/app1/about')

      // leaving the route unmounts the micro app
      await page.click('nav >> text=Home >> nth=0')
      await page.waitForSelector('#master-title')
      assert.equal(await page.$('#slave'), null)

      // a micro app route loads directly
      await page.goto(`${master}/app1/about`)
      await page.waitForSelector('[data-micro-app=app1] #slave-about')
    },
  },
}

async function waitForServer(base: string, server: ChildProcess, ready = '/') {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`the server exited with code ${server.exitCode}`)
    const status = await fetch(base + ready, { headers: { accept: 'text/html' } }).then(res => res.status, () => 0)
    if (status === 200) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`the server at ${base} did not start`)
}

const selected = process.argv.slice(2).filter((arg, index, args) => !arg.startsWith('--') && args[index - 1] !== '--bundler')
const names = (selected.length ? selected : Object.keys(examples))
  .filter(name => (examples[name].bundlers ?? ['vite']).includes(bundler))
const browser = await launch()
const registry = serveRegistry()
let failed = 0
for (const [index, name] of names.entries()) {
  const example = examples[name]
  const servers = example.servers ?? [{ dir: name }]
  const bases = servers.map((_, offset) => `http://localhost:${8300 + index * 10 + offset}`)
  const processes: ChildProcess[] = []
  let output = ''
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(error.message))
  try {
    for (const [offset, server] of servers.entries()) {
      const cwd = `${root}examples/${server.dir}`
      for (const file of example.clean ?? []) await rm(join(cwd, file), { force: true })
      const env = { ...process.env, ...server.env?.(bases) }
      const config: string[] = []
      if (bundler !== 'vite') {
        await writeFile(join(cwd, VARIANT), withBundler(await readFile(join(cwd, 'cormi.yml'), 'utf8'), bundler))
        config.push('--config', VARIANT)
      }
      if (!dev) execFileSync(process.execPath, [cli, 'build', ...config], { cwd, env, stdio: 'ignore' })
      // in dev mode, run the worker directly instead of the daemon
      const child = spawn(process.execPath, [cli, dev ? 'dev' : 'start', ...config, '--port', bases[offset].split(':')[2]], {
        cwd,
        env: { ...env, CORMI_WORKER: dev ? '1' : '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout!.on('data', data => output += data)
      child.stderr!.on('data', data => output += data)
      processes.push(child)
      await waitForServer(bases[offset], child, example.ready)
    }
    await example.check(page, bases[0], browser, bases)
    assert.deepEqual(errors.filter(error => !example.ignore?.some(pattern => pattern.test(error))), [], 'no errors in the browser')
    console.log(`✓ ${name}`)
  } catch (error) {
    failed++
    console.log(`✗ ${name}\n${(error as Error).stack ?? error}\n--- browser errors ---\n${errors.join('\n')}\n--- server output ---\n${output}`)
    // in GitHub Actions, an annotation: readable without access to the logs
    if (process.env.GITHUB_ACTIONS) {
      const text = [(error as Error).message ?? String(error), '--- browser errors ---', ...errors, '--- server output (end) ---', output.slice(-3000)].join('\n')
      console.log(`::error title=e2e ${name} (${bundler}${dev ? ', dev' : ''})::${text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`)
    }
  } finally {
    await page.close()
    for (const child of processes) {
      child.kill('SIGTERM')
      await new Promise(resolve => child.exitCode === null ? child.once('exit', resolve) : resolve(undefined))
    }
    if (bundler !== 'vite') {
      for (const server of servers) await rm(`${root}examples/${server.dir}/${VARIANT}`, { force: true })
    }
  }
}
await browser.close()
registry.close()
process.exit(failed ? 1 : 0)
