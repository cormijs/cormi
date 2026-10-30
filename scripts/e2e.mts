// End-to-end checks of the examples in a browser.
//
//   node --import tsx scripts/e2e.mts [--dev] [example ...]
//
// Without `--dev`, each example is built and served with `cormi preview`;
// with `--dev`, it is served by the dev server.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright-core'
import { launch } from './browser.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = `${root}packages/cormi/bin/cormi.js`
const dev = process.argv.includes('--dev')

type Check = (page: Page, base: string, browser: Browser) => Promise<void>

async function text(page: Page, selector: string) {
  return (await page.textContent(selector))?.trim()
}

const examples: Record<string, Check> = {
  async basic(page, base, browser) {
    // server-rendered, complete without JavaScript
    const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
    await noJs.goto(`${base}/about`)
    assert.match((await text(noJs, '#loader'))!, /^served by \w+ on \d{4}-\d{2}-\d{2}$/)
    assert.equal(await noJs.evaluate(() => getComputedStyle(document.querySelector('nav')!).display), 'flex')
    assert.equal(await noJs.getAttribute('meta[name=generator]', 'content'), 'cormi')

    // hydrated, with the runtime plugin of src/app.ts
    await page.goto(`${base}/`)
    await page.waitForFunction(() => document.title === 'Cormi · /')
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
  },

  async 'with-tailwind'(page, base) {
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
  const cwd = `${root}examples/${name}`
  const port = 8300 + index
  const base = `http://localhost:${port}`
  if (!dev) execFileSync(process.execPath, [cli, 'build'], { cwd, stdio: 'ignore' })
  // in dev mode, run the worker directly instead of the daemon
  const server = spawn(process.execPath, [cli, dev ? 'dev' : 'preview', '--port', String(port)], {
    cwd,
    env: { ...process.env, CORMI_WORKER: dev ? '1' : '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout!.on('data', data => output += data)
  server.stderr!.on('data', data => output += data)
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(error.message))
  try {
    await waitForServer(base, server)
    await examples[name](page, base, browser)
    assert.deepEqual(errors, [], 'no errors in the browser')
    console.log(`✓ ${name}`)
  } catch (error) {
    failed++
    console.log(`✗ ${name}\n${(error as Error).stack ?? error}\n--- server output ---\n${output}`)
  } finally {
    await page.close()
    server.kill('SIGTERM')
    await new Promise(resolve => server.once('exit', resolve))
  }
}
await browser.close()
process.exit(failed ? 1 : 0)
