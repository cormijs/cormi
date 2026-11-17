import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {} from '@cordisjs/plugin-server'
import { readJSON, Schema } from '@cormijs/core'
import { type ApiModule, getApiRouteModules } from '@cormijs/server'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    ai: AI
  }
}

export type AIRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export interface AIMessage {
  role: AIRole
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
}

export interface AITool {
  name: string
  description: string
  input?: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  handler?: (args: any) => unknown | Promise<unknown>
}

export interface AIUsage {
  inputTokens: number
  outputTokens: number
}

export interface ChatOptions {
  /** Override the default model of the provider */
  model?: string
  /** System prompt prepended to the conversation */
  system?: string
  temperature?: number
  maxTokens?: number
  /** Tools the model may call, or `true` to pass all tools registered on `ctx.ai` (including `server/api` routes) */
  tools?: AITool[] | boolean
  /** Maximum automatic tool execution rounds in `chat()` (default `5`) */
  maxSteps?: number
  signal?: AbortSignal
  /** Custom `fetch` implementation (e.g. for testing) */
  fetch?: typeof globalThis.fetch
}

export interface ChatResult {
  text: string
  role: 'assistant'
  toolCalls?: ToolCall[]
  usage?: AIUsage
  finishReason?: string
  messages: AIMessage[]
}

export type ChatChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCall: ToolCall }
  | { type: 'done'; usage?: AIUsage; finishReason?: string }

/**
 * A streaming AI response:
 * - `for await (const chunk of stream)` iterates `ChatChunk` items
 * - `stream.textStream` is a `ReadableStream<string>` of text deltas
 * - `await stream.text()` collects the full text
 * - `stream.toResponse()` returns an SSE `Response` (`text/event-stream`)
 * - `stream.toTextResponse()` returns a plain text streaming `Response`
 * - Returning `ctx.ai.stream(...)` directly from a `server/api` handler sends `toResponse()` automatically
 */
export interface ChatStream extends AsyncIterable<ChatChunk> {
  readonly textStream: ReadableStream<string>
  text(): Promise<string>
  toResponse(init?: ResponseInit): Response
  toTextResponse(init?: ResponseInit): Response
}

export interface RouteMcpMeta {
  name?: string
  description?: string
  input?: AITool['input']
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** Create a `ChatStream` from an async generator of `ChatChunk`s. */
export function createChatStream(factory: () => AsyncGenerator<ChatChunk, void, unknown>): ChatStream {
  const encoder = new TextEncoder()

  const stream: ChatStream = {
    [Symbol.asyncIterator]() {
      return factory()
    },
    get textStream() {
      const iterator = factory()
      return new ReadableStream<string>({
        async pull(controller) {
          while (true) {
            const { value, done } = await iterator.next()
            if (done) {
              controller.close()
              return
            }
            if (value.type === 'text' && value.text) {
              controller.enqueue(value.text)
              return
            }
          }
        },
        async cancel() {
          await iterator.return?.()
        },
      })
    },
    async text() {
      let out = ''
      for await (const chunk of factory()) {
        if (chunk.type === 'text') out += chunk.text
      }
      return out
    },
    toResponse(init?: ResponseInit) {
      const iterator = factory()
      const headers = new Headers(init?.headers)
      if (!headers.has('content-type')) headers.set('content-type', 'text/event-stream; charset=utf-8')
      if (!headers.has('cache-control')) headers.set('cache-control', 'no-cache, no-transform')
      if (!headers.has('connection')) headers.set('connection', 'keep-alive')
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const { value, done } = await iterator.next()
            if (done) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
              return
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`))
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`))
            controller.close()
          }
        },
        async cancel() {
          await iterator.return?.()
        },
      })
      return new Response(body, { ...init, status: init?.status ?? 200, headers })
    },
    toTextResponse(init?: ResponseInit) {
      const iterator = factory()
      const headers = new Headers(init?.headers)
      if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8')
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          while (true) {
            const { value, done } = await iterator.next()
            if (done) {
              controller.close()
              return
            }
            if (value.type === 'text' && value.text) {
              controller.enqueue(encoder.encode(value.text))
              return
            }
          }
        },
        async cancel() {
          await iterator.return?.()
        },
      })
      return new Response(body, { ...init, status: init?.status ?? 200, headers })
    },
  }

  return stream
}

