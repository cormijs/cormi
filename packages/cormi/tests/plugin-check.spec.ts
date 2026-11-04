import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkPlugin, inferCompat } from '../src/plugin-check.ts'

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

describe('the inference of cormi plugin check', () => {
  const ok = { status: 'ok' } as const
  const skipped = { status: 'skipped', reason: '@cormijs/react with vite needs @vitejs/plugin-react: add it to the dependencies of the app' } as const
  const waits = (...missing: string[]) => ({ status: 'pending', missing }) as const
  const names = { bundler: ['vite', 'rsbuild'], renderer: ['react', 'vue'] }

  it('judges a bundler by the UI frameworks the plugin supports, not by skipped cells', () => {
    // a React plugin where Vite × React could not be checked: Vite × Vue waits for react, which says nothing of Vite
    const cells = { vite: { react: skipped, vue: waits('react') }, rsbuild: { react: ok, vue: waits('react') } }
    expect(inferCompat(cells, ['app', 'react'], [], names)).toEqual({ bundler: undefined, renderer: ['react'] })
  })

  it('judges a UI framework by the bundlers the plugin supports', () => {
    const cells = { vite: { react: skipped, vue: ok }, rsbuild: { react: waits('vite'), vue: waits('vite') } }
    expect(inferCompat(cells, ['app', 'vite'], [], names)).toEqual({ bundler: ['vite'], renderer: undefined })
  })

  it('takes the bundlers of the maps of ctx.bundler.plugin(), and nothing when a plugin loads nowhere', () => {
    const all = { vite: { react: ok, vue: ok }, rsbuild: { react: ok, vue: ok } }
    expect(inferCompat(all, [], [['vite', 'rsbuild']], names)).toEqual({ bundler: ['vite', 'rsbuild'], renderer: undefined })
    expect(inferCompat(all, [], [], names)).toEqual({ bundler: undefined, renderer: undefined })
    const failed = { status: 'failed', error: 'boom' } as const
    expect(inferCompat({ vite: { react: failed } }, [], [], names).bundler).toBeNull()
  })
})
