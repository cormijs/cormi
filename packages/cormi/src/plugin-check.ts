import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  Cli,
  CommandError,
  conclude,
  Cormi,
  type Dimension,
  forExport,
  idle,
  type Manifest,
  manifestKeywords,
  providedStack,
  readJSON,
  resolveExport,
  resolvePackageDir,
  stop,
} from '@cormi/core'
import { Context, Logger, type Message } from 'cordis'
import { resolve } from 'import-meta-resolve'

type Dict<T> = Record<string, T>

// `FiberState` is a const enum in cordis' typings
const PENDING = 0
const ACTIVE = 2

const DIMENSIONS: Dimension[] = ['bundler', 'renderer']

/** Bundlers and UI frameworks known by name, for `inject` of those that are not installed. */
const KNOWN: Record<Dimension, string[]> = { bundler: ['vite', 'rsbuild'], renderer: ['react', 'vue'] }

/** A bundler or a UI framework the plugin package can be checked with: a dependency that provides one. */
interface Implementation {
  dimension: Dimension
  /** `ctx.bundler.name` / `ctx.renderer.name`, the name of its own service too */
  name: string
  package: string
}

/** How a plugin did with one bundler and one UI framework. */
export type Cell =
  | { status: 'ok'; waits?: string[] }
  | { status: 'pending'; missing: string[] }
  | { status: 'failed'; error: string }
  | { status: 'skipped'; reason: string }

export interface ExportReport {
  /** the export of the plugin: `.`, `./slave` */
  subpath: string
  /** by bundler, then UI framework */
  cells: Dict<Dict<Cell>>
  inferred?: Manifest.Compat
  /** why nothing could be inferred */
  error?: string
}

export interface CheckReport {
  name: string
  bundlers: string[]
  renderers: string[]
  exports: ExportReport[]
  /** the declaration the checks lead to: package level, and the exports that differ */
  inferred?: { compat: Manifest.Compat; exports: Dict<Manifest.Compat> }
  /** the subpaths whose declaration differs from the inferred one */
  mismatches: string[]
  /** the keywords do not mirror the declaration */
  keywords: boolean
}

const isMap = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value) && !('name' in value) && !('then' in value)

/** An error on one line, without its stack. */
function toMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).split('\n').map(line => line.trim()).filter(Boolean).join(' ')
}

/** The text of a logged error: its message, without the stack and the class. */
function toLogged(text: string) {
  return text.split('\n').filter(line => !/^\s+at /.test(line)).map(line => line.trim()).filter(Boolean).join(' ').replace(/^\w*Error: /, '')
}

/** The plugin of a module: its namespace with `apply`, or its default export. */
function unwrapPlugin(module: any) {
  const plugin = typeof module?.apply === 'function' ? module : module?.default
  if (typeof plugin === 'function' || typeof plugin?.apply === 'function') return plugin
}

/** The services a plugin requires: `inject` as an array, or the required entries of its object form. */
function requiredServices(plugin: any): string[] {
  const inject = plugin?.inject
  if (Array.isArray(inject)) return inject
  if (inject && typeof inject === 'object') return Object.keys(inject).filter(name => inject[name]?.required !== false)
  return []
}

async function importFrom(specifier: string, dir: string) {
  return import(resolve(specifier, pathToFileURL(join(dir, 'package.json')).href))
}

/** Every resolved plugin of the bundler's config, waiting for the asynchronous ones: their factories run. */
async function flushPlugins(ctx: Context, bundler: string) {
  const service = ctx.get(bundler as any) as any
  if (typeof service?.resolveConfig !== 'function') return
  const config = await service.resolveConfig({ command: 'build' })
  const visit = async (plugin: any): Promise<void> => {
    plugin = await plugin
    if (Array.isArray(plugin)) for (const item of plugin) await visit(item)
  }
  await visit(config.plugins)
}

