import { describe, expect, it } from 'vitest'
import { checkCompat, conclude, forExport, manifestKeywords } from '../src/index.ts'

describe('manifest', () => {
  it('reads the cormi field: omitted dimensions support any', () => {
    const manifest = conclude({
      name: '@cormi/plugin-tailwindcss',
      description: 'Tailwind CSS',
      peerDependencies: { cormi: '^0.2.0' },
      cormi: { bundler: ['vite', 'rsbuild'], renderer: [], service: { optional: ['server'] } },
    })
    expect(manifest).toMatchObject({ source: 'declared', bundler: ['vite', 'rsbuild'], description: 'Tailwind CSS', cormi: '^0.2.0' })
    // an empty list is ignored
    expect(manifest.renderer).toBeUndefined()
    expect(manifest.service?.optional).toEqual(['server'])
  })

  it('reads the keywords of search results, and mirrors the manifest in keywords', () => {
    const manifest = conclude({ name: 'x', keywords: ['cormi-plugin', 'bundler:vite', 'renderer:*', 'required:server', 'market:preview'] })
    expect(manifest).toMatchObject({ source: 'declared', bundler: ['vite'], preview: true })
    expect(manifest.renderer).toBeUndefined()
    expect(manifestKeywords(manifest)).toEqual(['bundler:vite', 'renderer:*', 'required:server', 'market:preview'])
    expect(conclude({ name: 'x', keywords: manifestKeywords(manifest) })).toMatchObject({ bundler: ['vite'], source: 'declared' })
  })

  it('infers the stack from peer dependencies on its implementations', () => {
    const react = conclude({ name: 'x', peerDependencies: { '@cormi/react': '*', 'cormi': '*' } })
    expect(react).toMatchObject({ source: 'inferred', renderer: ['react'] })
    expect(react.bundler).toBeUndefined()
    // optional peers are integrations, not requirements
    const optional = conclude({ name: 'x', peerDependencies: { '@cormi/vite': '*' }, peerDependenciesMeta: { '@cormi/vite': { optional: true } } })
    expect(optional.source).toBe('unknown')
  })

  it('takes the declaration of an export over the package, key by key', () => {
    const manifest = conclude({ name: 'qiankun', cormi: { renderer: ['react'], exports: { './slave': { bundler: ['vite'] } } } })
    expect(forExport(manifest, './slave')).toMatchObject({ bundler: ['vite'], renderer: ['react'] })
    expect(forExport(manifest, './master').bundler).toBeUndefined()
  })

  it('checks a plugin against the stack of the app', () => {
    const manifest = conclude({ name: 'x', peerDependencies: { cormi: '^0.2.0' }, cormi: { bundler: ['vite'], renderer: ['react'] } })
    expect(checkCompat(manifest, { bundler: 'vite', renderer: 'react', cormi: '0.2.3' }).status).toBe('ok')
    expect(checkCompat(manifest, { bundler: 'rsbuild', renderer: 'react', cormi: '0.3.0' })).toEqual({
      status: 'incompatible',
      inferred: false,
      reasons: [
        { dimension: 'bundler', supported: ['vite'], current: 'rsbuild' },
        { dimension: 'cormi', supported: ['^0.2.0'], current: '0.3.0' },
      ],
    })
    // the app has no UI framework yet; workspace ranges are not compared
    expect(checkCompat(conclude({ name: 'x', peerDependencies: { cormi: 'workspace:*' }, cormi: { renderer: ['vue'] } }), { bundler: 'vite', cormi: '0.1.0' }).status).toBe('ok')
    expect(checkCompat(conclude({ name: 'x' }), { bundler: 'vite' }).status).toBe('unknown')
  })
})
