import type { Dict } from 'cosmokit'
import { satisfies, valid, validRange } from 'semver'

/**
 * What a plugin package tells the market (the `cormi` field of its
 * package.json): which bundlers and UI frameworks it supports, by the names
 * of `ctx.bundler` and `ctx.renderer`, and the services it requires,
 * uses and provides, like koishi's manifest.
 */
export interface Manifest extends Manifest.Compat {
  /** shown by the market; by language, or the description of the package */
  description?: string | Dict<string>
  category?: string
  /** not listed by default */
  preview?: boolean
  hidden?: boolean
  /** the range of Cormi versions (the peer dependency on `@cormijs/cormi`) */
  cormi?: string
  /** declarations of the plugins of a package, by export: `{ './slave': { bundler: ['vite'] } }` */
  exports?: Dict<Manifest.Compat>
  /** how the compatibility is known: declared by the package, inferred from its peer dependencies, or not at all */
  source: 'declared' | 'inferred' | 'unknown'
}

export namespace Manifest {
  export interface Compat {
    /** the bundlers the plugin supports, by `ctx.bundler.name`; any when omitted */
    bundler?: string[]
    /** the UI frameworks the plugin supports, by `ctx.renderer.name`; any when omitted */
    renderer?: string[]
    service?: Service
  }

  export interface Service {
    /** services the plugin waits for */
    required?: string[]
    optional?: string[]
    /** services the plugin provides */
    implements?: string[]
  }
}

/** The fields of a package.json the manifest is made of. */
export interface PackageMeta {
  name: string
  description?: string
  keywords?: string[]
  peerDependencies?: Dict<string>
  peerDependenciesMeta?: Dict<{ optional?: boolean }>
  cormi?: any
}

export type Dimension = 'bundler' | 'renderer'

const DIMENSIONS: Dimension[] = ['bundler', 'renderer']

/** The implementations of the bundler and the UI framework, for packages that declare nothing. */
const IMPLEMENTATIONS: Dict<[Dimension, string]> = {
  '@cormijs/vite': ['bundler', 'vite'],
  '@cormijs/rsbuild': ['bundler', 'rsbuild'],
  '@cormijs/react': ['renderer', 'react'],
  '@cormijs/vue': ['renderer', 'vue'],
}

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined

function toCompat(value: any): Manifest.Compat {
  const compat: Manifest.Compat = {}
  for (const dimension of DIMENSIONS) {
    const names = strings(value?.[dimension])
    // an empty list supports nothing, which no plugin means: it is ignored
    if (names?.length) compat[dimension] = names
  }
  const service = value?.service
  if (service && typeof service === 'object') {
    compat.service = {
      required: strings(service.required),
      optional: strings(service.optional),
      implements: strings(service.implements),
    }
  }
  return compat
}

/**
 * The manifest of a package. The `cormi` field is the declaration; without
 * it, the keywords its tooling writes (`bundler:vite`, `renderer:*`,
 * `required:server`…) are read, as search results of the registry have
 * them; without either, the bundler and the UI framework are inferred
 * from the peer dependencies on their implementations (`@cormijs/react`).
 */
export function conclude(meta: PackageMeta): Manifest {
  const field = meta.cormi && typeof meta.cormi === 'object' ? meta.cormi : undefined
  const manifest: Manifest = {
    description: typeof field?.description === 'string' || (field?.description && typeof field.description === 'object')
      ? field.description
      : meta.description,
    category: typeof field?.category === 'string' ? field.category : undefined,
    preview: field?.preview === true || undefined,
    hidden: field?.hidden === true || undefined,
    cormi: meta.peerDependencies?.['@cormijs/cormi'],
    source: 'unknown',
  }
  if (field) {
    Object.assign(manifest, toCompat(field))
    if (field.exports && typeof field.exports === 'object') {
      manifest.exports = Object.fromEntries(Object.entries(field.exports).map(([key, value]) => [key, toCompat(value)]))
    }
    manifest.source = 'declared'
    return manifest
  }

  const service: Required<Manifest.Service> = { required: [], optional: [], implements: [] }
  const declared = new Set<Dimension>()
  for (const keyword of meta.keywords ?? []) {
    const [key, value] = keyword.split(':', 2)
    if (value === undefined) continue
    if (key === 'bundler' || key === 'renderer') {
      declared.add(key)
      if (value !== '*') manifest[key] = [...manifest[key] ?? [], value]
    } else if (key === 'required') {
      service.required.push(value)
    } else if (key === 'optional') {
      service.optional.push(value)
    } else if (key === 'impl') {
      service.implements.push(value)
    } else if (keyword === 'market:hidden') {
      manifest.hidden = true
    } else if (keyword === 'market:preview') {
      manifest.preview = true
    }
  }
  if (service.required.length || service.optional.length || service.implements.length) manifest.service = service
  if (declared.size) {
    manifest.source = 'declared'
    return manifest
  }

  for (const [name, range] of Object.entries(meta.peerDependencies ?? {})) {
    const implementation = IMPLEMENTATIONS[name]
    if (!implementation || !range || meta.peerDependenciesMeta?.[name]?.optional) continue
    const [dimension, value] = implementation
    manifest[dimension] = [...manifest[dimension] ?? [], value]
    manifest.source = 'inferred'
  }
  return manifest
}