/** Load the plugin in an app of the preset, a bundler and a UI framework, in setup mode. */
async function runCell(modules: { preset: any; bundler: any; renderer: any }, names: { bundler: string; renderer: string }, plugin: any, config: unknown, stackServices: Set<string>): Promise<Cell & { keys: string[][]; entries: string[] }> {
  const cwd = mkdtempSync(join(tmpdir(), 'cormi-check-'))
  const ctx = new Context()
  const errors: string[] = []
  const exporter = { colors: false as const, export: (message: Message) => message.type === 'error' && errors.push(Logger.format(exporter, message)) }
  ctx.logger.exporter(exporter)
  // eslint-disable-next-line no-new
  new Cormi(ctx, { cwd, mode: 'setup' })
  // eslint-disable-next-line no-new
  new Cli(ctx)
  const keys: string[][] = []
  // the browser modules the plugin registers: specifiers of entries of the app
  const entries: string[] = []
  try {
    await ctx.plugin(modules.preset, {})
    await ctx.plugin(modules.bundler, {})
    await ctx.plugin(modules.renderer, {})
    await idle(ctx)
    // the stack alone: what fails here is the environment, not the plugin
    if (!ctx.get('bundler') || !ctx.get('renderer')) return { status: 'skipped', reason: errors[0] ?? 'the stack does not load', keys, entries }
    try {
      await flushPlugins(ctx, names.bundler)
    } catch (error) {
      return { status: 'skipped', reason: toMessage(error), keys, entries }
    }

    // the bundlers the plugin adds plugins for, from the keys of ctx.bundler.plugin()
    const bundler = ctx.get('bundler') as any
    const register = bundler.plugin
    bundler.plugin = function (this: any, spec: any) {
      if (isMap(spec)) keys.push(Object.keys(spec))
      return register.call(this, spec)
    }
    errors.length = 0
    const before = new Set(ctx.get('app')!.entries)
    const fiber = ctx.plugin(plugin, config)
    await idle(ctx)
    entries.push(...[...ctx.get('app')!.entries].filter(entry => !before.has(entry)).map(entry => entry.file))
    if (fiber.state === ACTIVE) {
      try {
        await flushPlugins(ctx, names.bundler)
      } catch (error) {
        return { status: 'failed', error: toMessage(error).replace(/^\w*Error: /, ''), keys, entries }
      }
      return { status: 'ok', keys, entries }
    }
    if (fiber.state === PENDING) {
      const missing = Object.keys(fiber.inject).filter(name => !ctx.get(name as any))
      // services no check provides (e.g. the server of dev mode) say nothing about the stack
      if (missing.every(name => !stackServices.has(name))) return { status: 'ok', waits: missing, keys, entries }
      return { status: 'pending', missing, keys, entries }
    }
    return { status: 'failed', error: toLogged(errors[0] ?? 'failed to load'), keys, entries }
  } finally {
    await stop(ctx)
    rmSync(cwd, { recursive: true, force: true })
  }
}

/** The bundlers (or UI frameworks) a plugin supports, from its cells; `undefined` for any. */
function inferDimension(dimension: Dimension, export_: { cells: Dict<Dict<Cell>>; inject: string[]; keys: string[][] }, tested: { bundler: string[]; renderer: string[] }): string[] | undefined | null {
  const injected = export_.inject.filter(name => KNOWN[dimension].includes(name) || tested[dimension].includes(name))
  if (injected.length) return injected
  if (dimension === 'bundler' && export_.keys.length) {
    // every map of the plugin must have the bundler
    return export_.keys.reduce((common, keys) => common.filter(key => keys.includes(key)))
  }
  const ok = tested[dimension].filter(name => Object.entries(export_.cells).some(([bundler, row]) => Object.entries(row).some(([renderer, cell]) => {
    return cell.status === 'ok' && (dimension === 'bundler' ? bundler : renderer) === name
  })))
  if (!ok.length) return null
  return ok.length === tested[dimension].length ? undefined : ok
}

/** Whether two lists of a dimension are the same; `undefined` (any) is only the same as itself. */
function sameCompat(a?: string[], b?: string[]) {
  if (!a || !b) return a === b
  return a.slice().sort().join() === b.slice().sort().join()
}

/**
 * Check a plugin package (`dir`) with every bundler and UI framework it can
 * be loaded with, and infer what it supports.
 */
