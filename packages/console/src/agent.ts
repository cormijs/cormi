import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getPackageName, idle, type Mode, readJSON, resolvePackageDir, winPath } from '@cormijs/core'
import { getApiRoutes, scanServerCode } from '@cormijs/server'
import type { Context } from 'cordis'
import { getPlugins, getTree, installPackage, type LogRecord, type MarketPackage, type PluginInfo, toRecord } from './builtin.ts'
import { getServerUrl } from './index.ts'

/** The services of the server side that the description of an app names, when they are there. */
const SERVER_SERVICES = ['middleware', 'database', 'cache', 'storage', 'session', 'auth', 'ai']

/** Known official plugins that provide each service, for diagnostics when a service is missing. */
export const SERVICE_PROVIDERS: Record<string, string> = {
  bundler: '@cormijs/vite or @cormijs/rsbuild',
  vite: '@cormijs/vite',
  rsbuild: '@cormijs/rsbuild',
  renderer: '@cormijs/react or @cormijs/vue',
  react: '@cormijs/react',
  vue: '@cormijs/vue',
  router: '@cormijs/preset',
  html: '@cormijs/preset',
  app: '@cormijs/preset',
  server: '@cormijs/preset',
  middleware: '@cormijs/preset',
  database: '@cormijs/database (with a @minatojs/driver-* plugin)',
  model: '@cormijs/database',
  cache: '@cormijs/cache (or @cormijs/cache-redis, @cormijs/cache-database)',
  storage: '@cormijs/storage (or @cormijs/storage-s3)',
  session: '@cormijs/plugin-session',
  auth: '@cormijs/plugin-auth',
  ai: '@cormijs/ai (or @cormijs/ai-openai, @cormijs/ai-anthropic)',
}

/** What an app is, for AI agents (`cormi info --json`, the `overview` tool of `cormi mcp`). */
export interface AppInfo {
  name: string
  cwd: string
  mode: Mode
  /** where it serves, in dev mode */
  url?: string
  /** which sides it has: web (pages), api (server), fullstack (both), ssr (pages rendered on the server) */
  kind: 'web' | 'api' | 'fullstack' | 'ssr' | 'empty'
  pages?: {
    bundler?: string
    renderer?: string
    ssr: boolean
    routes: number
    list: { path: string; file?: string; loader?: boolean }[]
  }
  server?: {
    /** the API routes of server/api, with their status when the app serves */
    api: { path: string; file: string; methods?: string[]; status?: string; waits?: string[]; error?: string }[]
    /** the plugins of server/: server/index.ts and server/models */
    plugins: string[]
    /** the services of the server side that the app has */
    services: string[]
  }
  /** the plugins of cormi.yml, with the services they wait for and why */
  plugins: { name: string; state: string; waits?: string[]; why?: string }[]
  versions: { cormi?: string; node: string }
  docs: string
}

/** The full path of a route of the pages: paths are relative to their parents. */
function fullPath(ctx: Context, id: string): string {
  const route = ctx.router.routes[id]
  const path = route?.path ?? ''
  if (path.startsWith('/')) return path
  const base = route?.parentId ? fullPath(ctx, route.parentId) : '/'
  return (base.replace(/\/$/, '') + '/' + path).replace(/\/+$/, '') || '/'
}

/**
 * Compute the services available in the app. In `setup` mode (`!ctx.cormi.serving`),
 * serving-only plugins (`database`, `cache`, `storage`, `ai`, `server`, `middleware`)
 * do not start their services; we infer what they provide when serving from
 * the active plugins of `cormi.yml`.
 */
