import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { initialize, resolve } from '../src/production-hook.ts'

const root = join('/', 'app')
const compiled = (path: string) => join(root, 'dist/node', path)

initialize!({
  files: {
    [join(root, 'plugin.ts')]: compiled('plugin.mjs'),
    [join(root, 'plugins/foo/src/index.ts')]: compiled('plugins/foo/src/index.mjs'),
  },
  packages: { 'cormi-plugin-foo': compiled('plugins/foo/src/index.mjs') },
})

const next = (specifier: string) => ({ url: `next:${specifier}` })

function resolveSync(specifier: string, parent = pathToFileURL(join(root, 'cormi.yml')).href) {
  return resolve(specifier, { parentURL: parent, conditions: [], importAttributes: {} }, next as any) as { url: string }
}

describe('production hook', () => {
  it('resolves the sources of the plugin tree to their compiled modules', () => {
    expect(resolveSync(pathToFileURL(join(root, 'plugin.ts')).href).url).toBe(pathToFileURL(compiled('plugin.mjs')).href)
    // without the extension, relative to the importer
    expect(resolveSync('./plugin').url).toBe(pathToFileURL(compiled('plugin.mjs')).href)
  })

  it('resolves the workspace packages by name', () => {
    expect(resolveSync('cormi-plugin-foo').url).toBe(pathToFileURL(compiled('plugins/foo/src/index.mjs')).href)
  })

  it('leaves other modules to node', () => {
    expect(resolveSync('cordis').url).toBe('next:cordis')
    expect(resolveSync('./other.ts').url).toBe('next:./other.ts')
  })
})
