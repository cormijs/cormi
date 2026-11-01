import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Entry, EntryGroup, EntryTree } from '@cordisjs/plugin-loader'
import { checkCompat, type CompatResult, conclude, type Dimension, forExport, getPackageName, type Manifest, providedStack, readJSON, type RegistryIndex, type RegistryObject, resolvePackageDir, type Stack, winPath } from '@cormijs/core'
import type {} from '@cormijs/rsbuild'
import type {} from '@cormijs/vite'
import { type Context, type Fiber, Logger, type Message } from 'cordis'
import { compare, prerelease, rcompare, valid } from 'semver'
import { type Console, getServerUrl } from './index.ts'

const STATES = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading'] as const

/** A plugin of `cormi.yml`, as the console shows it. */
export interface PluginInfo {
  id: string
  name: string
  /** depth in groups */
  depth: number
  group: boolean
  disabled: boolean
  state: typeof STATES[number] | 'disabled'
  /** the config as written, with `{ __jsExpr }` for expressions */
  config: unknown
  /** the serialized `Config` schema, once the plugin has loaded */
  schema?: unknown
  package?: { name: string; version?: string; description?: string; local?: boolean }
  /** what its package declares, and whether it works in this app */
  compat?: CompatInfo
  /** what the plugin and its sub-plugins registered: effect labels */
  effects: string[]
  inject: string[]
  provides: string[]
}

export interface RouteInfo {
  id: string
  path?: string
  parentId?: string
  file?: string
  isLayout?: boolean
  exports?: string[]
  meta?: Record<string, any>
}

export interface ServiceInfo {
  name: string
  provider: string
  dependents: string[]
}

export interface LogRecord {
  sn: number
  ts: number
  type: string
  name: string
  text: string
}

export interface PackageInfo {
  name: string
  version?: string
  description?: string
  path: string
  enabled: boolean
  compat?: CompatInfo
}

export interface MarketPackage {
  name: string
  version: string
  description?: string
  date?: string
  links?: { npm?: string; homepage?: string; repository?: string }
  installed?: string
  /** from the manifest of the index, or the keywords of a search result */
  compat: CompatInfo
  /** published by the Cormi project */
  official?: boolean
  downloads?: number
  /** the registry checked it: whether it declares what the check infers */
  verified?: 'matches' | 'differs'
}

/** The index of the market: cormijs/registry, synced daily from npm. */
export const MARKET_INDEX = 'https://cdn.jsdelivr.net/gh/cormijs/registry@dist/index.json'

/** A package of the registry, resolved for the app: its latest version, and the newest one that works if that does not. */
export interface MarketResolution {
  latest: string
  compat: CompatInfo
  compatible?: { version: string; compat: CompatInfo }
}

/** What a package declares about the stacks it supports, and whether it works in this app. */
export interface CompatInfo {
  bundler?: string[]
  renderer?: string[]
  /** services it provides: a bundler or a UI framework is `bundler` or `renderer` */
  implements?: string[]
  /** the part of the stack it provides: `{ bundler: 'rsbuild' }` */
  provides: Partial<Record<Dimension, string>>
  source: Manifest['source']
  result: CompatResult
}

/** The bundler, the UI framework and the Cormi version of the app. */
export function getStack(ctx: Context): Stack {
  return { bundler: ctx.get('bundler')?.name, renderer: ctx.get('renderer')?.name, cormi: version(ctx.cormi.cwd, 'cormi') }
}

export function toCompat(manifest: Manifest, stack: Stack): CompatInfo {
  return {
    bundler: manifest.bundler,
    renderer: manifest.renderer,
    implements: manifest.service?.implements,
    provides: providedStack(manifest),
    source: manifest.source,
    result: checkCompat(manifest, stack),
  }
}

/** The entries of cormi.yml: the tree of the include plugin. */
function getTree(ctx: Context): EntryTree | undefined {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'cordis:include') return entry.subtree
  }
}

function getFiberEffects(fiber: Fiber, fibers: Fiber[]): string[] {
  const own = fiber.getEffects().map(effect => effect.label).filter(label => label !== 'ctx.plugin()' && !label.startsWith('ctx.inject('))
  // `entry.fiber` may be the thenable wrapper of `ctx.plugin()`: compare ids
  const children = fibers.filter(child => child.parent.fiber.uid === fiber.uid)
  return [...own, ...children.flatMap(child => getFiberEffects(child, fibers))]
}

function allFibers(ctx: Context): Fiber[] {
  return [...ctx.registry.values()].flatMap(runtime => [...runtime.fibers]) as Fiber[]
}

/** The workspace packages: `ctx.workspace` is a root service that child plugins read with `get()`. */
function localPackages(ctx: Context) {
  return ctx.get('workspace')?.packages ?? {}
}