/** Parse Server-Sent Events (`data: ...`) from a `ReadableStream<Uint8Array>`. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data:')) {
          const payload = trimmed.slice(5).trim()
          if (payload && payload !== '[DONE]') yield payload
        }
      }
    }
    if (buffer.trim().startsWith('data:')) {
      const payload = buffer.trim().slice(5).trim()
      if (payload && payload !== '[DONE]') yield payload
    }
  } finally {
    reader.releaseLock()
  }
}

export function normalizeMessages(input: string | AIMessage[], system?: string): AIMessage[] {
  const list: AIMessage[] = typeof input === 'string' ? [{ role: 'user', content: input }] : [...input]
  if (system && !list.some(m => m.role === 'system')) {
    list.unshift({ role: 'system', content: system })
  }
  return list
}

function toToolName(method: string, routePath: string) {
  const cleaned = routePath
    .replace(/^\/api\/?/, '')
    .replace(/\*(\w+)/g, 'by_$1')
    .replace(/:(\w+)/g, 'by_$1')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${method.toLowerCase()}_${cleaned || 'root'}`
}

function extractJsDoc(source: string, method: string): string | undefined {
  const pattern = new RegExp(`/\\*\\*([\\s\\S]*?)\\*/\\s*export\\s+(?:async\\s+)?function\\s+${method}\\b`)
  const match = pattern.exec(source)
  if (!match) return undefined
  return match[1]
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
}

function extractPathParams(routePath: string): string[] {
  const params: string[] = []
  for (const match of routePath.matchAll(/[:*](\w+)/g)) {
    params.push(match[1])
  }
  return params
}

/**
 * Turn the app's `server/api` routes into MCP tools so external agents and
 * `ctx.ai` can discover and call them automatically.
 * A route module can opt out with `export const mcp = false`, or customize
 * metadata with `export const mcp = { GET: { name, description, input } }`.
 */
export function buildApiTools(ctx: Context): AITool[] {
  const routes = getApiRouteModules(ctx)
  const tools: AITool[] = []

  for (const route of routes) {
    const mod = route.module as ApiModule & { description?: string; mcp?: false | Record<string, RouteMcpMeta | false> }
    if (mod.mcp === false) continue

    const absFile = ctx.cormi.resolve(route.file)
    const source = existsSync(absFile) ? readFileSync(absFile, 'utf8') : ''
    const pathParams = extractPathParams(route.path)

    const methods: string[] = HTTP_METHODS.filter(m => typeof mod[m] === 'function')
    if (!methods.length && typeof mod.default === 'function') methods.push('POST')

    for (const method of methods) {
      const meta = typeof mod.mcp === 'object' ? mod.mcp[method] : undefined
      if (meta === false) continue

      const name = meta?.name ?? toToolName(method, route.path)
      const description = meta?.description
        ?? extractJsDoc(source, method)
        ?? mod.description
        ?? `${method} ${route.path} (${route.file})`

      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const param of pathParams) {
        properties[param] = { type: 'string', description: `Path parameter :${param} in ${route.path}` }
        required.push(param)
      }
      if (method === 'GET' || method === 'DELETE') {
        properties.query = { type: 'object', description: 'Optional URL query parameters' }
      } else {
        properties.body = { description: 'JSON request body' }
      }
      const inputSchema: AITool['input'] = meta?.input ?? {
        type: 'object',
        properties,
        ...required.length ? { required } : {},
      }

      tools.push({
        name,
        description,
        input: inputSchema,
        handler: async (args: Record<string, any> = {}) => {
          const server = ctx.get('server')
          if (!server) throw new Error('ctx.server is not available')

          const paramsSource = (args.params && typeof args.params === 'object') ? args.params : args
          let resolvedPath = route.path
          for (const param of pathParams) {
            const val = paramsSource[param]
            if (val === undefined) throw new Error(`missing path parameter "${param}" for ${route.path}`)
            const encoded = Array.isArray(val) ? val.map((v: any) => encodeURIComponent(String(v))).join('/') : encodeURIComponent(String(val))
            resolvedPath = resolvedPath.replace(`*${param}`, encoded).replace(`:${param}`, encoded)
          }

          const url = new URL(resolvedPath, 'http://localhost')
          if (args.query && typeof args.query === 'object') {
            for (const [k, v] of Object.entries(args.query)) {
              if (v !== undefined && v !== null) url.searchParams.append(k, String(v))
            }
          } else if (method === 'GET' || method === 'DELETE') {
            for (const [k, v] of Object.entries(args)) {
              if (!pathParams.includes(k) && k !== 'params' && k !== 'headers' && v !== undefined && v !== null && typeof v !== 'object') {
                url.searchParams.append(k, String(v))
              }
            }
          }

          let bodyPayload = args.body
          if (bodyPayload === undefined && method !== 'GET' && method !== 'DELETE') {
            const rest: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(args)) {
              if (!pathParams.includes(k) && k !== 'params' && k !== 'query' && k !== 'headers') {
                rest[k] = v
              }
            }
            if (Object.keys(rest).length) bodyPayload = rest
          }

          const headers = new Headers(args.headers)
          let body: string | undefined
          if (bodyPayload !== undefined) {
            body = typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload)
            if (typeof bodyPayload !== 'string' && !headers.has('content-type')) {
              headers.set('content-type', 'application/json')
            }
          }

          const response = await server.fetch(url.pathname + url.search, { method, headers, body })
          const text = await response.text()
          let data: unknown = text
          try {
            data = JSON.parse(text)
          } catch {}
          if (!response.ok) {
            throw new Error(`${method} ${resolvedPath} failed (${response.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`)
          }
          return data
        },
      })
    }
  }

  return tools
}

export interface BaseAIConfig {
  /** Expose the app's `server/api` routes and `ctx.ai` tools at this HTTP MCP endpoint (e.g. `'/mcp'`), or `false` */
  mcp?: string | boolean
  /** Include `server/api` routes as MCP tools automatically (default `true`) */
  apiTools?: boolean
}

/**
 * The AI service of the app (`ctx.ai`), modeled after `ctx.cache` and `ctx.storage`:
 * - `ctx.ai.chat(messages, options)` for completions (with automatic tool calling)
 * - `ctx.ai.stream(messages, options)` for streaming responses (SSE or text)
 * - `ctx.ai.tool(name, tool)` & automatic `server/api` -> MCP tools exposure
 *
 * Replaceable implementations: `@cormijs/ai` / `@cormijs/ai-openai` (OpenAI &
 * compatible APIs) and `@cormijs/ai-anthropic` (Anthropic Claude).
 */
export abstract class AI extends Service {
  private _tools = new Map<string, AITool>()

  constructor(ctx: Context, public baseConfig: BaseAIConfig = {}) {
    super(ctx, 'ai')
    const mcpPath = baseConfig.mcp === true ? '/mcp' : typeof baseConfig.mcp === 'string' ? baseConfig.mcp : baseConfig.mcp === false ? undefined : '/mcp'
    if (mcpPath) {
      ctx.inject(['server'], (innerCtx) => {
        innerCtx.server.post(mcpPath, async (req) => {
          const body = await req.json()
          return this._handleJsonRpc(body)
        })
        innerCtx.server.get(mcpPath, async () => {
          const pkg = readJSON(join(innerCtx.cormi.cwd, 'package.json'))
          return Response.json({
            name: pkg?.name ?? 'cormi-app',
            protocol: 'mcp',
            tools: this.tools().map(({ name, description, input }) => ({
              name,
              description,
              inputSchema: input ?? { type: 'object', properties: {} },
            })),
          })
        })
      })
    }
  }

  /** Complete a conversation in one shot (executing any tool calls that have a `handler`). */
  protected abstract _complete(messages: AIMessage[], options: ChatOptions, tools: AITool[]): Promise<ChatResult>

  /** Stream a conversation as `ChatChunk` events. */
  protected abstract _streamChunks(messages: AIMessage[], options: ChatOptions, tools: AITool[]): AsyncGenerator<ChatChunk, void, unknown>

  /** Register a tool on `ctx.ai` (disposed when the calling plugin unloads). */
  tool(name: string, tool: Omit<AITool, 'name'>) {
    const entry: AITool = { name, ...tool }
    return this.ctx.effect(() => {
      if (this._tools.has(name)) throw new Error(`AI tool ${name} is registered twice`)
      this._tools.set(name, entry)
      return () => {
        if (this._tools.get(name) === entry) this._tools.delete(name)
      }
    }, `ctx.ai.tool(${JSON.stringify(name)})`)
  }

  /** All tools available on `ctx.ai`: custom tools plus `server/api` routes (unless `apiTools: false`). */
  tools(): AITool[] {
    const map = new Map<string, AITool>()
    if (this.baseConfig.apiTools !== false) {
      for (const tool of buildApiTools(this.ctx)) map.set(tool.name, tool)
    }
    for (const [name, tool] of this._tools) map.set(name, tool)
    return [...map.values()]
  }

  /** Execute a tool by name (used by `chat()` tool loops and the HTTP MCP endpoint). */
  async callTool(name: string, args: unknown): Promise<{ text: string; isError?: boolean }> {
    const tool = this.tools().find(t => t.name === name)
    if (!tool || !tool.handler) return { text: `unknown tool ${name}`, isError: true }
    try {
      const value = await tool.handler(args ?? {})
      return { text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? '' }
    } catch (error) {
      return { text: error instanceof Error ? error.message : String(error), isError: true }
    }
  }

  private _resolveTools(options?: ChatOptions): AITool[] {
    if (!options?.tools) return []
    if (options.tools === true) return this.tools()
    return options.tools
  }

  /** Send a prompt or message list and return the assistant reply (running tool handlers automatically). */
  async chat(input: string | AIMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const messages = normalizeMessages(input, options.system)
    const tools = this._resolveTools(options)
    const maxSteps = options.maxSteps ?? 5

    let step = 0
    while (true) {
      const result = await this._complete(messages, options, tools)
      messages.push({
        role: 'assistant',
        content: result.text,
        ...result.toolCalls?.length ? { toolCalls: result.toolCalls } : {},
      })
      if (!result.toolCalls?.length || step + 1 >= maxSteps) {
        return { ...result, messages }
      }
      const hasHandlers = result.toolCalls.some(call => tools.find(t => t.name === call.name)?.handler)
      if (!hasHandlers) return { ...result, messages }

      for (const call of result.toolCalls) {
        const target = tools.find(t => t.name === call.name)
        let output: string
        if (target?.handler) {
          try {
            const val = await target.handler(call.arguments)
            output = typeof val === 'string' ? val : JSON.stringify(val)
          } catch (error) {
            output = `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        } else {
          output = `Error: tool ${call.name} has no handler`
        }
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: output,
        })
      }
      step++
    }
  }

  /** Stream a conversation as `ChatChunk`s, SSE `Response` (`.toResponse()`), or text stream (`.textStream`). */
  stream(input: string | AIMessage[], options: ChatOptions = {}): ChatStream {
    const messages = normalizeMessages(input, options.system)
    const tools = this._resolveTools(options)
    return createChatStream(() => this._streamChunks(messages, options, tools))
  }

  /** Handle an MCP JSON-RPC 2.0 request over HTTP (`POST /mcp`). */
  private async _handleJsonRpc(message: any): Promise<Response> {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, { status: 400 })
    }
    if (message.id === undefined) {
      return new Response(null, { status: 202 })
    }
    const id = message.id
    try {
      switch (message.method) {
        case 'initialize': {
          const pkg = readJSON(join(this.ctx.cormi.cwd, 'package.json'))
          return Response.json({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: {
                name: pkg?.name ?? 'cormi-app',
                version: pkg?.version ?? '0.1.0',
              },
            },
          })
        }
        case 'ping':
          return Response.json({ jsonrpc: '2.0', id, result: {} })
        case 'tools/list':
          return Response.json({
            jsonrpc: '2.0',
            id,
            result: {
              tools: this.tools().map(({ name, description, input }) => ({
                name,
                description,
                inputSchema: input ?? { type: 'object', properties: {} },
              })),
            },
          })
        case 'tools/call': {
          const name = String(message.params?.name ?? '')
          const args = message.params?.arguments ?? {}
          const result = await this.callTool(name, args)
          return Response.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.text }],
              ...result.isError ? { isError: true } : {},
            },
          })
        }
        default:
          return Response.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${message.method}` },
          })
      }
    } catch (error) {
      return Response.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      })
    }
  }
}

export interface OpenAIConfig extends BaseAIConfig {
  /** Base URL of the OpenAI-compatible API (e.g. `https://api.openai.com/v1`, `https://api.deepseek.com/v1`, `http://localhost:11434/v1`) */
  baseURL: string
  /** API key (defaults to `process.env.OPENAI_API_KEY`) */
  apiKey?: string
  /** Default model name (e.g. `gpt-4o-mini`) */
  model: string
  /** Default temperature */
  temperature?: number
  /** Default max tokens */
  maxTokens?: number
}

