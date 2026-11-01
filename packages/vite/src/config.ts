import type { Dict } from 'cosmokit'
import type { Alias, Manifest } from 'vite'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `{ foo: 'bar' }` -> aliases matching `foo` and `foo/*` but not `foobar`;
 * a trailing `$` matches the exact specifier only. Longer keys win.
 */
export function toAliases(alias: Dict<string>): Alias[] {
  return Object.entries(alias)
    .sort(([a], [b]) => b.length - a.length)
    .map(([find, replacement]) => find.endsWith('$')
      ? { find: new RegExp(`^${escapeRegExp(find.slice(0, -1))}$`), replacement }
      : { find: new RegExp(`^${escapeRegExp(find)}(?=/|$)`), replacement })
}

export type { EntryAssets } from '@cormijs/core'
import type { EntryAssets } from '@cormijs/core'

function withBase(base: string, file: string) {
  return `${base.endsWith('/') ? base : base + '/'}${file}`
}

/** The js, css and preload files of an entry, from Vite's manifest. */
export function getEntryAssets(manifest: Manifest, key: string, base: string): EntryAssets {
  const css = new Set<string>()
  const preload = new Set<string>()
  const seen = new Set<string>()
  // static imports are preloaded; the css of lazy chunks (routes) is loaded
  // upfront too, so that server-rendered pages are styled before hydration
  const visit = (id: string, kind: 'entry' | 'static' | 'dynamic') => {
    if (seen.has(id)) return
    seen.add(id)
    const chunk = manifest[id]
    if (!chunk) return
    for (const file of chunk.css ?? []) css.add(withBase(base, file))
    if (kind === 'static') preload.add(withBase(base, chunk.file))
    for (const dep of chunk.imports ?? []) visit(dep, kind === 'dynamic' ? 'dynamic' : 'static')
    for (const dep of chunk.dynamicImports ?? []) visit(dep, 'dynamic')
  }
  visit(key, 'entry')
  const chunk = manifest[key]
  return {
    js: chunk ? [withBase(base, chunk.file)] : [],
    css: [...css],
    preload: [...preload],
  }
}