/** The package of a plugin of cormi.yml (`@scope/plugin-foo/sub`), and the declaration of that plugin. */
function packageOf(ctx: Context, name: string, stack = getStack(ctx)): Pick<PluginInfo, 'package' | 'compat'> {
  const packageName = getPackageName(name)
  if (!packageName) return {}
  const local = localPackages(ctx)[packageName]
  const dir = local?.dir ?? resolvePackageDir(packageName, ctx.cormi.cwd)
  const meta = dir && readJSON(join(dir, 'package.json'))
  if (!meta) return {}
  const manifest = forExport(conclude(meta), `.${name.slice(packageName.length)}`)
  return {
    package: { name: packageName, version: meta.version, description: meta.description, local: local ? true : undefined },
    compat: toCompat(manifest, stack),
  }
}

export function getPlugins(ctx: Context): PluginInfo[] {
  const tree = getTree(ctx)
  if (!tree) return []
  const fibers = allFibers(ctx)
  const stack = getStack(ctx)
  const result: PluginInfo[] = []
  const walk = (group: EntryGroup, depth: number) => {
    for (const options of group.data) {
      const entry: Entry | undefined = tree.store[options.id]
      const fiber = entry?.fiber
      const disabled = !!options.disabled
      result.push({
        id: options.id,
        name: options.name,
        depth,
        group: !!options.group,
        disabled,
        state: disabled ? 'disabled' : STATES[fiber?.state ?? 0],
        config: options.config ?? {},
        schema: (fiber?.runtime?.Config as { toJSON?(): unknown } | undefined)?.toJSON?.(),
        ...packageOf(ctx, options.name, stack),
        effects: fiber ? getFiberEffects(fiber, fibers) : [],
        inject: fiber ? Object.keys(fiber.inject) : [],
        provides: fiber ? [...fiber.provisions].map(impl => impl.name) : [],
      })
      if (entry?.subgroup) walk(entry.subgroup, depth + 1)
    }
  }
  walk(tree.root, 0)
  return result
}

export function getServices(ctx: Context): ServiceInfo[] {
  const store = ctx.reflect.store as Record<symbol, any>
  const describe = (fiber: Fiber) => fiber.entry?.options.name ?? fiber.name ?? 'root'
  return Reflect.ownKeys(store).map((key) => {
    const impl = store[key as symbol]
    return {
      name: impl.name as string,
      provider: describe(impl.ctx.fiber),
      dependents: [...impl.dependents as Set<Fiber>].map(describe),
    }
  }).filter(service => !service.name.startsWith('$')).sort((a, b) => a.name.localeCompare(b.name))
}

function version(cwd: string, name: string) {
  const dir = resolvePackageDir(name, cwd)
  return dir ? readJSON(join(dir, 'package.json'))?.version : undefined
}

/** The package manager of the app: from its lock file, up to the workspace root. */
export function detectPackageManager(cwd: string) {
  const locks: [string, string][] = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun'], ['package-lock.json', 'npm']]
  let dir = cwd
  while (true) {
    for (const [file, manager] of locks) {
      if (existsSync(join(dir, file))) return manager
    }
    const parent = dirname(dir)
    if (parent === dir) return 'npm'
    dir = parent
  }
}

