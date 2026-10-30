import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { settle, start, stop } from '../src/index.ts'

describe('start()', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'cormi-start-'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }))
    // a plugin counting its applications, exposed on globalThis
    writeFileSync(join(cwd, 'counter.mjs'), [
      'export const name = "counter"',
      'export function apply(ctx, config) {',
      '  globalThis.__applied = (globalThis.__applied ?? 0) + 1',
      '  globalThis.__config = config',
      '  globalThis.__mode = ctx.cormi.mode',
      '}',
    ].join('\n'))
    writeFileSync(join(cwd, 'cormi.yml'), '- name: ./counter.mjs\n  config:\n    word: hello\n')
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    delete (globalThis as any).__applied
  })

  it('loads the plugin tree of cormi.yml, with ctx.cormi on the root context', async () => {
    const ctx = await start({ cwd, mode: 'setup', logger: false })
    await settle(ctx)
    expect((globalThis as any).__applied).toBe(1)
    expect((globalThis as any).__config).toEqual({ word: 'hello' })
    expect((globalThis as any).__mode).toBe('setup')

    // a config change reloads only that plugin, as when cormi.yml is edited
    const entry = [...ctx.loader.entries()].find(entry => entry.options.name === './counter.mjs')!
    await entry.update({ config: { word: 'world' } })
    await settle(ctx)
    expect((globalThis as any).__applied).toBe(2)
    expect((globalThis as any).__config).toEqual({ word: 'world' })
    await stop(ctx)
  })
})
