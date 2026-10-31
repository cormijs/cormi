import { loadRemote, registerRemotes } from '@module-federation/runtime'
import { Service } from 'cordis'
import { type Context, matchRoutes, type RouteData, type RouteModules } from 'cormi/client'
import { OVERRIDE_KEY } from './index.tsx'

declare module 'cordis' {
  interface Context {
    $federation: Federation
  }

  interface Events {
    /**
     * A package was loaded: its runtime plugins are applied. Browser only.
     * @mode emit
     * @param name name of the package
     * @param ctx context of the package
     */
    'federation/load'(name: string, ctx: Context): void
  }
}

export interface ClientConfig {
  /** URL of the list of packages */
  registry: string
  /** id of the route the top routes of packages are mounted below */
  parent?: string
  /** read `localStorage['cormi:packages']` */
  override: boolean
}

export interface PackageEntry {
  url: string
  eager?: boolean
}

/** The manifest of a package (`federation.json`). */
export interface Manifest {
  name: string
  package?: string
  version?: string
  entry: string
  eager?: boolean
  routes: RouteData[]
}

/** The module a package exposes as `./plugin`. */
interface PackageModule {
  routeModules: RouteModules
  apply(ctx: Context): Promise<void>
}

export interface Package {
  name: string
  /** URL of the package's manifest */
  url: string
  manifest: Manifest
  eager: boolean
  /** set once the package is loaded */
  ctx?: Context
  /** @internal */
  _task?: Promise<Context>
}

const MANIFEST_FILE = 'federation.json'

function toEntry(value: string | PackageEntry): PackageEntry {
  return typeof value === 'string' ? { url: value } : value
}

/**
 * The packages of the app in the browser (`ctx.$federation`). Every package
 * is a cordis plugin of the host: loading it applies its runtime plugins in
 * a fiber of its own, below this one.
 */
export class Federation extends Service {
  /** the packages by name */
  packages = new Map<string, Package>()

  // the context of this plugin: `this.ctx` is the caller's in methods
  private _ctx: Context
  private _modules = new Map<string, PackageModule>()

  constructor(ctx: Context, public config: ClientConfig) {
    super(ctx, '$federation')
    this._ctx = ctx
  }

  /** Load a package (once): its route modules and runtime plugins. Resolves with the context of the package. */
  load(name: string): Promise<Context> {
    const pkg = this.packages.get(name)
    if (!pkg) return Promise.reject(new Error(`package ${name} is not found`))
    if (!pkg._task) {
      pkg._task = (async () => {
        const module = await loadRemote<PackageModule>(`${name}/plugin`)
        if (!module) throw new Error(`cannot load package ${name}`)
        this._modules.set(name, module)
        const fiber = this._ctx.plugin({ name: `federation:${name}`, apply: module.apply })
        await fiber
        pkg.ctx = fiber.ctx as Context
        this._ctx.emit('federation/load', name, pkg.ctx)
        return pkg.ctx
      })()
      // a failed load is tried again next time
      pkg._task.catch(() => pkg._task = undefined)
    }
    return pkg._task
  }

  /**
   * Import a module of a package: `<name>/<expose>`, e.g. `orders/OrderCard`.
   * The package is loaded first, so the module finds its runtime plugins.
   */
  async import<T = any>(id: string): Promise<T> {
    const name = [...this.packages.keys()].find(name => id.startsWith(name + '/'))
    if (name) await this.load(name)
    const module = await loadRemote<T>(id)
    if (!module) throw new Error(`cannot load ${id}`)
    return module
  }

  /** @internal Read the list of packages and their manifests; mount their routes and load the eager ones. */
  async _start() {
    const entries = [...await this._fetchRegistry(), ...this._readOverrides()]
    const results = await Promise.allSettled(entries.map(entry => this._fetchManifest(entry)))
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        this._ctx.logger('federation').error('cannot read the manifest of %s', entries[index].url, result.reason)
        continue
      }
      // later entries (overrides) replace packages of the same name
      this.packages.set(result.value.name, result.value)
    }
    registerRemotes([...this.packages.values()].map(pkg => ({
      name: pkg.name,
      entry: new URL(pkg.manifest.entry, pkg.url).href,
      type: 'module',
    })), { force: true })

    const { $router } = this._ctx
    const parent = this.config.parent ?? Object.values($router.routes).find(route => route.isLayout && !route.parentId)?.id
    for (const pkg of this.packages.values()) {
      const modules: RouteModules = {}
      for (const route of pkg.manifest.routes) {
        modules[route.id] = async () => {
          await this.load(pkg.name)
          const load = this._modules.get(pkg.name)!.routeModules[route.id]
          return load ? load() : {}
        }
      }
      $router.add(pkg.manifest.routes.map(route => route.parentId ? route : { ...route, parentId: parent }), modules)
    }

    const eager = [...this.packages.values()].filter(pkg => pkg.eager)
    for (const [index, result] of (await Promise.allSettled(eager.map(pkg => this.load(pkg.name)))).entries()) {
      if (result.status === 'rejected') this._ctx.logger('federation').error('cannot load package %s', eager[index].name, result.reason)
    }

    // the server does not know the routes of packages: render their pages here instead of hydrating its 404
    const hydration = window.__staticRouterHydrationData
    if (hydration?.errors) {
      const matches = matchRoutes($router.createRoutes('client'), window.location.pathname, $router.basename)
      const leaf = matches?.[matches.length - 1]?.route.id
      if (leaf && [...this.packages.keys()].some(name => leaf.startsWith(name + '/'))) {
        window.__staticRouterHydrationData = undefined
      }
    }
  }

  private async _fetchRegistry(): Promise<PackageEntry[]> {
    try {
      const response = await fetch(this.config.registry, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return (await response.json() as (string | PackageEntry)[]).map(toEntry)
    } catch (error) {
      this._ctx.logger('federation').error('cannot read the packages at %s', this.config.registry, error)
      return []
    }
  }

  private _readOverrides(): PackageEntry[] {
    if (!this.config.override) return []
    try {
      const value = JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '[]')
      return (Array.isArray(value) ? value : [value]).map(toEntry)
    } catch {
      return []
    }
  }

  private async _fetchManifest(entry: PackageEntry): Promise<Package> {
    // a package URL is a directory: the manifest is in it
    const url = new URL(MANIFEST_FILE, new URL(entry.url.replace(/\/?$/, '/'), window.location.href)).href
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const manifest: Manifest = await response.json()
    return { name: manifest.name, url, manifest, eager: entry.eager ?? manifest.eager ?? false }
  }
}

/**
 * The host of a federated app in the browser. The app mounts once the
 * manifests are read and the eager packages are loaded; packages run in the
 * browser only.
 */
export default async (ctx: Context, config: ClientConfig) => {
  if (typeof window === 'undefined') return
  const federation = new Federation(ctx, config)
  await federation._start()
}
