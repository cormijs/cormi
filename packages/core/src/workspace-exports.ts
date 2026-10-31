// Shared by the workspace service and the module resolution hook, which runs
// in a thread of its own: no dependencies besides node builtins.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** What resolution needs to know of a workspace package. */
export interface WorkspaceTarget {
  name: string
  /** absolute directory of the package */
  dir: string
  /** the `exports` of its package.json */
  exports?: unknown
  main?: string
}

/** `@scope/name/sub` -> `@scope/name`, `name/sub` -> `name`; undefined for relative and absolute specifiers. */
export function getPackageName(specifier: string) {
  if (/^[./]|^[a-z]+:/i.test(specifier)) return
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function pickTarget(value: unknown, conditions: string[]): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = pickTarget(item, conditions)
      if (target) return target
    }
    return
  }
  if (!value || typeof value !== 'object') return
  // by the order of `conditions` rather than of the keys, so `source` wins wherever it is
  for (const key of [...conditions, 'default']) {
    if (!(key in value)) continue
    const target = pickTarget((value as Record<string, unknown>)[key], conditions)
    if (target) return target
  }
}

/**
 * The file of `subpath` (`.` or `./client`) in a workspace package. The
 * `source` condition wins, so packages run from their sources without a build.
 */
export function resolveExport(target: WorkspaceTarget, subpath: string, conditions: string[]) {
  const preferred = ['source', ...conditions]
  const exports = target.exports
  let entry: string | undefined
  if (exports && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some(key => key.startsWith('.'))) {
    const map = exports as Record<string, unknown>
    if (subpath in map) {
      entry = pickTarget(map[subpath], preferred)
    } else {
      // pattern exports: `./*`
      for (const [key, value] of Object.entries(map)) {
        if (!key.includes('*')) continue
        const [prefix, suffix] = key.split('*')
        if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue
        const matched = subpath.slice(prefix.length, subpath.length - suffix.length)
        entry = pickTarget(value, preferred)?.replace('*', matched)
        break
      }
    }
  } else if (exports !== undefined && subpath === '.') {
    entry = pickTarget(exports, preferred)
  }
  if (!entry && subpath === '.') {
    entry = ['src/index.ts', 'src/index.tsx'].find(file => existsSync(join(target.dir, file))) ?? target.main
  }
  if (!entry && subpath !== '.') {
    // packages without `exports`: a subpath is a path in the package
    const base = join(target.dir, subpath)
    const file = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => base + ext).find(file => existsSync(file))
    return file
  }
  if (!entry) return
  return join(target.dir, entry)
}

/** Resolve a specifier to a file of a workspace package, or undefined if it is not one. */
export function resolveWorkspace(packages: Record<string, WorkspaceTarget>, specifier: string, conditions: string[]) {
  const name = getPackageName(specifier)
  const target = name && packages[name]
  if (!target) return
  return resolveExport(target, '.' + specifier.slice(name.length), conditions)
}
