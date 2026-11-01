import { extname } from 'node:path'
import { winPath } from '../utils/path.ts'

export function createRouteId(file: string) {
  return winPath(stripFileExtension(file))
}

export function stripFileExtension(file: string) {
  return file.replace(/\.[a-z0-9]+$/i, '')
}

export function byLongestFirst(a: string, b: string): number {
  return b.length - a.length
}

/** Extensions of route modules that every app has; UI frameworks add theirs (`.tsx`, `.vue`). */
export const SCRIPT_EXTENSIONS = ['.ts', '.js']

export function isRouteModuleFile(opts: { file: string; exclude?: RegExp[]; extensions?: string[] }) {
  for (const excludeRegExp of opts.exclude || []) {
    if (opts.file && excludeRegExp instanceof RegExp && excludeRegExp.test(opts.file)) {
      return false
    }
  }
  return (opts.extensions ?? SCRIPT_EXTENSIONS).includes(extname(opts.file))
}
