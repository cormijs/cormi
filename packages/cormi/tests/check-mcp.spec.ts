import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { checkApp, createMcpBridge, getAppInfo } from '../src/index.ts'
import { idle, start, stop } from '@cormijs/core'

const root = fileURLToPath(new URL('../../..', import.meta.url))

describe('cormi info', () => {
  it('describes the kind, stack, routes and services of an app', async () => {
    const ctx = await start({ cwd: join(root, 'examples/with-auth'), mode: 'setup', logger: false })
    try {
      await idle(ctx)
      await ctx.get('app')?.flush()
      const info = getAppInfo(ctx)
      expect(info.kind).toBe('ssr')
      expect(info.pages).toMatchObject({ bundler: 'vite', renderer: 'react', ssr: true, routes: 3 })
      expect(info.pages?.list.map(r => r.path)).toEqual(expect.arrayContaining(['/', '/login', '/admin']))
      expect(info.server?.services).toEqual(['middleware', 'cache', 'session', 'auth'])
      expect(info.server?.api.map(r => r.path)).toEqual(expect.arrayContaining(['/api/login', '/api/logout', '/api/me', '/api/admin/stats']))
    } finally {
      await stop(ctx)
    }
  })
})

describe('cormi check', () => {
  const dirs: string[] = []
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  })

  it('reports boundary imports, missing services, silent config issues and bad declarations with error codes and fixes', async () => {
    const dir = mkdtempSync(join(root, 'examples/.cormi-check-'))
    dirs.push(dir)
    symlinkSync(join(root, 'examples/with-auth/node_modules'), join(dir, 'node_modules'), 'dir')

    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'broken-app',
      private: true,
      type: 'module',
      cormi: { bundler: [] },
    }, null, 2))

    writeFileSync(join(dir, 'cormi.yml'), [
      `- name: '@cormijs/preset'`,
      `  config:`,
      `    unknownOption: 123`,
      `    metas: []`,
      `    proxy: {}`,
      `- name: '@cormijs/plugin-session'`,
    ].join('\n'))

    mkdirSync(join(dir, 'src/pages'), { recursive: true })
    mkdirSync(join(dir, 'server/models'), { recursive: true })
    mkdirSync(join(dir, 'server/api'), { recursive: true })

    writeFileSync(join(dir, 'server/models/todo.ts'), [
      `export const SECRET = 'server-only'`,
      `declare module '@cormijs/cormi' {`,
      `  interface Tables { todo: { id: number } }`,
      `}`,
    ].join('\n'))

    // Cross-boundary runtime import from src/ into server/
    writeFileSync(join(dir, 'src/pages/index.tsx'), [
      `import { SECRET } from '../../server/models/todo'`,
      `export default function Home() { return SECRET }`,
    ].join('\n'))

    // API route using ctx.database without export const inject
    writeFileSync(join(dir, 'server/api/todos.ts'), [
      `export async function GET(_req: Request, { ctx }: any) {`,
      `  return ctx.database.get('todo', {})`,
      `}`,
    ].join('\n'))

    const report = await checkApp(dir, { skipTypecheck: true })
    expect(report.ok).toBe(false)
    const codes = report.diagnostics.map(d => d.code)
    expect(codes).toContain('CORMI_BOUNDARY_IMPORT')
    expect(codes).toContain('CORMI_PLUGIN_PENDING')
    expect(codes).toContain('CORMI_CONFIG_UNKNOWN')
    expect(codes).toContain('CORMI_CONFIG_EMPTY')
    expect(codes).toContain('CORMI_DECLARATION_TARGET')
    expect(codes).toContain('CORMI_API_INJECT_MISSING')
    for (const diag of report.diagnostics) {
      expect(diag.fix).toBeTruthy()
    }
  })
})

describe('cormi mcp', () => {
  it('exposes console tools over MCP JSON-RPC 2.0 (overview, diagnostics, plugins, stateful request, logs)', async () => {
    const bridge = await createMcpBridge({ cwd: join(root, 'examples/with-auth') })
    try {
      const initRes = await bridge.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      })
      expect((initRes?.result as any).serverInfo.name).toBe('cormi')

      const listRes = await bridge.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const toolNames = ((listRes?.result as any).tools as any[]).map(t => t.name)
      expect(toolNames).toEqual(expect.arrayContaining([
        'overview',
        'diagnostics',
        'plugins',
        'market',
        'routes',
        'logs',
        'request',
        'generate',
      ]))

      // Call overview
      const overviewRes = await bridge.callTool('overview', {})
      expect(JSON.parse(overviewRes.text)).toMatchObject({ kind: 'ssr' })

      // Stateful session via `request` tool: login once, then call /api/me
      const loginCall = await bridge.callTool('request', {
        path: '/api/login',
        method: 'POST',
        body: { name: 'alice', password: 'cormi' },
        session: 'agent-test',
        resetCookies: true,
      })
      expect(loginCall.text).toContain('200')
      expect(loginCall.text).toContain('"alice"')

      const meCall = await bridge.callTool('request', {
        path: '/api/me',
        session: 'agent-test',
      })
      expect(meCall.text).toContain('200')
      expect(meCall.text).toContain('"admin"')
    } finally {
      await bridge.close()
    }
  })
})
