import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { settle, start, stop } from '@cormi/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectPackageManager, getPlugins, getServices } from '../src/builtin.ts'

describe('the data of the console', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'cormi-console-'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }))
    writeFileSync(join(cwd, 'provider.mjs'), [
      'export const name = "provider"',
      'export function apply(ctx) {',
      '  ctx.provide("greeter", { greet: () => "hi" })',
      '  ctx.on("custom/event", () => {})',
      '}',
    ].join('\n'))
    writeFileSync(join(cwd, 'user.mjs'), 'export const name = "user"\nexport const inject = ["greeter"]\nexport function apply() {}\n')
    writeFileSync(join(cwd, 'cormi.yml'), [
      '- name: ./provider.mjs',
      '- name: ./user.mjs',
      '- name: ./missing.mjs',
      '  disabled: true',
      '',
    ].join('\n'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('lists the plugins of cormi.yml in order, with their states and registrations', async () => {
    const ctx = await start({ cwd, mode: 'setup', logger: false })
    try {
      await settle(ctx)
      const plugins = getPlugins(ctx)
      expect(plugins.map(plugin => [plugin.name, plugin.state])).toEqual([
        ['./provider.mjs', 'active'],
        ['./user.mjs', 'active'],
        ['./missing.mjs', 'disabled'],
      ])
      expect(plugins[0].effects).toEqual(['ctx.provide("greeter")', 'ctx.on("custom/event")'])
      expect(plugins[0].provides).toEqual(['greeter'])
      expect(plugins[1].inject).toEqual(['greeter'])

      const greeter = getServices(ctx).find(service => service.name === 'greeter')
      expect(greeter).toEqual({ name: 'greeter', provider: './provider.mjs', dependents: ['./user.mjs'] })
    } finally {
      await stop(ctx)
    }
  })

  it('detects the package manager from the lock file', () => {
    expect(detectPackageManager(cwd)).not.toBe('yarn')
    const nested = join(cwd, 'packages/app')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(cwd, 'yarn.lock'), '')
    expect(detectPackageManager(nested)).toBe('yarn')
  })
})