function toOpenAIMessages(messages: AIMessage[]) {
  return messages.map((msg) => {
    if (msg.role === 'tool') {
      return { role: 'tool', tool_call_id: msg.toolCallId ?? '', content: msg.content }
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
      }
    }
    return { role: msg.role, content: msg.content }
  })
}

function toOpenAITools(tools: AITool[]) {
  if (!tools.length) return undefined
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input ?? { type: 'object', properties: {} },
    },
  }))
}

/**
 * `ctx.ai` backed by the OpenAI Chat Completions API (`/v1/chat/completions`),
 * compatible with OpenAI, DeepSeek, Qwen, Ollama, vLLM, OpenRouter, etc.
 */
export class OpenAI extends AI {
  constructor(ctx: Context, public config: OpenAIConfig) {
    super(ctx, config)
  }

  private _headers() {
    const key = this.config.apiKey ?? process.env.OPENAI_API_KEY
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (key) headers.authorization = `Bearer ${key}`
    return headers
  }

  private _endpoint() {
    return `${this.config.baseURL.replace(/\/+$/, '')}/chat/completions`
  }

  protected async _complete(messages: AIMessage[], options: ChatOptions, tools: AITool[]): Promise<ChatResult> {
    const fetcher = options.fetch ?? globalThis.fetch
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      messages: toOpenAIMessages(messages),
      stream: false,
    }
    const temp = options.temperature ?? this.config.temperature
    if (temp !== undefined) body.temperature = temp
    const maxTokens = options.maxTokens ?? this.config.maxTokens
    if (maxTokens !== undefined) body.max_tokens = maxTokens
    const openAiTools = toOpenAITools(tools)
    if (openAiTools) body.tools = openAiTools

