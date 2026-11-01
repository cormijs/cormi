import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkPlugin } from '../src/plugin-check.ts'

const plugin = (name: string) => fileURLToPath(new URL(`../../../plugins/plugin-${name}`, import.meta.url))

describe('cormi plugin check', () => {
  it('infers the bundlers of a plugin from the variants of ctx.bundler.plugin()', async () => {
    const report = await checkPlugin(plugin('unocss'))
    expect(report.exports.map(item => item.subpath)).toEqual(['.'])
    expect(report.exports[0].cells.rsbuild.react).toEqual({ status: 'failed', error: 'the plugin supports vite, not rsbuild' })
    expect(report.inferred).toEqual({ compat: { bundler: ['vite'] }, exports: {} })
    expect(report.mismatches).toEqual([])
  }, 30000)

  it('checks each plugin of a package, but not its browser modules', async () => {
    const report = await checkPlugin(plugin('qiankun'))
    expect(report.exports.map(item => item.subpath)).toEqual(['./master', './slave'])
    expect(report.exports[0].cells.vite.vue).toEqual({ status: 'pending', missing: ['react'] })
    expect(report.inferred).toEqual({ compat: { renderer: ['react'] }, exports: { './slave': { bundler: ['vite'] } } })
  }, 30000)

  it('takes a plugin that supports every stack checked as supporting any', async () => {
    const report = await checkPlugin(plugin('mock'))
    expect(report.inferred?.compat).toEqual({})
  }, 30000)
})
