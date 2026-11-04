// Checks the apps of @cormijs/create: each kind is created, installed with the
// packages of the workspace, type-checked, built, served and used in a browser.
//
//   node --import tsx scripts/create-check.mts [id ...]
//
// The apps are created in examples/created-*, as packages of the workspace,
// and removed afterwards; pnpm-lock.yaml is restored.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright-core'
import { launch } from './browser.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = `${root}packages/cormi/bin/cormi.js`
const create = `${root}packages/create/bin/create.js`
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')

type Check = (page: Page, base: string, browser: Browser) => Promise<void>

interface Case {
  args: string[]
  check: Check
}

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  return { status: res.status, headers: res.headers, body: res.status === 204 ? null : await res.json() }
}

const checks = {
  async counter(page, base) {
    await page.goto(base)
    for (let i = 0; i < 50 && await page.textContent('button') !== 'clicked 1'; i++) {
      await page.click('button')
      await page.waitForTimeout(200)
    }
    assert.equal(await page.textContent('button'), 'clicked 1')
    await page.click('text=About')
    await page.waitForSelector('h1:text("About")')
  },

  async todosApi(base: string) {
    const list = await json(`${base}/api/todos`)
    assert.equal(list.body[0].title, 'Try Cormi')
    assert.match(list.headers.get('server-timing')!, /^app;dur=/)
    const created = await json(`${base}/api/todos`, { method: 'POST', body: JSON.stringify({ title: 'Ship it' }) })
    assert.equal(created.status, 201)
    const id = created.body.id
    assert.equal((await json(`${base}/api/todos/${id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) })).body.done, true)
    assert.equal((await json(`${base}/api/todos/${id}`, { method: 'DELETE' })).status, 204)
    assert.equal((await json(`${base}/api/todos/${id}`)).status, 404)
    assert.equal((await json(`${base}/api/todos`, { method: 'POST', body: '{}' })).status, 400)
    assert.equal((await json(`${base}/api/nothing`)).status, 404)
  },

  async todosPage(page: Page, base: string) {
    await page.goto(base)
    await page.waitForSelector('#todos li:has-text("Try Cormi")')
    // hydrated: the form submits through the API
    for (let i = 0; i < 50 && !await page.locator('#todos li:has-text("Write the docs")').count(); i++) {
      await page.fill('input[placeholder="What needs doing?"]', 'Write the docs')
      await page.click('button[type=submit]')
      await page.waitForTimeout(300)
    }
    const item = page.locator('#todos li:has-text("Write the docs")')
    // a controlled checkbox: checked once the API answers
    await item.locator('input[type=checkbox]').click()
    await item.locator('span.done').waitFor()
    await item.locator('button:text("Delete")').click()
    await item.waitFor({ state: 'detached' })
  },
} satisfies Record<string, unknown>

const CASES: Record<string, Case> = {
  'web-react-vite': { args: ['-t', 'web', '--ui', 'react', '--bundler', 'vite'], check: checks.counter },
  'web-vue-rsbuild': { args: ['-t', 'web', '--ui', 'vue', '--bundler', 'rsbuild'], check: checks.counter },
  'api-sqlite': { args: ['-t', 'api', '--database', 'sqlite'], check: (page, base) => checks.todosApi(base) },
  'api-none': {
    args: ['-t', 'api', '--database', 'none'],
    async check(page, base) {
      assert.match((await json(`${base}/api/hello`)).body.message, /^Hello from the server, in preview mode$/)
    },
  },
  'fullstack-react-vite-sqlite': {
    args: ['-t', 'fullstack', '--ui', 'react', '--bundler', 'vite', '--database', 'sqlite'],
    async check(page, base) {
      await checks.todosApi(base)
      await checks.todosPage(page, base)
    },
  },
  'fullstack-vue-vite-memory': {
    args: ['-t', 'fullstack', '--ui', 'vue', '--bundler', 'vite', '--database', 'memory'],
    check: checks.todosPage,
  },
  'fullstack-react-rsbuild-none': {
    args: ['-t', 'fullstack', '--ui', 'react', '--bundler', 'rsbuild', '--database', 'none'],
    async check(page, base) {
      await page.goto(base)
      await page.waitForSelector('#message:text("Hello from the server, in preview mode")')
    },
  },
  'ssr-react-vite-sqlite': {
    args: ['-t', 'ssr', '--ui', 'react', '--bundler', 'vite', '--database', 'sqlite'],
    async check(page, base, browser) {
      // rendered on the server, from the database
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.goto(base)
      assert.equal(await noJs.textContent('#todos li span'), 'Try Cormi')
      await noJs.context().close()
      await checks.todosPage(page, base)
    },
  },
  'ssr-vue-rsbuild-sqlite': {
    args: ['-t', 'ssr', '--ui', 'vue', '--bundler', 'rsbuild', '--database', 'sqlite'],
    async check(page, base, browser) {
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.goto(base)
      assert.equal(await noJs.textContent('#todos li span'), 'Try Cormi')
      await noJs.context().close()
      await checks.todosPage(page, base)
    },
  },
  'ssr-vue-vite-none': {
    args: ['-t', 'ssr', '--ui', 'vue', '--bundler', 'vite', '--database', 'none'],
    async check(page, base, browser) {
      const noJs = await (await browser.newContext({ javaScriptEnabled: false })).newPage()
      await noJs.goto(base)
      assert.equal(await noJs.textContent('#message'), 'Hello from the server, in preview mode')
      await noJs.context().close()
    },
  },
}

const selected = process.argv.slice(2)
const ids = selected.length ? selected : Object.keys(CASES)
const dirs = ids.map(id => `${root}examples/created-${id}`)
const lockfile = readFileSync(`${root}pnpm-lock.yaml`, 'utf8')

function cleanup() {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  writeFileSync(`${root}pnpm-lock.yaml`, lockfile)
}

async function waitForServer(url: string, server: ChildProcess) {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`the server exited with code ${server.exitCode}`)
    if (await fetch(url).then(res => res.status < 500, () => false)) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`the server at ${url} did not start`)
}

let failed = 0
try {
  for (const [index, id] of ids.entries()) {
    execFileSync(process.execPath, [create, dirs[index], ...CASES[id].args, '--no-install', '--yes'], { stdio: 'ignore' })
    // the packages of the workspace instead of the published ones
    const file = `${dirs[index]}/package.json`
    const meta = JSON.parse(readFileSync(file, 'utf8'))
    meta.name = `@cormijs/created-${id}`
    for (const name of Object.keys(meta.dependencies)) {
      if (name.startsWith('@cormijs/')) meta.dependencies[name] = 'workspace:*'
    }
    writeFileSync(file, JSON.stringify(meta, null, 2) + '\n')
  }
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: root, stdio: 'ignore' })

  const browser = await launch()
  for (const [index, id] of ids.entries()) {
    const cwd = dirs[index]
    const meta = JSON.parse(readFileSync(`${cwd}/package.json`, 'utf8'))
    const base = `http://localhost:${8500 + index}`
    let output = ''
    let server: ChildProcess | undefined
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      if (meta.scripts.setup) execFileSync(process.execPath, [cli, 'setup'], { cwd, stdio: 'ignore' })
      // .vue files need vue-tsc
      if (!meta.dependencies.vue) execFileSync(process.execPath, [tsc, '-p', '.'], { cwd, encoding: 'utf8' })
      if (meta.scripts.build) execFileSync(process.execPath, [cli, 'build'], { cwd, stdio: 'ignore' })
      server = spawn(process.execPath, [cli, meta.scripts.start ? 'start' : 'preview', '--port', base.split(':')[2]], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      server.stdout!.on('data', data => output += data)
      server.stderr!.on('data', data => output += data)
      await waitForServer(meta.scripts.build ? base : `${base}/api/`, server)
      // the API routes of the database answer 503 until it is there
      if (meta.dependencies['@cormijs/database']) {
        for (let i = 0; i < 50 && (await fetch(`${base}/api/todos`)).status === 503; i++) await new Promise(resolve => setTimeout(resolve, 200))
      }
      await CASES[id].check(page, base, browser)
      assert.deepEqual(errors, [], 'no errors in the browser')
      console.log(`✓ ${id}`)
    } catch (error: any) {
      failed++
      console.log(`✗ ${id}\n${error.stdout ?? ''}${error.stack ?? error}\n--- browser errors ---\n${errors.join('\n')}\n--- server output ---\n${output}`)
    } finally {
      await page.close()
      if (server && server.exitCode === null) {
        server.kill('SIGTERM')
        await new Promise(resolve => server!.once('exit', resolve))
      }
    }
  }
  await browser.close()
} finally {
  cleanup()
  execFileSync('pnpm', ['install', '--frozen-lockfile'], { cwd: root, stdio: 'ignore' })
}
process.exit(failed ? 1 : 0)
