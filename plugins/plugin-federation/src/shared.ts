import type { Shared } from '@cormi/plugin-mf'
import { type Context, resolvePackageDir, type Route } from 'cormi'
import type { RouteData } from 'cormi/client'

/** The host loads the packages listed in this file of its build. */
export const REGISTRY_FILE = 'packages.json'

/** The remote entry of a container. */
export const REMOTE_ENTRY = 'remoteEntry.js'

/** Each package describes itself in this file, next to its remote entry. */
export const MANIFEST_FILE = 'federation.json'

/** The manifest of a package (`federation.json`). */
export interface Manifest {
  /** name of the package's container: the host imports its modules as `<name>/<expose>` */
  name: string
  /** name in package.json */
  package?: string
  version?: string
  /** URL of the remote entry, relative to the manifest */
  entry: string
  /** load the package with the app, instead of when one of its routes is visited */
  eager?: boolean
  /** the routes of the package, mounted by the host; ids start with `<name>/` */
  routes: RouteData[]
}

/**
 * Modules of one instance for the page: the host's, which every package
 * uses. The framework is among them, so packages run in the host's context
 * and render in its router.
 */
export const SINGLETONS = ['react', 'react-dom', 'react-router', 'cordis', 'cormi/client']

export function getShared(extra: string[]): Record<string, Shared> {
  return Object.fromEntries([...new Set([...SINGLETONS, ...extra])].map(name => [name, { singleton: true }]))
}

/** `cormi/client` -> `cormi`, `@scope/name/sub` -> `@scope/name` */
function getPackageName(specifier: string) {
  return specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
}

/**
 * Shared modules are the packages the app resolves: with pnpm, a package
 * the app only has through another one (e.g. react-router through cormi) is
 * neither shared reliably nor pre-bundled by the dev server.
 */
export function checkShared(ctx: Context, shared: Record<string, Shared>) {
  const missing = [...new Set(Object.keys(shared).map(getPackageName))].filter(name => !resolvePackageDir(name, ctx.cormi.cwd))
  if (!missing.length) return
  ctx.logger('federation').warn('add %s to the dependencies of the app: the shared modules are resolved from the app', missing.join(', '))
}

/** A container name from a package name: `@acme/orders` -> `acme_orders`. */
export function toContainerName(name: string) {
  return name.replace(/^@/, '').replace(/[^\w$]/g, '_')
}

/**
 * The routes of a package as the host mounts them. Top layouts are the
 * package's own frame when it runs by itself, and its 404 page would catch
 * every path of the host: both are left out. Top routes get absolute paths;
 * ids are prefixed with the container name.
 */
export function toManifestRoutes(routes: Record<string, Route>, name: string, onLoader: (route: Route) => void): RouteData[] {
  const layouts = new Set(Object.values(routes).filter(route => route.isLayout && !route.parentId).map(route => route.id))
  const result: RouteData[] = []
  for (const route of Object.values(routes)) {
    if (layouts.has(route.id)) continue
    const top = !route.parentId || layouts.has(route.parentId)
    if (top && route.path === '*') continue
    if (route.exports?.includes('loader')) onLoader(route)
    const meta = { ...route.meta }
    for (const key of ['name', 'icon', 'hideInMenu']) {
      if (route[key] !== undefined) meta[key] = route[key]
    }
    result.push({
      id: `${name}/${route.id}`,
      path: top ? route.absPath ?? `/${route.path ?? ''}`.replace(/^\/+/, '/') : route.path,
      index: !top && route.index || undefined,
      parentId: top ? undefined : `${name}/${route.parentId}`,
      isLayout: route.isLayout || undefined,
      hasClientLoader: route.exports?.includes('clientLoader') || undefined,
      meta: Object.keys(meta).length ? meta : undefined,
    })
  }
  return result
}
