import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createPlugin, getPackageName, resolveExport, resolveWorkspace, scanWorkspace, toPackageName } from '../src/workspace.ts'

const dirs: string[] = []
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cormi-workspace-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resolveExport()', () => {
  const target = (exports: unknown) => ({ name: 'cormi-plugin-foo', dir: '/app/plugins/foo', exports })

  it('prefers the source condition, wherever it is written', () => {
    const exports = { '.': { types: './lib/index.d.ts', default: './lib/index.js', source: './src/index.ts' } }
    expect(resolveExport(target(exports), '.', ['node', 'import'])).toBe('/app/plugins/foo/src/index.ts')
  })

  it('resolves subpaths and patterns', () => {
    const exports = { '.': './lib/index.js', './client': './client/index.tsx', './icons/*': './icons/*.svg' }
    expect(resolveExport(target(exports), './client', ['browser'])).toBe('/app/plugins/foo/client/index.tsx')
    expect(resolveExport(target(exports), './icons/star', ['browser'])).toBe('/app/plugins/foo/icons/star.svg')
    expect(resolveExport(target(exports), './missing', ['browser'])).toBeUndefined()
  })

  it('picks the conditions of the environment', () => {
    const exports = { '.': { browser: './lib/browser.js', node: './lib/node.js' } }
    expect(resolveExport(target(exports), '.', ['browser', 'import'])).toBe('/app/plugins/foo/lib/browser.js')
    expect(resolveExport(target(exports), '.', ['node', 'import'])).toBe('/app/plugins/foo/lib/node.js')
  })
})

describe('workspace packages', () => {
  it('names packages', () => {
    expect(toPackageName('hello')).toBe('cormi-plugin-hello')
    expect(toPackageName('@acme/cormi-plugin-hello')).toBe('@acme/cormi-plugin-hello')
    expect(() => toPackageName('Hello World')).toThrow('invalid package name')
    expect(getPackageName('@acme/foo/client')).toBe('@acme/foo')
    expect(getPackageName('./plugin.ts')).toBeUndefined()
  })

  it('creates a plugin that the workspace resolves from its sources', async () => {
    const cwd = tempDir()
    const files = await createPlugin(join(cwd, 'plugins'), 'cormi-plugin-hello', { client: true, console: true })
    expect(files.map(file => file.slice(cwd.length + 1))).toEqual([
      'plugins/hello/package.json',
      'plugins/hello/src/index.ts',
      'plugins/hello/client/index.tsx',
      'plugins/hello/console/index.tsx',
    ])
    expect(readFileSync(join(cwd, 'plugins/hello/src/index.ts'), 'utf8')).toContain(`ctx.app.entry('cormi-plugin-hello/client'`)

    const packages = scanWorkspace(cwd)
    expect(Object.keys(packages)).toEqual(['cormi-plugin-hello'])
    expect(packages['cormi-plugin-hello'].path).toBe('plugins/hello')
    expect(resolveWorkspace(packages, 'cormi-plugin-hello', ['node', 'import'])).toBe(join(cwd, 'plugins/hello/src/index.ts'))
    expect(resolveWorkspace(packages, 'cormi-plugin-hello/console', ['browser'])).toBe(join(cwd, 'plugins/hello/console/index.tsx'))
    expect(resolveWorkspace(packages, 'react', ['browser'])).toBeUndefined()

    await expect(createPlugin(join(cwd, 'plugins'), 'cormi-plugin-hello', {})).rejects.toThrow('exists already')
  })
})
