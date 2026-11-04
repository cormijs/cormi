import { dirname, relative, resolve, sep } from 'node:path'
import type { Cormi } from './cormi.ts'
import { winPath } from './utils/index.ts'

function isInside(dir: string, file: string) {
  return file.startsWith(dir + sep)
}

/**
 * The pages (`src/`) and the server code (`server/`) meet through HTTP, the
 * `context` of loaders and types only. A module of the pages that imports a
 * value of `server/` would bundle the server code into the pages, with a
 * copy of its state that the server never sees.
 *
 * Returns the error to report when `importer` imports `specifier` across
 * that line. Type imports are gone before bundlers resolve modules.
 */
export function checkServerImport(paths: Cormi.Paths, importer: string | undefined, specifier: string) {
  if (!importer || !specifier.startsWith('.')) return
  // `App.vue?vue&type=script`
  const from = resolve(importer.replace(/\?.*$/, ''))
  const file = resolve(dirname(from), specifier.replace(/\?.*$/, ''))
  if (!isInside(paths.server, file) || isInside(paths.server, from)) return
  const name = (path: string) => winPath(relative(paths.cwd, path))
  return `${name(from)} imports ${name(file)}, but the code in server/ runs in Node and is not bundled into the pages: `
    + 'import its types only (`import type`), call its API with fetch, or use its services in a loader through `context.ctx`'
}