export async function checkPlugin(dir: string): Promise<CheckReport> {
  const pkg = readJSON(join(dir, 'package.json'))
  if (!pkg?.name) throw new CommandError('run cormi plugin check in a plugin package: no package.json with a name here')

  // the dependencies of the package, and those of the app around it for a workspace plugin (`plugins/*`)
  let parent = dirname(dir)
  while (parent !== dirname(parent) && !existsSync(join(parent, 'package.json'))) parent = dirname(parent)
  const app = parent !== dirname(parent) ? readJSON(join(parent, 'package.json')) : undefined
  const candidates = { ...app?.dependencies, ...app?.devDependencies, ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  const implementations: Implementation[] = []
  for (const name of Object.keys(candidates)) {
    const depDir = resolvePackageDir(name, dir)
    const meta = depDir && readJSON(join(depDir, 'package.json'))
    if (!meta) continue
    const provided = Object.entries(providedStack(conclude(meta))) as [Dimension, string][]
    // presets provide both: the check composes the stack itself
    if (provided.length === 1) implementations.push({ dimension: provided[0][0], name: provided[0][1], package: name })
  }
  const bundlers = implementations.filter(item => item.dimension === 'bundler')
  const renderers = implementations.filter(item => item.dimension === 'renderer')
  if (!resolvePackageDir('@cormi/preset', dir) || !bundlers.length || !renderers.length) {
    throw new CommandError('the check loads the plugin in apps: add @cormi/preset, a bundler (@cormi/vite, @cormi/rsbuild) and a UI framework (@cormi/react, @cormi/vue) to the devDependencies')
  }
  const preset = unwrapPlugin(await importFrom('@cormi/preset', dir))
  const modules: Dict<any> = {}
  for (const item of implementations) modules[item.name] = unwrapPlugin(await importFrom(item.package, dir))
  const stackServices = new Set(['bundler', 'renderer', ...KNOWN.bundler, ...KNOWN.renderer, ...implementations.map(item => item.name)])

  // the plugins of the package: its exports that are node modules of cordis plugins
  const target = { name: pkg.name, dir, exports: pkg.exports, main: pkg.main }
  const subpaths = pkg.exports && typeof pkg.exports === 'object' && Object.keys(pkg.exports).some(key => key.startsWith('.'))
    ? Object.keys(pkg.exports).filter(key => key !== './package.json' && !key.includes('*'))
    : ['.']
  const configs: Dict<unknown> = pkg.cormi?.check ?? {}
  const tested = { bundler: [] as string[], renderer: [] as string[] }
  const checked: (ExportReport & { inject: string[]; keys: string[][] })[] = []
  // browser plugins have the shape of node plugins: those the node plugins register, and
  // `client` and `console` by convention, are not checked
  const browser = new Set<string>()
  const isBrowser = (subpath: string) => browser.has(subpath) || /(^|\/)(client|console)$/.test(subpath)
  // the main plugin first: the browser modules it registers are known before they are reached
  for (const subpath of subpaths.slice().sort((a, b) => Number(a !== '.') - Number(b !== '.'))) {
    if (isBrowser(subpath)) continue
    const file = resolveExport(target, subpath, ['node', 'import', 'default'])
    if (!file || !/\.[cm]?[jt]s$/.test(file)) continue
    let plugin: any
    try {
      plugin = unwrapPlugin(await import(pathToFileURL(file).href))
    } catch {
      // browser modules of the package do not load in Node
      continue
    }
    if (!plugin) continue
    const item = { subpath, cells: {} as Dict<Dict<Cell>>, inject: requiredServices(plugin), keys: [] as string[][] }
    for (const bundler of bundlers) {
      for (const renderer of renderers) {
        const { keys, entries, ...cell } = await runCell(
          { preset, bundler: modules[bundler.name], renderer: modules[renderer.name] },
          { bundler: bundler.name, renderer: renderer.name },
          plugin,
          configs[subpath] ?? {},
          stackServices,
        )
        ;(item.cells[bundler.name] ??= {})[renderer.name] = cell
        item.keys.push(...keys)
        for (const file of entries) {
          if (file.startsWith(`${pkg.name}/`)) browser.add(`.${file.slice(pkg.name.length)}`)
        }
        if (cell.status === 'skipped') continue
        if (!tested.bundler.includes(bundler.name)) tested.bundler.push(bundler.name)
        if (!tested.renderer.includes(renderer.name)) tested.renderer.push(renderer.name)
      }
    }
    checked.push(item)
  }
  if (!checked.length) throw new CommandError(`${pkg.name} exports no plugin that loads in Node`)

  const exports: ExportReport[] = checked.map(({ inject, keys, ...item }) => {
    const report: ExportReport = { ...item }
    const compat: Manifest.Compat = {}
    for (const dimension of DIMENSIONS) {
      const names = inferDimension(dimension, { cells: item.cells, inject, keys }, tested)
      if (names === null) {
        report.error = `${pkg.name}${item.subpath.slice(1)} loads with no ${dimension === 'bundler' ? 'bundler' : 'UI framework'} checked`
      } else if (names) {
        compat[dimension] = names
      }
    }
    if (!report.error) report.inferred = compat
    return report
  })
  const result: CheckReport = { name: pkg.name, bundlers: bundlers.map(item => item.name), renderers: renderers.map(item => item.name), exports, mismatches: [], keywords: false }
  if (exports.some(report => report.error)) return result

  // the package supports what any of its plugins supports; the exports that support less are declared apart
  const compat: Manifest.Compat = {}
  for (const dimension of DIMENSIONS) {
    const lists = exports.map(report => report.inferred![dimension])
    if (lists.every(Boolean)) compat[dimension] = [...new Set(lists.flat() as string[])]
  }
  const overrides: Dict<Manifest.Compat> = {}
  for (const report of exports) {
    const differs = DIMENSIONS.filter(dimension => !sameCompat(report.inferred![dimension], compat[dimension]))
    if (differs.length) overrides[report.subpath] = Object.fromEntries(differs.map(dimension => [dimension, report.inferred![dimension]]))
  }
  result.inferred = { compat, exports: overrides }

  // what the package declares now, export by export, and the keywords that mirror it
  const declared = conclude(pkg)
  for (const report of exports) {
    const current = forExport(declared, report.subpath)
    if (declared.source !== 'declared' || DIMENSIONS.some(dimension => !sameCompat(current[dimension], report.inferred![dimension]))) {
      result.mismatches.push(report.subpath)
    }
  }
  result.keywords = manifestKeywords(declared).some(keyword => !pkg.keywords?.includes(keyword))
  return result
}

/** Write the inferred declaration to package.json, and the keywords that mirror it. */
export function writeDeclaration(dir: string, report: CheckReport) {
  if (!report.inferred) return
  const file = join(dir, 'package.json')
  const pkg = readJSON(file)
  const field: Dict<any> = { ...pkg.cormi }
  for (const dimension of DIMENSIONS) {
    if (report.inferred.compat[dimension]) field[dimension] = report.inferred.compat[dimension]
    else delete field[dimension]
  }
  // the exports keep what else they declare (services); their stack is the inferred one
  const exports: Dict<any> = {}
  for (const subpath of new Set([...Object.keys(field.exports ?? {}), ...Object.keys(report.inferred.exports)])) {
    const { bundler, renderer, ...rest } = field.exports?.[subpath] ?? {}
    const entry = { ...rest, ...report.inferred.exports[subpath] }
    if (Object.keys(entry).length) exports[subpath] = entry
  }
  if (Object.keys(exports).length) field.exports = exports
  else delete field.exports
  // the field goes after the keywords, as the template writes it
  const next: Dict<any> = {}
  for (const [key, value] of Object.entries(pkg)) {
    if (key === 'cormi') continue
    next[key] = value
    if (key === 'keywords') next.cormi = field
  }
  next.cormi ??= field
  const generated = /^(bundler|renderer|required|optional|impl|market):/
  next.keywords = [...(pkg.keywords ?? []).filter((keyword: string) => !generated.test(keyword)), ...manifestKeywords(conclude({ ...next, name: pkg.name }))]
  writeFileSync(file, JSON.stringify(next, null, 2) + '\n')
}

function describeCell(cell: Cell) {
  if (cell.status === 'ok') return cell.waits?.length ? `ok (waits for ${cell.waits.join(', ')})` : 'ok'
  if (cell.status === 'pending') return `pending: waits for ${cell.missing.join(', ')}`
  if (cell.status === 'failed') return `failed: ${cell.error}`
  return `skipped: ${cell.reason}`
}

function describeCompat(compat?: Manifest.Compat) {
  return DIMENSIONS.map(dimension => `${dimension}: ${compat?.[dimension]?.join(', ') ?? 'any'}`).join('   ')
}

/** The report as the command prints it: a table of states, then what they mean. */
export function formatReport(report: CheckReport) {
  const lines = [report.name, '']
  const width = Math.max(10, ...report.renderers.map(name => name.length + 2))
  for (const item of report.exports) {
    if (report.exports.length > 1) lines.push(`  ${item.subpath}`)
    lines.push(`    ${''.padEnd(10)}${report.renderers.map(name => name.padEnd(width)).join('')}`)
    const details = new Map<string, string[]>()
    for (const bundler of report.bundlers) {
      const row = report.renderers.map((renderer) => {
        const cell = item.cells[bundler]?.[renderer] ?? { status: 'skipped', reason: 'not checked' }
        const detail = describeCell(cell)
        if (detail !== 'ok') details.set(detail, [...details.get(detail) ?? [], `${bundler} × ${renderer}`])
        return cell.status
      })
      lines.push(`    ${bundler.padEnd(10)}${row.map(text => text.padEnd(width)).join('')}`)
    }
    for (const [detail, cells] of details) lines.push(`    ${cells.join(', ')}: ${detail}`)
    if (item.error) lines.push(`    ${item.error}`)
    lines.push('')
  }
  if (report.inferred) {
    lines.push(`  inferred  ${describeCompat(report.inferred.compat)}`)
    for (const [subpath, compat] of Object.entries(report.inferred.exports)) {
      lines.push(`    ${subpath.padEnd(8)}${describeCompat({ ...report.inferred.compat, ...compat })}`)
    }
  }
  return lines.join('\n')
}
