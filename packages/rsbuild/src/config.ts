import type { EntryAssets, Workspace } from '@cormi/core'
import type { ManifestData } from '@rsbuild/core'
import type { Dict } from 'cosmokit'

export type { EntryAssets } from '@cormi/core'

/**
 * `{ foo: 'bar' }` matches `foo` and `foo/*` in Rspack too; a trailing `$`
 * matches the exact specifier only, as in Vite. Longer keys win.
 */
export function toAliases(alias: Dict<string>): Dict<string> {
  return Object.fromEntries(Object.entries(alias).sort(([a], [b]) => b.length - a.length))
}

/**
 * Exact aliases of the modules the workspace packages export, to their
 * sources (`source` condition), for browsers or Node.
 */
export function getWorkspaceAliases(workspace: Workspace | undefined, conditions: string[]): Dict<string> {
  const aliases: Dict<string> = {}
  for (const pkg of Object.values(workspace?.packages ?? {})) {
    const subpaths = pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) && Object.keys(pkg.exports).some(key => key.startsWith('.'))
      ? Object.keys(pkg.exports)
      : ['.']
    for (const subpath of subpaths) {
      if (subpath.includes('*') || subpath === './package.json') continue
      const specifier = pkg.name + subpath.slice(1)
      const file = workspace!.resolve(specifier, conditions)
      if (file) aliases[`${specifier}$`] = file
    }
  }
  return aliases
}

/** umi's `{ chrome: 87 }` or targets like `chrome87`, as browserslist queries. */
export function toBrowserslist(targets: string[] | Record<string, number | string | false> | undefined) {
  if (!targets) return
  const list = Array.isArray(targets)
    ? targets.map(target => target.replace(/^([a-z_]+)(\d[\d.]*)$/i, '$1 >= $2'))
    : Object.entries(targets).filter(([, version]) => version !== false).map(([browser, version]) => `${browser} >= ${version}`)
  // esbuild's `es2020` is not a browser
  const queries = list.filter(query => !/^es(\d+|next)$/i.test(query))
  return queries.length ? queries : undefined
}

/**
 * The assets of an entry from Rsbuild's manifest: its initial chunks, and
 * the css of its lazy chunks (routes), so that server-rendered pages are
 * styled before hydration.
 */
export function getEntryAssets(manifest: ManifestData | undefined, name: string, base: string): EntryAssets {
  const entry = manifest?.entries[name]
  // with `assetPrefix: 'auto'` (chunks resolved from the script, e.g. for module federation) the files are relative
  const url = (file: string) => /^(\/|[a-z][a-z\d+.-]*:)/i.test(file) ? file : `${base.endsWith('/') ? base : base + '/'}${file}`
  return {
    js: (entry?.initial?.js ?? []).map(url),
    css: [...entry?.initial?.css ?? [], ...entry?.async?.css ?? []].map(url),
    preload: [],
  }
}
