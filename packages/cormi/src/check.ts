import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { explainPluginWait, getPlugins, resolveAvailableServices, SERVICE_PROVIDERS } from '@cormijs/console'
import { checkServerImport, idle, readJSON, resolvePackageDir, start, stop, winPath } from '@cormijs/core'
import { scanServerCode } from '@cormijs/server'
import { type Context, Logger, type Message } from 'cordis'
import { resolve as resolveModule } from 'import-meta-resolve'

export interface CheckDiagnostic {
  /** Machine-readable diagnostic code, e.g. `CORMI_BOUNDARY_IMPORT` */
  code: string
  severity: 'error' | 'warning'
  message: string
  /** Path relative to the app root */
  file?: string
  line?: number
  column?: number
  /** Actionable instruction on how to fix the issue */
  fix: string
}

export interface AppCheckReport {
  ok: boolean
  errors: number
  warnings: number
  diagnostics: CheckDiagnostic[]
}

export interface CheckAppOptions {
  /** Plugin tree file relative to `cwd` (default `cormi.yml`) */
  config?: string
  /** Skip running the TypeScript compiler check */
  skipTypecheck?: boolean
}

const SERVICE_TYPE_PACKAGES: Record<string, string> = {
  database: '@cormijs/database',
  cache: '@cormijs/cache',
  storage: '@cormijs/storage',
  session: '@cormijs/plugin-session',
  auth: '@cormijs/plugin-auth',
  ai: '@cormijs/ai',
}

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'default'])

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const result: string[] = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.name === 'node_modules' || dirent.name === '.cormi' || dirent.name === 'dist' || dirent.name.startsWith('.')) continue
    const full = join(dir, dirent.name)
    if (dirent.isDirectory()) {
      result.push(...listSourceFiles(full))
    } else if (/\.(?:[cm]?[jt]sx?|vue)$/.test(dirent.name)) {
      result.push(full)
    }
  }
  return result
}

function lineAndColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index)
  const lines = before.split('\n')
  return { line: lines.length, column: lines.at(-1)!.length + 1 }
}

/**
 * Collect the top-level property keys of a Schemastery object/intersect schema.
 * Returns `undefined` when the schema allows arbitrary keys (e.g. `Schema.dict` or `Schema.any`).
 */
function collectSchemaKeys(schema: any, seen = new Set<any>()): Set<string> | undefined {
  if (!schema || (typeof schema !== 'object' && typeof schema !== 'function') || seen.has(schema)) return undefined
  seen.add(schema)
  if (schema.type === 'object' && schema.dict && typeof schema.dict === 'object') {
    return new Set(Object.keys(schema.dict))
  }
  if ((schema.type === 'intersect' || schema.type === 'union') && Array.isArray(schema.list)) {
    const keys = new Set<string>()
    let hasObject = false
    for (const item of schema.list) {
      const sub = collectSchemaKeys(item, seen)
      if (sub) {
        hasObject = true
        for (const k of sub) keys.add(k)
      } else if (item?.type === 'dict' || item?.type === 'any') {
        return undefined
      }
    }
    return hasObject ? keys : undefined
  }
  return undefined
}

/** Check `src/` files for non-type imports crossing into `server/`. */
function checkBoundaryImports(ctx: Context, diagnostics: CheckDiagnostic[]) {
  const { cwd, paths } = ctx.cormi
  if (!existsSync(paths.src) || !existsSync(paths.server)) return
  const files = listSourceFiles(paths.src)
  const importRe = /(?:^|[\n;])\s*(?:import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const file of files) {
    if (file.endsWith('.d.ts')) continue
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(importRe)) {
      const clause = (match[1] ?? '').trim()
      const rawSpecifier = match[2] ?? match[3]
      if (!rawSpecifier) continue
      // `import type ...` or `export type ...`
      if (/^type\b/.test(clause)) continue
      // `import { type A, type B } from ...`
      if (clause.startsWith('{') && clause.endsWith('}')) {
        const inner = clause.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
        if (inner.length > 0 && inner.every(part => /^type\s+\S/.test(part))) continue
      }

      let specifier = rawSpecifier
      if (specifier.startsWith('@/')) {
        specifier = relative(dirname(file), join(paths.src, specifier.slice(2)))
        if (!specifier.startsWith('.')) specifier = './' + specifier
      }
      const error = checkServerImport(paths, file, specifier)
      if (error) {
        const pos = lineAndColumn(content, match.index ?? 0)
        diagnostics.push({
          code: 'CORMI_BOUNDARY_IMPORT',
          severity: 'error',
          file: winPath(relative(cwd, file)),
          line: pos.line,
          column: pos.column,
          message: error,
          fix: `Use "import type" to import types from server/, call the API route with api/fetch, or read server services in a route loader via context.ctx.`,
        })
      }
    }
  }
}