/** The declaration of one plugin of a package: its export (`./slave`) overrides the package's. */
export function forExport(manifest: Manifest, subpath = '.'): Manifest {
  const entry = manifest.exports?.[subpath]
  if (!entry) return manifest
  return { ...manifest, ...entry, service: entry.service ?? manifest.service }
}

/** What a package provides of the stack: `{ bundler: 'rsbuild' }` for one that implements `bundler` and supports `rsbuild` only. */
export function providedStack(manifest: Manifest.Compat): Partial<Record<Dimension, string>> {
  const provided: Partial<Record<Dimension, string>> = {}
  for (const dimension of DIMENSIONS) {
    const names = manifest[dimension]
    if (manifest.service?.implements?.includes(dimension) && names?.length === 1) provided[dimension] = names[0]
  }
  return provided
}

/** The keywords that mirror the manifest, for the search results of the registry. */
export function manifestKeywords(manifest: Manifest): string[] {
  return [
    ...DIMENSIONS.flatMap(dimension => (manifest[dimension] ?? ['*']).map(name => `${dimension}:${name}`)),
    ...(manifest.service?.required ?? []).map(name => `required:${name}`),
    ...(manifest.service?.optional ?? []).map(name => `optional:${name}`),
    ...(manifest.service?.implements ?? []).map(name => `impl:${name}`),
    ...manifest.hidden ? ['market:hidden'] : [],
    ...manifest.preview ? ['market:preview'] : [],
  ]
}

/** The bundler and the UI framework of an app, by name, and its version of Cormi. */
export interface Stack {
  bundler?: string
  renderer?: string
  cormi?: string
}

export interface CompatReason {
  dimension: Dimension | 'cormi'
  /** the names (or the range of versions) the plugin supports */
  supported: string[]
  /** the app's */
  current: string
}

export interface CompatResult {
  status: 'ok' | 'incompatible' | 'unknown'
  reasons: CompatReason[]
  /** the compatibility is inferred from peer dependencies, not declared */
  inferred: boolean
}

/**
 * Whether a plugin works in an app. A dimension the app does not have yet
 * (no bundler) is not judged, nor one the package provides: `@cormijs/rsbuild`
 * (`implements: ['bundler']`, `bundler: ['rsbuild']`) replaces the bundler.
 */
export function checkCompat(manifest: Manifest, stack: Stack): CompatResult {
  const reasons: CompatReason[] = []
  for (const dimension of DIMENSIONS) {
    const supported = manifest[dimension]
    const current = stack[dimension]
    if (manifest.service?.implements?.includes(dimension)) continue
    if (supported && current && !supported.includes(current)) reasons.push({ dimension, supported, current })
  }
  // ranges such as `workspace:*` are not versions to compare
  const range = manifest.cormi
  if (range && validRange(range) && stack.cormi && valid(stack.cormi) && !satisfies(stack.cormi, range, { includePrerelease: true })) {
    reasons.push({ dimension: 'cormi', supported: [range], current: stack.cormi })
  }
  return {
    status: reasons.length ? 'incompatible' : manifest.source === 'unknown' ? 'unknown' : 'ok',
    reasons,
    inferred: manifest.source === 'inferred',
  }
}

/** The index of the Cormi registry (cormijs/registry): the plugins on npm, synced daily. */
export interface RegistryIndex {
  version: 1
  /** when the index was synced */
  time: string
  objects: RegistryObject[]
}

/** A plugin package of the registry index, at its latest version. */
export interface RegistryObject {
  name: string
  version: string
  description?: string
  keywords: string[]
  /** when this version was published */
  date: string
  links: { npm: string; homepage?: string; repository?: string }
  manifest: Manifest
  /** published by the Cormi project (`@cormijs/*`) */
  official: boolean
  /** a package of the cordis ecosystem that the registry lists, with a manifest of its own, e.g. a driver of minato */
  external?: boolean
  downloads?: { lastMonth: number }
  /** the result of `cormi plugin check` on this version */
  verified?: {
    time: string
    /** the declaration the check infers */
    compat: Manifest.Compat & { exports?: Record<string, Manifest.Compat> }
    /** the package declares the same */
    matches: boolean
  }
  /** why the registry could not check it */
  checkError?: string
}
