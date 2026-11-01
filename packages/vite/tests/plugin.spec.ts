import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { App, Cormi } from '@cormijs/core'
import { Context } from 'cordis'
import type { Plugin } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Vite } from '../src/index.ts'

describe('ctx.bundler.plugin()', () => {
  let cwd: string
  let ctx: Context

  beforeEach(async () => {
    cwd = mkdtempSync(join(tmpdir(), 'cormi-vite-'))
    ctx = new Context()
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd, mode: 'setup' })
    await ctx.plugin(App)
    await ctx.plugin(Vite, {})
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  const names = async () => {
    const config = await ctx.get('vite')!.resolveConfig({ command: 'build' })
    return (config.plugins as Plugin[]).map(plugin => plugin?.name)
  }

  it('uses the vite variant, and withdraws it with the plugin', async () => {
    const fiber = ctx.plugin({
      inject: ['bundler'],
      apply: (ctx: Context) => {
        ctx.bundler.plugin({ vite: { name: 'object' } })
        ctx.bundler.plugin({ vite: env => ({ name: `factory:${env.command}` }) })
      },
    })
    await fiber
    expect(await names()).toEqual(expect.arrayContaining(['object', 'factory:build']))
    await fiber.dispose()
    expect(await names()).not.toContain('object')
  })

  it('takes Vite plugins as they are', async () => {
    const bundler = ctx.get('bundler')!
    const dispose = bundler.plugin({ vite: { name: 'mapped' } })
    ctx.get('vite')!.plugin({ name: 'native' })
    expect(await names()).toEqual(expect.arrayContaining(['mapped', 'native']))
    dispose()
    expect(await names()).not.toContain('mapped')
  })

  it('throws for a plugin without a vite variant', () => {
    const bundler = ctx.get('bundler')!
    expect(() => bundler.plugin({ rsbuild: {} } as any)).toThrow('the plugin supports rsbuild, not vite')
    expect(() => bundler.plugin({})).toThrow('the plugin supports no bundler, not vite')
  })
})