/** Check plugins in `cormi.yml` for load failures, pending services, stack incompatibility, and silent config issues. */
async function checkPluginsAndConfig(ctx: Context, configFile: string, loggedErrors: string[], diagnostics: CheckDiagnostic[]) {
  const { cwd } = ctx.cormi
  const plugins = getPlugins(ctx).filter(p => p.name !== 'cordis:include')
  const available = resolveAvailableServices(ctx, plugins)
  const hasPages = !!(ctx.get('bundler') && ctx.get('renderer'))

  for (const plugin of plugins) {
    if (plugin.disabled) continue

    if (plugin.state === 'failed') {
      const detail = loggedErrors.find(text => text.includes(plugin.name)) ?? loggedErrors[0]
      diagnostics.push({
        code: 'CORMI_PLUGIN_FAILED',
        severity: 'error',
        file: configFile,
        message: `Plugin "${plugin.name}" failed to load${detail ? `: ${detail}` : ''}`,
        fix: `Fix the error in ${plugin.name} or check its configuration in ${configFile}.`,
      })
      continue
    }

    if (plugin.compat?.result.status === 'incompatible') {
      const reasons = plugin.compat.result.reasons
        .map(r => `${r.dimension} (requires ${r.supported.join(' or ')}, app uses ${r.current})`)
        .join(', ')
      diagnostics.push({
        code: 'CORMI_PLUGIN_INCOMPATIBLE',
        severity: 'error',
        file: configFile,
        message: `Plugin "${plugin.name}" is incompatible with the app's stack: ${reasons}`,
        fix: `Replace ${plugin.name} in ${configFile} or switch the app's stack to match (${reasons}).`,
      })
    }

    const { waits, why } = explainPluginWait(plugin, plugins, available)
    if (waits.length) {
      const suggestion = waits.map(s => SERVICE_PROVIDERS[s] ?? `a plugin providing "${s}"`).join(', ')
      diagnostics.push({
        code: 'CORMI_PLUGIN_PENDING',
        severity: 'error',
        file: configFile,
        message: `Plugin "${plugin.name}" is waiting for ${waits.join(', ')}${why ? ` (${why})` : ''}`,
        fix: `Add or enable ${suggestion} in ${configFile}.`,
      })
    }

    // Validate config against plugin Schema and detect silent config mistakes
    let schemaObj: any
    try {
      const exports = await ctx.loader.import(plugin.name)
      const unwrapped = ctx.loader.unwrapExports(exports)
      schemaObj = unwrapped?.Config
    } catch {}

    const rawConfig = plugin.config
    if (schemaObj && typeof schemaObj === 'function' && rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      try {
        schemaObj(structuredClone(rawConfig))
      } catch (error) {
        diagnostics.push({
          code: 'CORMI_CONFIG_INVALID',
          severity: 'error',
          file: configFile,
          message: `Invalid config for plugin "${plugin.name}": ${error instanceof Error ? error.message : String(error)}`,
          fix: `Update the config of "${plugin.name}" in ${configFile} to match its Schema.`,
        })
      }

      const knownKeys = collectSchemaKeys(schemaObj)
      if (knownKeys) {
        for (const key of Object.keys(rawConfig as Record<string, unknown>)) {
          if (!knownKeys.has(key)) {
            diagnostics.push({
              code: 'CORMI_CONFIG_UNKNOWN',
              severity: 'warning',
              file: configFile,
              message: `Config key "${key}" on plugin "${plugin.name}" is not recognized and has no effect`,
              fix: `Remove "${key}" from "${plugin.name}" in ${configFile}, or use one of its supported options (${[...knownKeys].join(', ')}).`,
            })
          }
        }
      }
    }

    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      for (const [key, value] of Object.entries(rawConfig as Record<string, unknown>)) {
        if (Array.isArray(value) && value.length === 0) {
          diagnostics.push({
            code: 'CORMI_CONFIG_EMPTY',
            severity: 'warning',
            file: configFile,
            message: `Config "${key}: []" on plugin "${plugin.name}" is an empty array and has no effect`,
            fix: `Add items to "${key}" under "${plugin.name}" in ${configFile}, or remove the empty "${key}" option.`,
          })
        } else if (key === 'proxy' && value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
          diagnostics.push({
            code: 'CORMI_CONFIG_EMPTY',
            severity: 'warning',
            file: configFile,
            message: `Config "proxy: {}" on plugin "${plugin.name}" is empty and forwards no requests`,
            fix: `Add proxy rules (e.g. "'/api': 'http://localhost:3000'") or remove "proxy" from ${configFile}.`,
          })
        } else if (key === 'ssr' && value === true && !hasPages) {
          diagnostics.push({
            code: 'CORMI_CONFIG_SILENT',
            severity: 'warning',
            file: configFile,
            message: `"ssr: true" is set on "${plugin.name}", but the app has no bundler or UI framework in ${configFile}`,
            fix: `Add a bundler (@cormijs/vite) and UI framework (@cormijs/react or @cormijs/vue) to ${configFile}, or remove "ssr: true".`,
          })
        }
      }
    }
  }

  // Check package.json cormi field for empty arrays (e.g. `bundler: []` which conclude() silently ignores)
  const pkg = readJSON(join(cwd, 'package.json'))
  if (pkg?.cormi && typeof pkg.cormi === 'object') {
    for (const dim of ['bundler', 'renderer'] as const) {
      if (Array.isArray(pkg.cormi[dim]) && pkg.cormi[dim].length === 0) {
        diagnostics.push({
          code: 'CORMI_CONFIG_EMPTY',
          severity: 'warning',
          file: 'package.json',
          message: `"cormi.${dim}: []" in package.json is an empty array and is ignored by Cormi`,
          fix: `Omit "cormi.${dim}" to support all ${dim}s, or list the supported ${dim} names.`,
        })
      }
    }
  }
}