    const response = await fetcher(this._endpoint(), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`)
    }
    const data = await response.json() as any
    const choice = data.choices?.[0]
    const message = choice?.message ?? {}
    const toolCalls: ToolCall[] | undefined = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((tc: any) => ({
          id: String(tc.id ?? ''),
          name: String(tc.function?.name ?? ''),
          arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
        }))
      : undefined
    return {
      text: String(message.content ?? ''),
      role: 'assistant',
      ...toolCalls?.length ? { toolCalls } : {},
      ...data.usage
        ? { usage: { inputTokens: Number(data.usage.prompt_tokens ?? 0), outputTokens: Number(data.usage.completion_tokens ?? 0) } }
        : {},
      finishReason: choice?.finish_reason ?? undefined,
      messages,
    }
  }

  protected async* _streamChunks(messages: AIMessage[], options: ChatOptions, tools: AITool[]): AsyncGenerator<ChatChunk, void, unknown> {
    const fetcher = options.fetch ?? globalThis.fetch
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      messages: toOpenAIMessages(messages),
      stream: true,
    }
    const temp = options.temperature ?? this.config.temperature
    if (temp !== undefined) body.temperature = temp
    const maxTokens = options.maxTokens ?? this.config.maxTokens
    if (maxTokens !== undefined) body.max_tokens = maxTokens
    const openAiTools = toOpenAITools(tools)
    if (openAiTools) body.tools = openAiTools

    const response = await fetcher(this._endpoint(), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
      signal: options.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`)
    }

    const partialTools = new Map<number, { id: string; name: string; args: string }>()
    let finishReason: string | undefined
    let usage: AIUsage | undefined

    for await (const raw of parseSse(response.body)) {
      const event = JSON.parse(raw)
      if (event.usage) {
        usage = {
          inputTokens: Number(event.usage.prompt_tokens ?? 0),
          outputTokens: Number(event.usage.completion_tokens ?? 0),
        }
      }
      const choice = event.choices?.[0]
      if (!choice) continue
      if (choice.finish_reason) finishReason = choice.finish_reason
      const delta = choice.delta
      if (typeof delta?.content === 'string' && delta.content) {
        yield { type: 'text', text: delta.content }
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = Number(tc.index ?? 0)
          const entry = partialTools.get(idx) ?? { id: '', name: '', args: '' }
          if (tc.id) entry.id = tc.id
          if (tc.function?.name) entry.name += tc.function.name
          if (tc.function?.arguments) entry.args += tc.function.arguments
          partialTools.set(idx, entry)
        }
      }
    }

    for (const entry of partialTools.values()) {
      let parsedArgs: Record<string, any> = {}
      try {
        parsedArgs = entry.args ? JSON.parse(entry.args) : {}
      } catch {}
      yield {
        type: 'tool-call',
        toolCall: { id: entry.id, name: entry.name, arguments: parsedArgs },
      }
    }
    yield { type: 'done', ...usage ? { usage } : {}, ...finishReason ? { finishReason } : {} }
  }
}