/** The data and methods of the console's built-in pages. */
export function Builtin(ctx: Context, config: Console.Config) {
  const { cwd } = ctx.cormi
  const app = readJSON(join(cwd, 'package.json')) ?? {}

  const overview = ctx.console.data('overview', () => {
    const bundler = ctx.get('bundler')
    const renderer = ctx.get('renderer')
    return {
      name: app.name ?? 'app',
      cwd,
      mode: ctx.cormi.mode,
      url: getServerUrl(ctx),
      // the bundler and the UI framework of the app, which are plugins too
      stack: {
        bundler: bundler && { name: bundler.name, version: bundler.version },
        renderer: renderer && { name: renderer.name, version: renderer.version },
      },
      versions: {
        cormi: version(cwd, 'cormi'),
        cordis: version(cwd, 'cordis') ?? version(join(cwd, 'node_modules/cormi'), 'cordis'),
        node: process.versions.node,
      },
    }
  })

  // the plugin tree changes with every fiber that loads, fails or unloads
  const plugins = ctx.console.data('plugins', () => getPlugins(ctx))
  const services = ctx.console.data('services', () => getServices(ctx))
  const refreshTree = () => {
    plugins.refresh()
    services.refresh()
    overview.refresh()
  }
  ctx.on('internal/status', refreshTree)
  ctx.on('internal/plugin', refreshTree)
  ctx.on('loader/config-update', refreshTree)

  const appData = ctx.console.data('app', () => ({
    routes: Object.values(ctx.router.routes).map((route): RouteInfo => ({
      id: route.id,
      path: route.path,
      parentId: route.parentId,
      file: route.file && winPath(relative(cwd, route.file)),
      isLayout: route.isLayout,
      exports: route.exports,
      meta: route.meta,
    })),
    entries: [...ctx.app.entries].map(entry => ({ file: /^[./]/.test(entry.file) ? winPath(relative(cwd, entry.file)) : entry.file, config: entry.config })),
    imports: [...ctx.app.imports].map(({ source }) => /^[./]/.test(source) ? winPath(relative(cwd, source)) : source),
    files: ctx.app.files.map(file => winPath(join(relative(cwd, ctx.app.dir), file))),
    servers: [...ctx.app.servers.keys()],
  }))
  ctx.on('router/update', () => appData.refresh())
  ctx.on('app/generate', () => appData.refresh())

  // logs: the recent ones when a client connects, then each as it comes
  const exporter = { colors: false as const, export: () => {} }
  const toRecord = (message: Message): LogRecord => ({
    sn: message.sn,
    ts: message.ts,
    type: message.type,
    name: message.name,
    text: Logger.format(exporter, message),
  })
  ctx.console.data('logs', () => ctx.logger.buffer.map(toRecord))
  ctx.logger.exporter({
    colors: false,
    export: message => ctx.console.broadcast('logs/append', toRecord(message)),
  })

  const workspace = ctx.console.data('workspace', () => {
    const names = new Set(getPlugins(ctx).map(plugin => plugin.name))
    const stack = getStack(ctx)
    return Object.values(localPackages(ctx)).map((pkg): PackageInfo => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      path: pkg.path,
      enabled: names.has(pkg.name),
      compat: toCompat(conclude(readJSON(join(pkg.dir, 'package.json')) ?? { name: pkg.name }), stack),
    }))
  })
  ctx.on('workspace/update', () => workspace.refresh())
  ctx.on('loader/config-update', () => workspace.refresh())

  const write = () => {
    const tree = getTree(ctx)
    if (!tree) throw new Error('cormi.yml is not loaded')
    return tree
  }

  ctx.console.method('plugin/update', async (id: string, options: { config?: unknown; disabled?: boolean }) => {
    await write().update(id, {
      ...'config' in options ? { config: options.config } : {},
      // null removes the key from cormi.yml
      ...'disabled' in options ? { disabled: options.disabled || null } : {},
    })
  })

  ctx.console.method('plugin/create', async (options: { name: string; config?: unknown; disabled?: boolean }) => {
    return write().create({ name: options.name, config: options.config, disabled: options.disabled || null })
  })

  ctx.console.method('plugin/remove', (id: string) => write().remove(id))

  // the schema of a plugin that has not loaded yet comes from its module
  ctx.console.method('plugin/schema', async (name: string) => {
    const exports = await ctx.loader.import(name)
    const plugin = ctx.loader.unwrapExports(exports)
    return plugin?.Config?.toJSON?.()
  })

  // plugins the app could add: its dependencies that are cormi plugins, and the workspace packages
  ctx.console.method('plugin/candidates', () => {
    const dependencies = Object.keys({ ...app.dependencies, ...app.devDependencies })
    const pattern = /^(@cormijs\/plugin-|cormi-plugin-|@[^/]+\/cormi-plugin-)/
    return [
      ...Object.values(localPackages(ctx)).map(pkg => ({ name: pkg.name, description: pkg.description, local: true })),
      ...dependencies.filter(name => pattern.test(name)).map(name => ({ name, description: packageOf(ctx, name).package?.description, local: false })),
    ]
  })

  ctx.console.method('workspace/create', async (options: { name: string; client?: boolean; console?: boolean; enable?: boolean }) => {
    const workspace = ctx.get('workspace')
    if (!workspace) throw new Error('the workspace is not available')
    const pkg = await workspace.create(options.name, { client: options.client, console: options.console })
    if (options.enable) await write().create({ name: pkg.name })
    return pkg.name
  })

  // the plugins of the dev server, as the bundler resolves them: those registered with ctx.bundler.plugin() included
  ctx.console.method('bundler/plugins', async () => {
    const bundler = ctx.get('vite') ?? ctx.get('rsbuild')
    if (!bundler) return []
    const resolved = await bundler.resolveConfig({ command: 'serve' })
    const names: string[] = []
    const visit = async (plugin: any): Promise<void> => {
      plugin = await plugin
      if (Array.isArray(plugin)) {
        for (const item of plugin) await visit(item)
      } else if (plugin?.name) {
        names.push(plugin.name)
      }
    }
    await visit(resolved.plugins)
    return names
  })

  // the registry of the app's package manager, e.g. a mirror, unless the console is given one
  const registry = (config.registry || process.env.npm_config_registry || 'https://registry.npmjs.org').replace(/\/$/, '')

  // the index of the market, read again after some time; the registry is searched without it
  const market = config.market ?? process.env.CORMI_MARKET ?? MARKET_INDEX
  let index: { time: number; data: Promise<RegistryIndex> } | undefined
  const loadIndex = () => {
    if (!index || Date.now() - index.time > 10 * 60 * 1000) {
      index = { time: Date.now(), data: fetch(market).then(response => response.ok ? response.json() : Promise.reject(new Error(`the index answered ${response.status}`))) }
    }
    return index.data
  }
  const fromIndex = (object: RegistryObject, stack: Stack, installed: Record<string, string>): MarketPackage => ({
    name: object.name,
    version: object.version,
    description: object.description,
    date: object.date,
    links: object.links,
    installed: installed[object.name],
    compat: toCompat(object.manifest, stack),
    official: object.official || undefined,
    downloads: object.downloads?.lastMonth,
    verified: object.verified ? object.verified.matches ? 'matches' : 'differs' : undefined,
  })

  ctx.console.method('market/search', async (query: string = '') => {
    const installed: Record<string, string> = { ...app.dependencies, ...app.devDependencies }
    if (market) {
      try {
        const { objects } = await loadIndex()
        const words = query.toLowerCase().split(/\s+/).filter(Boolean)
        const stack = getStack(ctx)
        return objects
          .filter(object => words.every(word => [object.name, object.description ?? '', ...object.keywords].some(text => text.toLowerCase().includes(word))))
          .map(object => fromIndex(object, stack, installed))
      } catch (error) {
        index = undefined
        ctx.logger('market').warn('cannot read the index of the market, searching %s: %s', registry, (error as Error).message)
      }
    }
    const text = ['keywords:cormi-plugin', query].filter(Boolean).join(' ')
    const response = await fetch(`${registry}/-/v1/search?text=${encodeURIComponent(text)}&size=100`)
    if (!response.ok) throw new Error(`the registry answered ${response.status}`)
    const result = await response.json() as { objects: { package: Omit<MarketPackage, 'compat'> & { keywords?: string[] } }[] }
    const stack = getStack(ctx)
    return result.objects.map(({ package: pkg }): MarketPackage => ({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      date: pkg.date,
      links: pkg.links,
      installed: installed[pkg.name],
      // search results have the keywords that mirror the manifest, not the manifest
      compat: toCompat(conclude({ name: pkg.name, description: pkg.description, keywords: pkg.keywords }), stack),
    }))
  })

  // the versions of a package, read when the market needs one that works in the app
  ctx.console.method('market/resolve', async (name: string): Promise<MarketResolution> => {
    const response = await fetch(`${registry}/${name.replace('/', '%2f')}`, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`the registry answered ${response.status}`)
    const doc = await response.json() as { 'dist-tags'?: Record<string, string>; versions: Record<string, any> }
    const stack = getStack(ctx)
    const check = (version: string) => toCompat(conclude(doc.versions[version]), stack)
    const latest = doc['dist-tags']?.latest ?? Object.keys(doc.versions).filter(version => valid(version)).sort(rcompare)[0]
    const compat = check(latest)
    if (compat.result.status !== 'incompatible') return { latest, compat }
    for (const version of Object.keys(doc.versions).filter(version => valid(version) && !prerelease(version)).sort(rcompare)) {
      if (compare(version, latest) >= 0) continue
      const older = check(version)
      if (older.result.status === 'ok') return { latest, compat, compatible: { version, compat: older } }
    }
    return { latest, compat }
  })

  ctx.console.method('market/install', (spec: string) => install(ctx, spec))
}

export namespace Builtin {
  export const inject = ['console', 'loader', 'router', 'app']
}

/** Install a package with the app's package manager; its output goes to the logs. */
function install(ctx: Context, spec: string) {
  if (!/^(@[\w.-]+\/)?[\w.-]+(@[\w.^~<>=|* -]+)?$/.test(spec)) throw new Error(`invalid package: ${spec}`)
  const manager = detectPackageManager(ctx.cormi.cwd)
  const args = manager === 'npm' ? ['install', spec] : ['add', spec]
  const logger = ctx.logger('market')
  logger.info('%s %s', manager, args.join(' '))
  return new Promise<void>((resolve, reject) => {
    const child = spawn(manager, args, { cwd: ctx.cormi.cwd, shell: process.platform === 'win32' })
    let output = ''
    const collect = (data: Buffer) => {
      output += data
      for (const line of data.toString().split('\n')) if (line.trim()) logger.info(line)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`${manager} exited with code ${code}: ${output.trim().split('\n').slice(-3).join(' ')}`))
    })
  })
}
