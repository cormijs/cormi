import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { type Console, DEV_FILE } from '@cormijs/console'
import { idle, start, stop } from '@cormijs/core'
import type { Context } from 'cordis'

export interface McpToolSchema {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, any>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpBridge {
  listTools(): Promise<McpToolSchema[]>
  callTool(name: string, args: unknown): Promise<{ text: string; isError?: boolean }>
  handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined>
  close(): Promise<void>
}

export interface McpBridgeOptions {
  cwd: string
  /** Explicit URL of the dev server (e.g. `http://localhost:8000`) */
  url?: string
  /** Console base path when `url` is given (default `/__cormi/`) */
  consolePath?: string
  version?: string
  onToolsChanged?: () => void
}

interface RemoteConnection {
  ws: WebSocket
  tools: McpToolSchema[]
  call(name: string, ...args: unknown[]): Promise<any>
  close(): void
}

function readDevInfo(cwd: string, explicitUrl?: string, consolePath = '/__cormi/'): Console.DevInfo | undefined {
  if (explicitUrl) {
    return { url: explicitUrl.replace(/\/$/, ''), console: consolePath.replace(/\/?$/, '/'), pid: 0, started: '' }
  }
  const file = join(cwd, DEV_FILE)
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Console.DevInfo
  } catch {
    return undefined
  }
}

function connectConsoleSocket(info: Console.DevInfo, onToolsChanged?: () => void): Promise<RemoteConnection | undefined> {
  const wsUrl = `${info.url.replace(/^http/, 'ws')}${info.console}ws`
  return new Promise((resolve) => {
    let settled = false
    let callId = 0
    let initializedTools = false
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      return resolve(undefined)
    }

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        try { ws.close() } catch {}
        resolve(undefined)
      }
    }, 1500)

    const connection: RemoteConnection = {
      ws,
      tools: [],
      call(name: string, ...args: unknown[]) {
        return new Promise((res, rej) => {
          if (ws.readyState !== WebSocket.OPEN) return rej(new Error('console socket is closed'))
          const id = ++callId
          pending.set(id, { resolve: res, reject: rej })
          ws.send(JSON.stringify({ type: 'call', id, name, args }))
        })
      },
      close() {
        clearTimeout(timeout)
        try { ws.close() } catch {}
      },
    }

    ws.addEventListener('message', (event) => {
      let msg: any
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (msg.type === 'data' && msg.name === 'tools' && Array.isArray(msg.value)) {
        connection.tools = msg.value
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          resolve(connection)
        } else if (initializedTools) {
          onToolsChanged?.()
        }
        initializedTools = true
      } else if (msg.type === 'result' && typeof msg.id === 'number') {
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        if (msg.error) entry.reject(new Error(msg.error))
        else entry.resolve(msg.value)
      }
    })

    const onFail = () => {
      for (const entry of pending.values()) entry.reject(new Error('console socket closed'))
      pending.clear()
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        resolve(undefined)
      }
    }
    ws.addEventListener('error', onFail)
    ws.addEventListener('close', onFail)
  })
}

/**
 * Create an MCP bridge to the Cormi console: connects to the running `cormi dev`
 * server over its console WebSocket (`node_modules/.cormi/dev.json`), or falls
 * back to an in-process app in `test` mode when the dev server is not running.
 */
export async function createMcpBridge(options: McpBridgeOptions): Promise<McpBridge> {
  let remote: RemoteConnection | undefined
  let localCtx: Context | undefined

  const stopLocal = async () => {
    if (!localCtx) return
    const ctx = localCtx
    localCtx = undefined
    await stop(ctx)
  }

  const ensureBackend = async (): Promise<{ mode: 'remote'; conn: RemoteConnection } | { mode: 'local'; console: Console }> => {
    if (remote && remote.ws.readyState === WebSocket.OPEN) {
      return { mode: 'remote', conn: remote }
    }
    remote = undefined
    const info = readDevInfo(options.cwd, options.url, options.consolePath)
    if (info) {
      const conn = await connectConsoleSocket(info, options.onToolsChanged)
      if (conn) {
        remote = conn
        await stopLocal()
        return { mode: 'remote', conn }
      }
    }
    if (!localCtx) {
      localCtx = await start({ cwd: options.cwd, mode: 'test', logger: false, config: process.env.CORMI_CONFIG })
      await idle(localCtx)
    }
    const consoleService = localCtx.get('console')
    if (!consoleService) throw new Error('the console is not available: is @cormijs/preset in cormi.yml with console enabled?')
    return { mode: 'local', console: consoleService }
  }

  const listTools = async (): Promise<McpToolSchema[]> => {
    const backend = await ensureBackend()
    return backend.mode === 'remote' ? backend.conn.tools : backend.console.listTools()
  }

  const callTool = async (name: string, args: unknown): Promise<{ text: string; isError?: boolean }> => {
    const backend = await ensureBackend()
    if (backend.mode === 'remote') {
      return await backend.conn.call('tool/call', name, args ?? {})
    }
    return await backend.console.callTool(name, args ?? {})
  }

  const handleMessage = async (message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> => {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return undefined
    // JSON-RPC notifications have no `id`
    if (message.id === undefined) return undefined
    const id = message.id
    try {
      switch (message.method) {
        case 'initialize': {
          const clientVersion = message.params?.protocolVersion
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: typeof clientVersion === 'string' ? clientVersion : '2024-11-05',
              capabilities: {
                tools: { listChanged: true },
              },
              serverInfo: {
                name: 'cormi',
                version: options.version ?? '0.1.0',
              },
            },
          }
        }
        case 'ping':
          return { jsonrpc: '2.0', id, result: {} }
        case 'tools/list': {
          const tools = await listTools()
          return { jsonrpc: '2.0', id, result: { tools } }
        }
        case 'tools/call': {
          const name = String(message.params?.name ?? '')
          const args = message.params?.arguments ?? {}
          const result = await callTool(name, args)
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.text }],
              ...result.isError ? { isError: true } : {},
            },
          }
        }
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${message.method}` },
          }
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  return {
    listTools,
    callTool,
    handleMessage,
    async close() {
      remote?.close()
      remote = undefined
      await stopLocal()
    },
  }
}

/** Run the `cormi mcp` stdio server. */
export async function runMcpServer(options: McpBridgeOptions) {
  const send = (payload: unknown) => {
    process.stdout.write(JSON.stringify(payload) + '\n')
  }
  const bridge = await createMcpBridge({
    ...options,
    onToolsChanged: () => {
      send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' })
    },
  })

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let req: JsonRpcRequest
    try {
      req = JSON.parse(trimmed)
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
      continue
    }
    const res = await bridge.handleMessage(req)
    if (res) send(res)
  }
  await bridge.close()
}
