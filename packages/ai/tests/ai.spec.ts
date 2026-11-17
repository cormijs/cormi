import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from '@cormijs/server'
import { Context } from 'cordis'
import { Cormi } from '@cormijs/core'
import { describe, expect, it } from 'vitest'
import { Anthropic, OpenAI } from '../src/index.ts'

const root = fileURLToPath(new URL('../../..', import.meta.url))

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${event}\n\n`))
      }
      controller.close()
    },
  })
}

describe('@cormijs/ai providers & streaming', () => {
  it('completes and streams with OpenAI, including automatic tool calling', async () => {
    const ctx = new Context()
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd: root, mode: 'test' })
    await ctx.plugin(OpenAI, {
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      mcp: false,
    })

    ctx.ai.tool('add', {
      description: 'Add two numbers',
      input: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
      handler: ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
    })

    let round = 0
    const mockFetch: typeof globalThis.fetch = async () => {
      round++
      if (round === 1) {
        return Response.json({
          choices: [{
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'add', arguments: JSON.stringify({ a: 7, b: 5 }) },
              }],
            },
          }],
        })
      }
      return Response.json({
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: '7 + 5 is 12.' },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 6 },
      })
    }

    const result = await ctx.ai.chat('What is 7 + 5?', { tools: true, fetch: mockFetch })
    expect(result.text).toBe('7 + 5 is 12.')
    expect(round).toBe(2)

    // Streaming response
    const stream = ctx.ai.stream('Count to 2', {
      fetch: async () => new Response(sseStream([
        JSON.stringify({ choices: [{ delta: { content: 'One, ' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'two!' }, finish_reason: 'stop' }] }),
        '[DONE]',
      ]), { status: 200 }),
    })
    expect(await stream.text()).toBe('One, two!')
    const sseRes = stream.toResponse()
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream')
    const sseBody = await sseRes.text()
    expect(sseBody).toContain('"text":"One, "')
    expect(sseBody).toContain('data: [DONE]')
  })

  it('completes and streams with Anthropic as a replaceable ctx.ai implementation', async () => {
    const ctx = new Context()
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd: root, mode: 'test' })
    await ctx.plugin(Anthropic, {
      baseURL: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 1024,
      mcp: false,
    })

    const result = await ctx.ai.chat('Hello Claude', {
      system: 'Be brief.',
      fetch: async () => Response.json({
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 4 },
      }),
    })
    expect(result.text).toBe('Hello from Claude!')
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4 })

    const stream = ctx.ai.stream('Stream test', {
      fetch: async () => new Response(sseStream([
        JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 5, output_tokens: 0 } } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Part A ' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Part B' } }),
        JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }),
      ]), { status: 200 }),
    })
    expect(await stream.text()).toBe('Part A Part B')
  })

  it('exposes the app server/api routes as MCP tools and serves POST /mcp', async () => {
    const app = await createApp({ cwd: join(root, 'examples/with-auth') })
    try {
      await app.ctx.plugin(OpenAI, {
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        mcp: '/mcp',
      })

      const tools = app.ctx.ai.tools()
      const names = tools.map(t => t.name)
      expect(names).toEqual(expect.arrayContaining(['post_login', 'post_logout', 'get_me', 'get_admin_stats']))

      // Call POST /mcp tools/list via HTTP
      const listRes = await app.fetch('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(listJson.result.tools.map((t: any) => t.name)).toContain('post_login')

      // Call post_login tool over POST /mcp
      const callRes = await app.fetch('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'post_login',
            arguments: { name: 'alice', password: 'cormi' },
          },
        }),
      })
      const callJson = await callRes.json()
      expect(JSON.parse(callJson.result.content[0].text)).toEqual({ name: 'alice', role: 'admin' })
    } finally {
      await app.close()
    }
  })
})