export interface AnthropicConfig extends BaseAIConfig {
  /** Base URL of the Anthropic API (default `https://api.anthropic.com`) */
  baseURL: string
  /** API key (defaults to `process.env.ANTHROPIC_API_KEY`) */
  apiKey?: string
  /** Default model name (e.g. `claude-sonnet-4-5-20250929`) */
  model: string
  /** Default max tokens (required by Anthropic, default `4096`) */
  maxTokens: number
  /** Default temperature */
  temperature?: number
}

function toAnthropicPayload(messages: AIMessage[], tools: AITool[]) {
  const systemParts: string[] = []
  const converted: any[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content)
    } else if (msg.role === 'tool') {
      converted.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.toolCallId ?? '', content: msg.content }],
      })
    } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const content: any[] = []
      if (msg.content) content.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} })
      }
      converted.push({ role: 'assistant', content })
    } else {
      converted.push({ role: msg.role, content: msg.content })
    }
  }
  const anthropicTools = tools.length
    ? tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input ?? { type: 'object', properties: {} },
      }))
    : undefined
  return {
    system: systemParts.length ? systemParts.join('\n\n') : undefined,
    messages: converted,
    tools: anthropicTools,
  }
}

/** `ctx.ai` backed by the Anthropic Messages API (`/v1/messages`). */
export class Anthropic extends AI {
  constructor(ctx: Context, public config: AnthropicConfig) {
    super(ctx, config)
  }