export function resolveAvailableServices(ctx: Context, plugins = getPlugins(ctx)): Set<string> {
  const available = new Set<string>(['cormi', 'cli'])
  for (const key of Reflect.ownKeys(ctx.reflect.store as Record<symbol, any>)) {
    const impl = (ctx.reflect.store as Record<symbol, any>)[key as symbol]
    if (impl?.name && ctx.get(impl.name)) available.add(impl.name)
  }
  for (const plugin of plugins) {
    if (plugin.state === 'active') {
      for (const name of plugin.provides) available.add(name)
    }
  }
  if (ctx.cormi.serving) return available

  const hasDriver = plugins.some(p => !p.disabled && p.state !== 'failed' && /^(@minatojs\/driver-|minato-driver-)/.test(p.name))
  let changed = true
  while (changed) {
    changed = false
    for (const plugin of plugins) {
      if (plugin.disabled || plugin.state === 'failed' || plugin.compat?.result.status === 'incompatible') continue
      if (plugin.inject.some(service => !available.has(service))) continue
      const impls = [...plugin.provides, ...(plugin.compat?.implements ?? [])]
      if (impls.includes('server') && !impls.includes('middleware')) impls.push('middleware')
      for (const service of impls) {
        if (service === 'database' && !hasDriver) continue
        if (!available.has(service)) {
          available.add(service)
          changed = true
        }
      }
    }
  }
  return available
}

/** Explain why a plugin is waiting for services or incompatible with the current stack. */
export function explainPluginWait(plugin: PluginInfo, plugins: PluginInfo[], available: Set<string>): { waits: string[]; why?: string } {
  if (plugin.disabled || plugin.state === 'failed') return { waits: [] }
  if (plugin.name === '@cormijs/database') {
    const driver = plugins.find(p => /^(@minatojs\/driver-|minato-driver-)/.test(p.name))
    if (!driver) {
      return {
        waits: ['database driver'],
        why: 'no minato database driver (e.g. @minatojs/driver-sqlite) is in cormi.yml',
      }
    }
    if (driver.disabled) {
      return {
        waits: ['database driver'],
        why: `database driver ${driver.name} is disabled in cormi.yml`,
      }
    }
  }
  const waits = plugin.inject.filter(service => !available.has(service))
  if (!waits.length) return { waits: [] }

  const reasons: string[] = []
  if (plugin.compat?.result.status === 'incompatible') {
    for (const r of plugin.compat.result.reasons) {
      reasons.push(`requires ${r.dimension} ${r.supported.join(' or ')}, but the app uses ${r.current}`)
    }
  }
  for (const service of waits) {
    const provider = plugins.find(p => p.provides.includes(service) || p.compat?.implements?.includes(service) || (service === 'middleware' && p.compat?.implements?.includes('server')))
    if (provider) {
      if (provider.disabled) reasons.push(`"${service}" is provided by ${provider.name}, which is disabled in cormi.yml`)
      else if (provider.state === 'failed') reasons.push(`"${service}" is provided by ${provider.name}, which failed to load`)
      else if (provider.state === 'pending') reasons.push(`"${service}" is provided by ${provider.name}, which is itself waiting for ${provider.inject.filter(s => !available.has(s)).join(', ') || 'its dependencies'}`)
    } else if (SERVICE_PROVIDERS[service]) {
      reasons.push(`"${service}" is not in cormi.yml (provided by ${SERVICE_PROVIDERS[service]})`)
    } else {
      reasons.push(`no plugin in cormi.yml provides "${service}"`)
    }
  }
  return { waits, why: reasons.join('; ') }
}

