import { OpenAI, type OpenAIConfig } from '@cormijs/ai'
import { Schema } from '@cormijs/core'
import { Context } from 'cordis'

export interface Config extends OpenAIConfig {}
export { OpenAI }

export const name = 'ai'

export const Config: Schema<OpenAIConfig> = Schema.object({
  baseURL: Schema.string().default(process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').description('the endpoint of the OpenAI-compatible API'),
  apiKey: Schema.string().role('secret').description('the API key (defaults to OPENAI_API_KEY)'),
  model: Schema.string().default(process.env.OPENAI_MODEL ?? 'gpt-4o-mini').description('the default model name'),
  temperature: Schema.number().description('the default sampling temperature'),
  maxTokens: Schema.natural().description('the default maximum output tokens'),
  mcp: Schema.union([Schema.boolean(), Schema.string()]).default('/mcp').description('expose server/api and ctx.ai tools at this MCP HTTP path, or false'),
  apiTools: Schema.boolean().default(true).description('automatically expose server/api routes as MCP tools'),
})

/** Provide `ctx.ai` using OpenAI or an OpenAI-compatible service when the app serves. */
export function apply(ctx: Context, config: OpenAIConfig) {
  if (!ctx.cormi.serving) return
  ctx.plugin(OpenAI, config)
}