  private _headers() {
    const key = this.config.apiKey ?? process.env.ANTHROPIC_API_KEY
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    }
    if (key) headers['x-api-key'] = key
    return headers
  }

  private _endpoint() {
    const base = this.config.baseURL.replace(/\/+$/, '')
    return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`
  }

  protected async _complete(messages: AIMessage[], options: ChatOptions, tools: AITool[]): Promise<ChatResult> {
    const fetcher = options.fetch ?? globalThis.fetch
    const { system, messages: conv, tools: anthTools } = toAnthropicPayload(messages, tools)
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
      messages: conv,
      stream: false,
    }
    if (system) body.system = system
    const temp = options.temperature ?? this.config.temperature
    if (temp !== undefined) body.temperature = temp
    if (anthTools) body.tools = anthTools

    const response = await fetcher(this._endpoint(), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
      signal: options.signal,
    })
    if (!response.ok) {
      throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`)
    }
    const data = await response.json() as any
    const blocks: any[] = Array.isArray(data.content) ? data.content : []
    const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('')
    const toolCalls: ToolCall[] = blocks
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: String(b.id), name: String(b.name), arguments: (b.input ?? {}) as Record<string, any> }))

    return {
      text,
      role: 'assistant',
      ...toolCalls.length ? { toolCalls } : {},
      ...data.usage
        ? { usage: { inputTokens: Number(data.usage.input_tokens ?? 0), outputTokens: Number(data.usage.output_tokens ?? 0) } }
        : {},
      finishReason: data.stop_reason ?? undefined,
      messages,
    }
  }

  protected async* _streamChunks(messages: AIMessage[], options: ChatOptions, tools: AITool[]): AsyncGenerator<ChatChunk, void, unknown> {
    const fetcher = options.fetch ?? globalThis.fetch
    const { system, messages: conv, tools: anthTools } = toAnthropicPayload(messages, tools)
    const body: Record<string, unknown> = {
      model: options.model ?? this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? 4096,
      messages: conv,
      stream: true,
    }
    if (system) body.system = system
    const temp = options.temperature ?? this.config.temperature
    if (temp !== undefined) body.temperature = temp
    if (anthTools) body.tools = anthTools

    const response = await fetcher(this._endpoint(), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(body),
      signal: options.signal,
    })
    if (!response.ok || !response.body) {
      throw new Error(`Anthropic API error (${response.status}): ${await response.text()}`)
    }

    const partialTools = new Map<number, { id: string; name: string; json: string }>()
    let inputTokens = 0
    let outputTokens = 0
    let finishReason: string | undefined

    for await (const raw of parseSse(response.body)) {
      let event: any
      try {
        event = JSON.parse(raw)
      } catch {
        continue
      }
      if (event.type === 'message_start' && event.message?.usage) {
        inputTokens = Number(event.message.usage.input_tokens ?? 0)
        outputTokens = Number(event.message.usage.output_tokens ?? 0)
      } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        partialTools.set(Number(event.index ?? 0), {
          id: String(event.content_block.id ?? ''),
          name: String(event.content_block.name ?? ''),
          json: '',
        })
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          yield { type: 'text', text: delta.text }
        } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const entry = partialTools.get(Number(event.index ?? 0))
          if (entry) entry.json += delta.partial_json
        }
      } else if (event.type === 'message_delta') {
        if (event.delta?.stop_reason) finishReason = event.delta.stop_reason
        if (event.usage?.output_tokens !== undefined) outputTokens = Number(event.usage.output_tokens)
      }
    }

    for (const entry of partialTools.values()) {
      let parsedArgs: Record<string, any> = {}
      try {
        parsedArgs = entry.json ? JSON.parse(entry.json) : {}
      } catch {}
      yield {
        type: 'tool-call',
        toolCall: { id: entry.id, name: entry.name, arguments: parsedArgs },
      }
    }
    yield {
      type: 'done',
      ...inputTokens || outputTokens ? { usage: { inputTokens, outputTokens } } : {},
      ...finishReason ? { finishReason } : {},
    }
  }
}

