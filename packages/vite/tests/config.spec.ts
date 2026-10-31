import { describe, expect, it } from 'vitest'
import { getEntryAssets, toAliases } from '../src/config.ts'
import { toBuildTarget } from '../src/index.ts'

describe('vite helpers', () => {
  it('turns aliases into exact or prefix matches, longest key first', () => {
    const [exact, long, short] = toAliases({ '@': '/src', '@@': '/tmp', 'foo$': '/foo.js' })
    expect(long.find.toString()).toBe('/^@@(?=\\/|$)/')
    expect(short.find.toString()).toBe('/^@(?=\\/|$)/')
    expect((exact.find as RegExp).test('foo')).toBe(true)
    expect((exact.find as RegExp).test('foo/bar')).toBe(false)
  })

  it('collects the assets of an entry from the manifest', () => {
    const assets = getEntryAssets({
      'src/.cormi/entry.tsx': { file: 'static/cormi.js', css: ['static/cormi.css'], imports: ['_shared.js'], dynamicImports: ['src/pages/index.tsx'] },
      '_shared.js': { file: 'static/shared.js' },
      'src/pages/index.tsx': { file: 'static/index.js', css: ['static/index.css'] },
    } as any, 'src/.cormi/entry.tsx', '/base/')
    expect(assets).toEqual({
      js: ['/base/static/cormi.js'],
      css: ['/base/static/cormi.css', '/base/static/index.css'],
      preload: ['/base/static/shared.js'],
    })
  })

  it('turns targets into esbuild targets', () => {
    expect(toBuildTarget({ chrome: 87, safari: '14', ie: false })).toEqual(['chrome87', 'safari14'])
    expect(toBuildTarget(['es2020'])).toEqual(['es2020'])
    expect(toBuildTarget(undefined)).toBeUndefined()
  })
})
