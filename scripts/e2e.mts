// End-to-end checks of the examples in a browser.
//
//   node --import tsx scripts/e2e.mts [--dev] [example ...]
//
// Without `--dev`, each example is built and served with `cormi preview`;
// with `--dev`, it is served by the dev server.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright-core'
import { launch } from './browser.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = `${root}packages/cormi/bin/cormi.js`
const dev = process.argv.includes('--dev')

/** `bases` are the URLs of `servers`; `base` is the first one. */
type Check = (page: Page, base: string, browser: Browser, bases: string[]) => Promise<void>

interface Example {
  check: Check
  /** the example directories to serve (default: the example itself), with their environment */
  servers?: { dir: string; env?: (bases: string[]) => Record<string, string> }[]
  /** console errors the check causes on purpose */
  ignore?: RegExp[]
}

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

    // pages exported by @cormi/plugin-export-static work on a static host
    if (!dev) {
      const port = Number(new URL(base).port) + 5
      const host = await serveStatic(`${root}examples/basic/dist`, port)
      try {
        await page.goto(`http://localhost:${port}/about`)
        assert.match((await text(page, '#loader'))!, /^served by \w+ on \d{4}-\d{2}-\d{2}$/)
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

  async 'with-tailwind'(page, base) {
    const html = await fetch(base, { headers: { accept: 'text/html' } }).then(res => res.text())
    assert.match(html, /<script type="module" src="[^"]+" crossorigin="anonymous">/)
    await page.goto(`${base}/`)
    await page.click('button')
    assert.equal(await text(page, 'button'), 'clicked 1')
    const background = await page.evaluate(() => getComputedStyle(document.querySelector('button')!).backgroundColor)
    assert.notEqual(background, 'rgba(0, 0, 0, 0)', 'utility classes are applied')
    await page.click('text=About')
    await page.waitForSelector('text=Tailwind scans')
  },

  async 'with-antd'(page, base, browser) {
    // the styles of antd are rendered on the server
    const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
    await noJs.goto(`${base}/`)
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('.ant-btn-primary')!).backgroundColor), 'rgb(99, 102, 241)')
    assert.equal(await noJs.getAttribute('.ant-picker input', 'placeholder'), '请选择日期')

    await page.goto(`${base}/`)
    await page.click('.ant-btn-primary')
    await page.waitForSelector('.ant-message-notice')
    assert.equal(await text(page, '.ant-message-notice'), 'Thanks!')
    await page.click('text=About')
    await page.waitForSelector('text=only the antd plugin reloads')
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

async function waitForServer(base: string, server: ChildProcess) {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`the server exited with code ${server.exitCode}`)
    const status = await fetch(base, { headers: { accept: 'text/html' } }).then(res => res.status, () => 0)
    if (status === 200) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`the server at ${base} did not start`)
}

const selected = process.argv.slice(2).filter(arg => !arg.startsWith('--'))
const names = selected.length ? selected : Object.keys(examples)
const browser = await launch()
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
      const env = { ...process.env, ...server.env?.(bases) }
      if (!dev) execFileSync(process.execPath, [cli, 'build'], { cwd, env, stdio: 'ignore' })
      // in dev mode, run the worker directly instead of the daemon
      const child = spawn(process.execPath, [cli, dev ? 'dev' : 'preview', '--port', bases[offset].split(':')[2]], {
        cwd,
        env: { ...env, CORMI_WORKER: dev ? '1' : '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout!.on('data', data => output += data)
      child.stderr!.on('data', data => output += data)
      processes.push(child)
      await waitForServer(bases[offset], child)
    }
    await example.check(page, bases[0], browser, bases)
    assert.deepEqual(errors.filter(error => !example.ignore?.some(pattern => pattern.test(error))), [], 'no errors in the browser')
    console.log(`✓ ${name}`)
  } catch (error) {
    failed++
    console.log(`✗ ${name}\n${(error as Error).stack ?? error}\n--- browser errors ---\n${errors.join('\n')}\n--- server output ---\n${output}`)
  } finally {
    await page.close()
    for (const child of processes) {
      child.kill('SIGTERM')
      await new Promise(resolve => child.exitCode === null ? child.once('exit', resolve) : resolve(undefined))
    }
  }
}
await browser.close()
process.exit(failed ? 1 : 0)