export function getAppInfo(ctx: Context): AppInfo {
  const { cwd, mode, paths } = ctx.cormi
  const bundler = ctx.get('bundler')
  const renderer = ctx.get('renderer')
  const ssr = !!ctx.get('app')?.config.ssr
  const hasPages = !!(bundler && renderer)
  const hasServer = existsSync(paths.server)
  const kind = hasPages ? ssr ? 'ssr' : hasServer ? 'fullstack' : 'web' : hasServer ? 'api' : 'empty'
  const serving = getApiRoutes(ctx)
  const code = hasServer ? scanServerCode(ctx) : undefined
  const rawPlugins = getPlugins(ctx).filter(plugin => plugin.name !== 'cordis:include')
  const available = resolveAvailableServices(ctx, rawPlugins)
  const pageList = hasPages
    ? Object.values(ctx.router.routes).filter(route => !route.isLayout).map(route => ({
        path: fullPath(ctx, route.id),
        file: route.file ? winPath(relative(cwd, route.file)) : undefined,
        ...route.exports?.includes('loader') ? { loader: true } : {},
      }))
    : []

  return {
    name: readJSON(join(cwd, 'package.json'))?.name ?? 'app',
    cwd,
    mode,
    url: ctx.get('server') && ctx.cormi.mode === 'dev' ? getServerUrl(ctx) : undefined,
    kind,
    pages: hasPages
      ? { bundler: bundler!.name, renderer: renderer!.name, ssr, routes: pageList.length, list: pageList }
      : undefined,
    server: code && {
      api: serving.length
        ? serving.map(({ path, file, methods, status, waits, error }) => ({ path, file, methods, status, waits, error }))
        : code.routes.map(({ path, file }) => ({ path, file })),
      plugins: code.plugins,
      services: SERVER_SERVICES.filter(name => available.has(name)),
    },
    plugins: rawPlugins.map((plugin) => {
      const { waits, why } = explainPluginWait(plugin, rawPlugins, available)
      const state = !ctx.cormi.serving && plugin.state === 'pending' && !waits.length ? 'active' : plugin.state
      return {
        name: plugin.name,
        state,
        ...waits.length ? { waits } : {},
        ...why ? { why } : {},
      }
    }),
    versions: { cormi: readVersion(cwd), node: process.versions.node },
    docs: 'https://cormi.js.org/llms.txt',
  }
}

/** Format `AppInfo` as human-readable text for `cormi info`. */
export function formatAppInfo(info: AppInfo): string {
  const lines: string[] = [
    `${info.name} (${info.kind})`,
    `  cwd:      ${info.cwd}`,
    `  cormi:    ${info.versions.cormi ?? 'unknown'} (node ${info.versions.node})`,
  ]
  if (info.url) lines.push(`  url:      ${info.url}`)
  if (info.pages) {
    lines.push(`  pages:    ${info.pages.renderer ?? 'none'} + ${info.pages.bundler ?? 'none'}${info.pages.ssr ? ' (SSR)' : ''}, ${info.pages.routes} route(s)`)
    for (const route of info.pages.list) {
      lines.push(`            ${route.path.padEnd(24)} ${route.file ?? ''}${route.loader ? ' [loader]' : ''}`)
    }
  }
  if (info.server) {
    lines.push(`  services: ${info.server.services.length ? info.server.services.join(', ') : 'none'}`)
    if (info.server.api.length) {
      lines.push(`  api:      ${info.server.api.length} route(s)`)
      for (const route of info.server.api) {
        const methods = route.methods?.length ? `[${route.methods.join(', ')}] ` : ''
        const status = route.status && route.status !== 'ready' ? ` (${route.status}${route.waits?.length ? `: waits for ${route.waits.join(', ')}` : ''})` : ''
        lines.push(`            ${route.path.padEnd(24)} ${methods}${route.file}${status}`)
      }
    }
  }
  if (info.plugins.length) {
    lines.push(`  plugins:`)
    for (const plugin of info.plugins) {
      const detail = plugin.why ? ` — ${plugin.why}` : plugin.waits?.length ? ` (waits for ${plugin.waits.join(', ')})` : ''
      lines.push(`    ${plugin.name.padEnd(32)} ${plugin.state}${detail}`)
    }
  }
  return lines.join('\n')
}

function readVersion(cwd: string): string | undefined {
  const dir = resolvePackageDir('@cormijs/cormi', cwd)
  return dir ? readJSON(join(dir, 'package.json'))?.version : undefined
}

/** A cookie jar of the `request` tool: the session of an agent, like that of a browser. */
const jars = new Map<string, Map<string, string>>()