/** Check `server/api` routes and `src/api` convention mistakes. */
async function checkServerRoutes(ctx: Context, diagnostics: CheckDiagnostic[]) {
  const { cwd, paths } = ctx.cormi
  if (existsSync(join(paths.src, 'api'))) {
    diagnostics.push({
      code: 'CORMI_CONVENTION_UNUSED',
      severity: 'warning',
      file: 'src/api',
      message: `Directory "src/api" is not loaded by Cormi; API routes live in "server/api"`,
      fix: `Move your API route files from src/api/** to server/api/**.`,
    })
  }
  if (!existsSync(paths.server)) return

  const available = resolveAvailableServices(ctx)
  const code = scanServerCode(ctx)

  for (const route of code.routes) {
    const absFile = ctx.cormi.resolve(route.file)
    const content = readFileSync(absFile, 'utf8')
    let mod: Record<string, unknown>
    try {
      mod = await import(pathToFileURL(absFile).href + `?t=${Date.now()}`)
    } catch (error) {
      diagnostics.push({
        code: 'CORMI_API_INVALID',
        severity: 'error',
        file: route.file,
        message: `API route ${route.path} (${route.file}) failed to load: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        fix: `Fix the syntax or runtime import error in ${route.file}.`,
      })
      continue
    }

    const methods = Object.keys(mod).filter(k => HTTP_METHODS.has(k) && typeof mod[k] === 'function')
    if (!methods.length) {
      diagnostics.push({
        code: 'CORMI_API_INVALID',
        severity: 'warning',
        file: route.file,
        message: `API route ${route.path} (${route.file}) exports no HTTP method handler (GET, POST, PUT, PATCH, DELETE, or default)`,
        fix: `Export an HTTP handler in ${route.file}, e.g. "export async function GET(request: Request, { ctx }: ApiContext) {}".`,
      })
    }

    const rawInject = mod.inject
    const injected: string[] = Array.isArray(rawInject)
      ? rawInject.filter((s): s is string => typeof s === 'string')
      : rawInject && typeof rawInject === 'object'
        ? Object.keys(rawInject).filter(k => (rawInject as any)[k]?.required !== false)
        : []
    if (mod.auth !== undefined && mod.auth !== false && !injected.includes('auth')) {
      injected.push('auth')
    }
    const missing = injected.filter(s => !available.has(s))
    if (missing.length) {
      const providers = missing.map(s => SERVICE_PROVIDERS[s] ?? `a plugin providing "${s}"`).join(', ')
      diagnostics.push({
        code: 'CORMI_API_WAITING',
        severity: 'error',
        file: route.file,
        message: `API route ${route.path} injects [${missing.join(', ')}], which is not provided by any active plugin in cormi.yml (the route will answer 503)`,
        fix: `Add or enable ${providers} in cormi.yml, or remove the unused service from "export const inject" in ${route.file}.`,
      })
    }

    // Detect `ctx.<service>` usage in handler when `<service>` was forgotten in `export const inject`
    for (const service of ['database', 'model', 'cache', 'storage', 'auth', 'session', 'ai']) {
      const regex = new RegExp(`\\bctx\\.${service}\\b`)
      if (regex.test(content) && !injected.includes(service)) {
        diagnostics.push({
          code: 'CORMI_API_INJECT_MISSING',
          severity: 'error',
          file: route.file,
          message: `API route ${route.path} uses "ctx.${service}" but does not list "${service}" in "export const inject"`,
          fix: `Add "${service}" to "export const inject = [...]" in ${route.file}.`,
        })
      }
    }
  }
}

/**
 * Check `server/env.d.ts` and `declare module` blocks for silent declaration
 * merging failures (unreferenced service types, wrong module targets, or files
 * excluded from `tsconfig.json`).
 */
function checkDeclarations(ctx: Context, includedFiles: Set<string> | undefined, diagnostics: CheckDiagnostic[]) {
  const { cwd, paths } = ctx.cormi
  const available = resolveAvailableServices(ctx)
  const plugins = getPlugins(ctx)
  const enabledNames = new Set(plugins.filter(p => !p.disabled).map(p => p.name))

  if (existsSync(paths.server)) {
    const envFile = join(paths.server, 'env.d.ts')
    const envContent = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
    const serverFiles = listSourceFiles(paths.server)
    const allServerContent = serverFiles.map(f => readFileSync(f, 'utf8')).join('\n')

    for (const [service, pkg] of Object.entries(SERVICE_TYPE_PACKAGES)) {
      if (!available.has(service)) continue
      const usesService = new RegExp(`\\b(ctx\\.${service}|state\\.${service === 'auth' ? 'user' : service})\\b`).test(allServerContent)
      const hasRef = envContent.includes(pkg) || allServerContent.includes(`from '${pkg}'`) || allServerContent.includes(`from "${pkg}"`)
      if (usesService && !hasRef) {
        diagnostics.push({
          code: 'CORMI_ENV_TYPES',
          severity: 'warning',
          file: 'server/env.d.ts',
          message: `Server code uses "${service}", but "${pkg}" is not referenced in server/env.d.ts`,
          fix: `Add '/// <reference types="${pkg}" />' to server/env.d.ts so TypeScript loads its Context and State types.`,
        })
      }
    }
  }

  const allFiles = [...listSourceFiles(paths.src), ...listSourceFiles(paths.server)]
  const declareRe = /declare\s+module\s+['"]([^'"]+)['"]\s*\{([\s\S]*?)\}/g

  for (const file of allFiles) {
    const relFile = winPath(relative(cwd, file))
    const content = readFileSync(file, 'utf8')
    const matches = [...content.matchAll(declareRe)]
    if (!matches.length) continue

    if (includedFiles && !includedFiles.has(resolve(file))) {
      const pos = lineAndColumn(content, matches[0].index ?? 0)
      diagnostics.push({
        code: 'CORMI_DECLARATION_UNLOADED',
        severity: 'warning',
        file: relFile,
        line: pos.line,
        column: pos.column,
        message: `File "${relFile}" contains "declare module '${matches[0][1]}'" but is not included by tsconfig.json, so its types never take effect`,
        fix: `Include "${relFile.split('/')[0]}" in the "include" array of tsconfig.json.`,
      })
    }

    for (const match of matches) {
      const targetModule = match[1]
      const body = match[2]
      const pos = lineAndColumn(content, match.index ?? 0)

      if ((targetModule === '@cormijs/cormi' || targetModule === 'cordis') && /\binterface\s+Tables\b/.test(body)) {
        diagnostics.push({
          code: 'CORMI_DECLARATION_TARGET',
          severity: 'error',
          file: relFile,
          line: pos.line,
          column: pos.column,
          message: `"interface Tables" is declared on "${targetModule}" in ${relFile}, which has no effect on ctx.database or ctx.cache`,
          fix: `Use "declare module '@cormijs/database'" for database tables or "declare module '@cormijs/cache'" for cache tables.`,
        })
      } else if ((targetModule === '@cormijs/cormi' || targetModule === 'cordis') && /\binterface\s+User\b/.test(body)) {
        diagnostics.push({
          code: 'CORMI_DECLARATION_TARGET',
          severity: 'error',
          file: relFile,
          line: pos.line,
          column: pos.column,
          message: `"interface User" is declared on "${targetModule}" in ${relFile}, which has no effect on ctx.auth or state.user`,
          fix: `Use "declare module '@cormijs/plugin-auth' { interface User { ... } }".`,
        })
      } else if ((targetModule === '@cormijs/cormi' || targetModule === 'cordis') && /\binterface\s+SessionData\b/.test(body)) {
        diagnostics.push({
          code: 'CORMI_DECLARATION_TARGET',
          severity: 'error',
          file: relFile,
          line: pos.line,
          column: pos.column,
          message: `"interface SessionData" is declared on "${targetModule}" in ${relFile}, which has no effect on state.session`,
          fix: `Use "declare module '@cormijs/plugin-session' { interface SessionData { ... } }".`,
        })
      } else if (targetModule.startsWith('@cormijs/plugin-') && !targetModule.endsWith('/client')) {
        if (!enabledNames.has(targetModule)) {
          diagnostics.push({
            code: 'CORMI_DECLARATION_UNLOADED',
            severity: 'warning',
            file: relFile,
            line: pos.line,
            column: pos.column,
            message: `${relFile} augments "${targetModule}", but "${targetModule}" is not enabled in cormi.yml`,
            fix: `Add "- name: '${targetModule}'" to cormi.yml, or remove the unused declaration.`,
          })
        }
      }
    }
  }
}

function suggestTsFix(code: number, message: string): string {
  if (/Property '(database|model)' does not exist on type 'Context'/.test(message)) {
    return `Add '/// <reference types="@cormijs/database" />' to server/env.d.ts and ensure @cormijs/database is in cormi.yml.`
  }
  if (/Property 'cache' does not exist on type 'Context'/.test(message)) {
    return `Add '/// <reference types="@cormijs/cache" />' to server/env.d.ts and ensure @cormijs/cache is in cormi.yml.`
  }
  if (/Property 'storage' does not exist on type 'Context'/.test(message)) {
    return `Add '/// <reference types="@cormijs/storage" />' to server/env.d.ts and ensure @cormijs/storage is in cormi.yml.`
  }
  if (/Property 'auth' does not exist on type 'Context'/.test(message) || /Property 'user' does not exist on type 'State'/.test(message)) {
    return `Add '/// <reference types="@cormijs/plugin-auth" />' to server/env.d.ts and ensure @cormijs/plugin-auth is in cormi.yml.`
  }
  if (/Property 'session' does not exist on type 'State'/.test(message)) {
    return `Add '/// <reference types="@cormijs/plugin-session" />' to server/env.d.ts and ensure @cormijs/plugin-session is in cormi.yml.`
  }
  if (/Property 'ai' does not exist on type 'Context'/.test(message)) {
    return `Add '/// <reference types="@cormijs/ai" />' to server/env.d.ts and ensure @cormijs/ai is in cormi.yml.`
  }
  if (/\.cormi/.test(message)) {
    return `Run "cormi setup" to regenerate src/.cormi type files.`
  }
  return `Fix the TypeScript type error (TS${code}).`
}

/** Run TypeScript compiler check on `tsconfig.json` and return included file paths. */
async function runTypeScriptCheck(cwd: string, skipTypecheck: boolean, diagnostics: CheckDiagnostic[]): Promise<Set<string> | undefined> {
  const tsconfigPath = join(cwd, 'tsconfig.json')
  if (!existsSync(tsconfigPath)) return undefined

  let ts: typeof import('typescript')
  try {
    const tsUrl = resolveModule('typescript', pathToFileURL(join(cwd, 'package.json')).href)
    const mod = await import(tsUrl)
    ts = mod.default ?? mod
  } catch {
    try {
      const mod = await import('typescript')
      ts = mod.default ?? mod
    } catch {
      return undefined
    }
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) {
    diagnostics.push({
      code: 'CORMI_TS_CONFIG',
      severity: 'error',
      file: 'tsconfig.json',
      message: ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'),
      fix: `Fix the syntax or extends path in tsconfig.json (run "cormi setup" if src/.cormi/tsconfig.json is missing).`,
    })
    return undefined
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, cwd)
  const included = new Set(parsed.fileNames.map(f => resolve(f)))

  if (skipTypecheck) return included

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  })
  const tsDiagnostics = ts.getPreEmitDiagnostics(program)

  for (const diag of tsDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
    let file: string | undefined
    let line: number | undefined
    let column: number | undefined
    if (diag.file && diag.start !== undefined) {
      file = winPath(relative(cwd, diag.file.fileName))
      // Ignore errors from node_modules
      if (file.includes('node_modules/')) continue
      const pos = diag.file.getLineAndCharacterOfPosition(diag.start)
      line = pos.line + 1
      column = pos.character + 1
    }
    diagnostics.push({
      code: 'CORMI_TS_ERROR',
      severity: diag.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
      file,
      line,
      column,
      message: `TS${diag.code}: ${message}`,
      fix: suggestTsFix(diag.code, message),
    })
  }

  return included
}

/**
 * Run a full structured check on a Cormi app (`cormi check`):
 * - Plugin states, missing services, and stack compatibility
 * - Plugin config schema validation and silent config issues (unknown keys, empty arrays)
 * - Cross-boundary imports between `src/` and `server/`
 * - API route validity and missing `inject` declarations
 * - `server/env.d.ts` and `declare module` declaration-merging checks
 * - TypeScript type checking
 */
export async function checkApp(cwd: string, options: CheckAppOptions = {}): Promise<AppCheckReport> {
  const configFile = options.config ?? process.env.CORMI_CONFIG ?? 'cormi.yml'
  const diagnostics: CheckDiagnostic[] = []

  if (!existsSync(join(cwd, configFile))) {
    diagnostics.push({
      code: 'CORMI_CONFIG_MISSING',
      severity: 'error',
      file: configFile,
      message: `Configuration file "${configFile}" does not exist in ${cwd}`,
      fix: `Create ${configFile} at the project root or pass --config <file>.`,
    })
    return { ok: false, errors: 1, warnings: 0, diagnostics }
  }

  const loggedErrors: string[] = []
  const ctx = await start({ cwd, mode: 'setup', logger: false, config: configFile })
  const exporter = {
    colors: false as const,
    export: (message: Message) => {
      if (message.type === 'error') loggedErrors.push(Logger.format(exporter, message))
    },
  }
  ctx.logger.exporter(exporter)

  try {
    await idle(ctx)
    await ctx.get('app')?.flush()

    await checkPluginsAndConfig(ctx, configFile, loggedErrors, diagnostics)
    checkBoundaryImports(ctx, diagnostics)
    await checkServerRoutes(ctx, diagnostics)

    const includedFiles = await runTypeScriptCheck(cwd, !!options.skipTypecheck, diagnostics)
    checkDeclarations(ctx, includedFiles, diagnostics)
  } finally {
    await stop(ctx)
  }

  const errors = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.filter(d => d.severity === 'warning').length
  return {
    ok: errors === 0,
    errors,
    warnings,
    diagnostics,
  }
}

/** Format `AppCheckReport` for terminal output. */
export function formatAppCheck(report: AppCheckReport): string {
  if (!report.diagnostics.length) {
    return 'ok: no issues found (types, boundary imports, plugins, config and declarations all passed)'
  }
  const lines: string[] = []
  for (const diag of report.diagnostics) {
    const loc = diag.file
      ? ` ${diag.file}${diag.line ? `:${diag.line}${diag.column ? `:${diag.column}` : ''}` : ''}`
      : ''
    lines.push(`${diag.severity.toUpperCase()} [${diag.code}]${loc}: ${diag.message}`)
    lines.push(`  fix: ${diag.fix}`)
  }
  lines.push('')
  lines.push(`${report.errors} error(s), ${report.warnings} warning(s)`)
  return lines.join('\n')
}