export interface Config extends BaseAIConfig {
  /** Provider implementation (`openai` or `anthropic`) */
  provider: 'openai' | 'anthropic'
  /** API base URL (defaults to OpenAI or Anthropic endpoint) */
  baseURL?: string
  /** API key (defaults to `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) */
  apiKey?: string
  /** Default model name */
  model?: string
  temperature?: number
  maxTokens: number
}

export const name = 'ai'

export const Config: Schema<Config> = Schema.object({
  provider: Schema.union(['openai', 'anthropic'] as const).default('openai').description('the AI provider implementation (openai or anthropic)'),
  baseURL: Schema.string().description('the endpoint of the AI service, e.g. https://api.openai.com/v1'),
  apiKey: Schema.string().role('secret').description('the API key (defaults to OPENAI_API_KEY or ANTHROPIC_API_KEY)'),
  model: Schema.string().description('the default model name'),
  temperature: Schema.number().description('the default sampling temperature'),
  maxTokens: Schema.natural().default(4096).description('the default maximum output tokens'),
  mcp: Schema.union([Schema.boolean(), Schema.string()]).default('/mcp').description('expose server/api and ctx.ai tools at this MCP HTTP path, or false'),
  apiTools: Schema.boolean().default(true).description('automatically expose server/api routes as MCP tools'),
})

/**
 * The AI service (`ctx.ai`). Like `ctx.cache` and `ctx.storage`, it runs when
 * the app serves (`cormi dev`, `cormi start`, `createApp()`), not during builds.
 */
export function apply(ctx: Context, config: Config) {
  if (!ctx.cormi.serving) return
  if (config.provider === 'anthropic') {
    ctx.plugin(Anthropic, {
      ...config,
      baseURL: config.baseURL ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      model: config.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929',
    })
  } else {
    ctx.plugin(OpenAI, {
      ...config,
      baseURL: config.baseURL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: config.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    })
  }
}