/** The tools of AI agents of the console itself, see `ctx.console.tool()`. */
export function AgentTools(ctx: Context) {
  const { cwd } = ctx.cormi
  const logs = (since = 0) => ctx.logger.buffer.map(toRecord).filter(record => record.sn > since)
  const format = (record: LogRecord) => `#${record.sn} ${record.type} ${record.text}`

  ctx.console.tool('overview', {
    description: 'What the app is: its kind (web, api, fullstack, ssr), its pages (bundler, UI framework, SSR, routes), its server (API routes with their status, services), its plugins and the services they wait for, its URL. Start here.',
    handler: () => getAppInfo(ctx),
  })

  ctx.console.tool('diagnostics', {
    description: 'What is wrong now: plugins that failed or wait for services (and why), API routes that failed to load or wait, and the recent warnings and errors of the dev server. Call it after changing files: the dev server reloads them.',
    input: { type: 'object', properties: { since: { type: 'number', description: 'only logs after this number (#sn of a log)' } } },
    handler: ({ since }: { since?: number }) => {
      const problems: string[] = []
      for (const plugin of getAppInfo(ctx).plugins) {
        if (plugin.state === 'failed') problems.push(`plugin ${plugin.name} failed to load: see the errors below`)
        if (plugin.state === 'pending' || plugin.waits?.length) {
          problems.push(`plugin ${plugin.name} waits for ${plugin.waits?.join(', ') || 'its services'}${plugin.why ? ` (${plugin.why})` : ''}`)
        }
      }
      for (const route of getApiRoutes(ctx)) {
        if (route.status === 'failed') problems.push(`API route ${route.path} (${route.file}) failed to load: ${route.error}`)
        if (route.status === 'waiting') problems.push(`API route ${route.path} answers 503: it waits for ${route.waits?.join(', ')}`)
      }
      const recent = logs(since).filter(record => record.type === 'error' || record.type === 'warn').slice(-20)
      if (!problems.length && !recent.length) return 'No problems: every plugin is active, every API route is ready, no warnings or errors.'
      return [
        ...problems.length ? ['Problems:', ...problems.map(problem => `- ${problem}`)] : [],
        ...recent.length ? ['', 'Recent warnings and errors:', ...recent.map(format)] : [],
      ].join('\n')
    },
  })

  ctx.console.tool('plugins', {
    description: 'Query or manage the plugins of cormi.yml: list their state (active, pending, failed, disabled), the services they inject/provide, and why a pending plugin is waiting. Pass `action` ("enable", "disable", "add", "remove", "configure") with `name` to enable, disable, add, remove or update a plugin in cormi.yml.',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'a plugin name or id, e.g. @cormijs/database' },
        action: { type: 'string', enum: ['enable', 'disable', 'add', 'remove', 'configure'], description: 'modify the plugin in cormi.yml' },
        config: { type: 'object', description: 'plugin configuration for add or configure' },
      },
    },
    handler: async ({ name, action, config }: { name?: string; action?: 'enable' | 'disable' | 'add' | 'remove' | 'configure'; config?: Record<string, unknown> }) => {
      const list = () => {
        const raw = getPlugins(ctx).filter(plugin => plugin.name !== 'cordis:include')
        const available = resolveAvailableServices(ctx, raw)
        return raw.map((plugin) => {
          const { waits, why } = explainPluginWait(plugin, raw, available)
          return { ...plugin, ...waits.length ? { waits } : {}, ...why ? { why } : {} }
        })
      }

      if (action) {
        if (!name) throw new Error(`action "${action}" requires a plugin name`)
        const tree = getTree(ctx)
        if (!tree) throw new Error('cormi.yml is not loaded')
        const current = list()
        const target = current.find(plugin => plugin.name === name || plugin.id === name)
        if (action === 'add') {
          if (target) {
            await tree.update(target.id, { disabled: null, ...config !== undefined ? { config } : {} })
          } else {
            await tree.create({ name, config, disabled: null })
          }
        } else {
          if (!target) throw new Error(`no plugin ${name} in cormi.yml; the plugins are ${current.map(p => p.name).join(', ')}`)
          if (action === 'enable') await tree.update(target.id, { disabled: null, ...config !== undefined ? { config } : {} })
          else if (action === 'disable') await tree.update(target.id, { disabled: true })
          else if (action === 'configure') await tree.update(target.id, { config: config ?? {} })
          else if (action === 'remove') await tree.remove(target.id)
        }
        await idle(ctx)
        const updated = list()
        if (action === 'remove') return { removed: name, plugins: updated.map(({ name, state, waits, why }) => ({ name, state, waits, why })) }
        return updated.find(plugin => plugin.name === name || plugin.id === name) ?? updated.map(({ name, state, waits, why }) => ({ name, state, waits, why }))
      }

      const plugins = list()
      if (name) {
        const plugin = plugins.find(plugin => plugin.name === name || plugin.id === name)
        if (!plugin) return `no plugin ${name} in cormi.yml; the plugins are ${plugins.map(plugin => plugin.name).join(', ')}`
        return plugin
      }
      return plugins.map(({ id, name, state, inject, provides, waits, why }) => ({ id, name, state, inject, provides, ...waits ? { waits } : {}, ...why ? { why } : {} }))
    },
  })

  ctx.console.tool('market', {
    description: 'Search plugins in the Cormi market (`query`), or install a plugin package from the market (`install`, e.g. "@cormijs/plugin-auth") and optionally enable it in cormi.yml (`enable: true`).',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search keywords, e.g. "auth", "cache", "tailwind"' },
        install: { type: 'string', description: 'package specifier to install, e.g. "@cormijs/plugin-auth" or "@minatojs/driver-sqlite"' },
        enable: { type: 'boolean', description: 'add/enable the installed plugin in cormi.yml (default true when installing)' },
        config: { type: 'object', description: 'initial config when enabling the plugin in cormi.yml' },
      },
    },
    handler: async ({ query, install, enable = true, config }: { query?: string; install?: string; enable?: boolean; config?: Record<string, unknown> }) => {
      if (install) {
        await installPackage(ctx, install)
        const pkgName = getPackageName(install) ?? install
        if (enable) {
          const tree = getTree(ctx)
          if (tree) {
            const existing = getPlugins(ctx).find(p => p.name === pkgName)
            if (existing) await tree.update(existing.id, { disabled: null, ...config !== undefined ? { config } : {} })
            else await tree.create({ name: pkgName, config, disabled: null })
            await idle(ctx)
          }
        }
        const raw = getPlugins(ctx).filter(p => p.name !== 'cordis:include')
        const available = resolveAvailableServices(ctx, raw)
        const plugin = raw.find(p => p.name === pkgName)
        const waitInfo = plugin ? explainPluginWait(plugin, raw, available) : undefined
        return {
          installed: install,
          enabled: enable,
          plugin: plugin ? { name: plugin.name, state: plugin.state, ...waitInfo?.waits.length ? { waits: waitInfo.waits } : {}, ...waitInfo?.why ? { why: waitInfo.why } : {} } : undefined,
        }
      }
      const results = await ctx.console.call<MarketPackage[]>('market/search', query ?? '')
      return results.slice(0, 30).map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        installed: pkg.installed,
        compatible: pkg.compat.result.status,
        implements: pkg.compat.implements,
      }))
    },
  })

  ctx.console.tool('routes', {
    description: 'The routes of the app: the pages (path, file, whether a server loader runs), the API routes of server/api (methods, file, status, auth), and the routes plugins register on the server.',
    handler: () => ({
      pages: Object.values(ctx.router.routes).filter(route => !route.isLayout).map(route => ({
        path: fullPath(ctx, route.id),
        file: route.file && winPath(relative(cwd, route.file)),
        loader: route.exports?.includes('loader') || undefined,
      })),
      api: getApiRoutes(ctx),
      plugins: [...ctx.server.httpRoutes]
        .filter(route => !(route.method === 'all' && String(route.path).endsWith('{/*rest}')))
        .map(route => ({ method: route.method.toUpperCase(), path: String(route.path), plugin: route.fiber?.name })),
    }),
  })

  ctx.console.tool('logs', {
    description: 'The logs of the dev server, newest last: errors with their stacks, warnings, what plugins log.',
    input: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'], description: 'this level and above (default info)' },
        contains: { type: 'string', description: 'only logs that contain this text' },
        since: { type: 'number', description: 'only logs after this number (#sn of a log)' },
        limit: { type: 'number', description: 'at most this many, the newest (default 50)' },
      },
    },
    handler: ({ level = 'info', contains, since, limit = 50 }: { level?: string; contains?: string; since?: number; limit?: number }) => {
      const levels = ['error', 'warn', 'info', 'success', 'debug']
      const max = level === 'info' ? levels.indexOf('success') : Math.max(levels.indexOf(level), 0)
      const records = logs(since)
        .filter(record => (levels.indexOf(record.type) < 0 ? 2 : levels.indexOf(record.type)) <= max)
        .filter(record => !contains || record.text.includes(contains))
        .slice(-limit)
      return records.length ? records.map(format).join('\n') : 'no logs'
    },
  })

  ctx.console.tool('request', {
    description: 'Send an HTTP request to the app, e.g. to try an API route. The cookies it gets back are kept for the next requests, like a browser: sign in once, then call the routes that require a user. The logs of the server during the request come with the response.',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'e.g. /api/todos?done=true' },
        method: { type: 'string', description: 'default GET' },
        body: { description: 'a string, or a value sent as JSON' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
        session: { type: 'string', description: 'the name of a cookie jar, for several users (default "default")' },
        resetCookies: { type: 'boolean', description: 'forget the cookies of the session first' },
      },
      required: ['path'],
    },
    handler: async (args: { path: string; method?: string; body?: unknown; headers?: Record<string, string>; session?: string; resetCookies?: boolean }) => {
      const session = args.session ?? 'default'
      if (args.resetCookies) jars.delete(session)
      const jar = jars.get(session) ?? new Map<string, string>()
      jars.set(session, jar)
      const headers = new Headers(args.headers)
      if (jar.size && !headers.has('cookie')) headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
      let body: string | undefined
      if (args.body !== undefined) {
        body = typeof args.body === 'string' ? args.body : JSON.stringify(args.body)
        if (typeof args.body !== 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json')
      }
      const before = ctx.logger.buffer.at(-1)?.sn ?? 0
      const start = performance.now()
      const init: RequestInit = { method: args.method ?? 'GET', headers, body, redirect: 'manual' }
      const response = ctx.cormi.mode === 'test'
        ? await ctx.server.fetch(args.path, init)
        : await fetch(new URL(args.path, getServerUrl(ctx)), init)
      const time = Math.round(performance.now() - start)
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';')
        const index = pair.indexOf('=')
        const name = pair.slice(0, index).trim()
        if (/;\s*max-age=0\b/i.test(cookie) || pair.slice(index + 1) === '') jar.delete(name)
        else jar.set(name, pair.slice(index + 1))
      }
      let text = await response.text()
      try {
        text = JSON.stringify(JSON.parse(text), null, 2)
      } catch {}
      // the logs of the request: they may come a moment after the response
      if (ctx.cormi.mode !== 'test') await new Promise(resolve => setTimeout(resolve, 50))
      const during = logs(before)
      return [
        `${response.status} ${response.statusText} (${time} ms)`.trim(),
        ...[...response.headers].filter(([key]) => !['date', 'connection', 'keep-alive', 'transfer-encoding'].includes(key)).map(([key, value]) => `${key}: ${value}`),
        '',
        text.length > 20_000 ? `${text.slice(0, 20_000)}\n… (${text.length} characters)` : text,
        ...during.length ? ['', 'Logs of the server meanwhile:', ...during.map(format)] : [],
      ].join('\n')
    },
  })

  ctx.console.tool('generate', {
    description: 'Create files by the conventions of the app, like `cormi g`: without a type, list the generators (e.g. page, component, api, model, plugin); with one, create the files of a name, e.g. type "api" and name "users/[id]".',
    input: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        name: { type: 'string' },
      },
    },
    handler: async ({ type, name }: { type?: string; name?: string }) => {
      const { generators } = ctx.cli
      if (!type) return [...generators].map(([type, { description }]) => `${type}: ${description}`).join('\n')
      const generator = generators.get(type)
      if (!generator) return `no generator ${type}; the generators are ${[...generators.keys()].join(', ')}`
      if (!name) throw new Error(`generator ${type} needs a name`)
      const files = await generator.run(name, { _: [] })
      return `created ${files.map(file => winPath(relative(cwd, file))).join(', ')}`
    },
  })
}
