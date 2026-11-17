import { Anthropic, type AnthropicConfig } from '@cormijs/ai'
import { Schema } from '@cormijs/core'
import { Context } from 'cordis'

export interface Config extends AnthropicConfig {}
export { Anthropic }

export const name = 'ai'

export const Config: Schema<AnthropicConfig> = Schema.object({
  baseURL: Schema.string().default(process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').description('the endpoint of the Anthropic API'),
  apiKey: Schema.string().role('secret').description('the API key (defaults to ANTHROPIC_API_KEY)'),
  model: Schema.string().default(process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929').description('the default Claude model name'),
  maxTokens: Schema.natural().default(4096).description('the default maximum output tokens'),
  temperature: Schema.number().description('the default sampling temperature'),
  mcp: Schema.union([Schema.boolean(), Schema.string()]).default('/mcp').description('expose server/api and ctx.ai tools at this MCP HTTP path, or false'),
  apiTools: Schema.boolean().default(true).description('automatically expose server/api routes as MCP tools'),
})

/** Provide `ctx.ai` using Anthropic Claude when the app serves. */
export function apply(ctx: Context, config: AnthropicConfig) {
  if (!ctx.cormi.serving) return
  ctx.plugin(Anthropic, config)
}
