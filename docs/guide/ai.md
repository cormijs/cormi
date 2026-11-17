# AI Native 与 `@cormijs/ai`

Cormi 从脚手架、CLI、控制台、前后端类型边界到运行时服务都为 AI Agent 与 AI 应用开发做了原生设计。

## 1. 让 Agent 现学：`AGENTS.md` 与 `llms.txt`

- `pnpm create @cormijs` 生成的每个项目都自带 `AGENTS.md`，写明当前项目的 `src/` 与 `server/` 边界、`inject` 规则、`server/env.d.ts` 声明合并、常用命令与验证方式。
- 官网提供 [`/llms.txt`](/llms.txt)、[`/llms-full.txt`](/llms-full.txt)、[英文 API 参考](/reference/api-en)与[常用任务手册](/guide/recipes)。

## 2. `cormi info` 与 `cormi mcp`：把控制台变成 Agent 的眼睛和手

### `cormi info --json`

一次输出应用类型（`web`、`api`、`fullstack`、`ssr`）、打包器与 UI 框架、页面路由、服务端接口、服务与插件状态：

```sh
cormi info --json
```

### `cormi mcp`

`cormi mcp` 启动标准 Model Context Protocol（MCP）stdio 服务器，自动连接正在运行的 `cormi dev` 控制台（若未启动 `cormi dev`，则在进程内以 `test` 模式运行）：

```json
{
  "mcpServers": {
    "cormi": {
      "command": "npx",
      "args": ["cormi", "mcp"]
    }
  }
}
```

提供的内置工具：

| 工具 | 作用 |
|---|---|
| `overview` | 应用类型、技术栈、路由、服务与插件总览 |
| `diagnostics` | 当前失败或等待服务的插件（含原因）、503 接口与最近警告/错误日志 |
| `plugins` | 查询插件状态、配置、等待原因，或传入 `action`（`enable`、`disable`、`add`、`remove`、`configure`）直接修改 `cormi.yml` |
| `market` | 搜索插件市场（`query`），或安装插件包并自动写入 `cormi.yml`（`install`、`enable`） |
| `routes` | 页面路由、`server/api` 接口与插件注册的 HTTP 路由 |
| `logs` | 按级别、关键字或序号读取开发服务器日志 |
| `request` | 带着 Cookie 会话（`session`）请求应用接口，并返回请求期间产生的服务端日志 |
| `generate` | 列出或运行 `cormi g` 生成器（`page`、`component`、`api`、`model`、`plugin`） |
| `database_tables` | （启用 `@cormijs/database` 时）查看所有表结构、主键、索引与行数 |
| `database_query` | 按 Minato 条件查询表数据 |
| `database_write` | 创建、更新或删除表记录 |

插件也可以通过 `ctx.console.tool(name, { description, input, handler })` 为 Agent 注册自定义工具。

## 3. `cormi check` 与进程内测试

### `cormi check [--json]`

把类型检查、跨边界导入检查、插件状态、配置校验与声明合并检查合在一个命令里，每条问题都附带错误码（`CORMI_*`）与修复方法：

```sh
cormi check
cormi check --json
```

除了常规错误外，`cormi check` 还会主动报警“看起来没生效”的静默失败：
- `CORMI_CONFIG_UNKNOWN` / `CORMI_CONFIG_EMPTY`：`cormi.yml` 中未识别的配置键、空数组 `[]` 或空 `proxy: {}`；
- `CORMI_ENV_TYPES`：`server/` 使用了服务但 `server/env.d.ts` 漏写了 `/// <reference types="..." />`；
- `CORMI_DECLARATION_UNLOADED` / `CORMI_DECLARATION_TARGET`：`declare module` 所在文件未被 `tsconfig.json` 包含，或将 `Tables` / `User` / `SessionData` 写在了错误的模块名上；
- `CORMI_API_INJECT_MISSING`：接口中使用了 `ctx.database` 等服务却漏写了 `export const inject`。

### 进程内接口测试：`createApp()` 与 `app.fetch()`

无需启动开发服务器、无需监听端口，直接在进程内测试接口与中间件：

```ts
import { createApiClient, createApp } from '@cormijs/cormi'

const app = await createApp()
const res = await app.fetch('/api/todos')
const todos = await res.json()

// 也可以配合类型化客户端使用
const client = createApiClient({ fetch: app.fetch })
const created = await client.post('/api/todos', { title: 'Fast feedback' })

await app.close()
```

## 4. 前后端类型打通（Typed RPC）

`cormi dev`、`cormi setup`、`cormi build` 与 `cormi check` 会自动根据 `server/api/**` 生成 `src/.cormi/api.d.ts`，将每个接口的路径、HTTP 方法、路径参数、请求体（`ApiRequest<Body>`）与返回值类型推导到前端的 `api` 客户端：

```ts
import { api } from '@cormijs/cormi/client'

// 路径式调用
const todos = await api.get('/api/todos')
const todo = await api.post('/api/todos', { title: 'Hello' })
const updated = await api.patch(`/api/todos/${todo.id}`, { done: true })

// Hono RPC 风格链式调用
const res = await api.todos.$get()
const data = await res.json()
```

## 5. `@cormijs/ai`：用来写 AI 应用

`@cormijs/ai` 沿用 `@cormijs/cache` 与 `@cormijs/storage` 的设计：`ctx.ai` 是统一的抽象服务，OpenAI（及 DeepSeek、Qwen、Ollama 等兼容接口）与 Anthropic Claude 是可替换的实现。

```yaml [cormi.yml]
# 使用内置 OpenAI / Anthropic 实现
- name: '@cormijs/ai'
  config:
    provider: openai          # 或 anthropic
    model: gpt-4o-mini
    mcp: /mcp                 # 自动将 server/api 暴露为 HTTP MCP 端点

# 或者直接替换为独立实现包：
# - name: '@cormijs/ai-openai'
# - name: '@cormijs/ai-anthropic'
```

在 `server/env.d.ts` 中加入：

```ts [server/env.d.ts]
/// <reference types="@cormijs/ai" />
```

### 对话与流式响应

```ts [server/api/chat.ts]
import type { ApiContext, ApiRequest } from '@cormijs/cormi'

export const inject = ['ai']
export const mcp = false

export async function POST(request: ApiRequest<{ prompt: string; stream?: boolean }>, { ctx }: ApiContext) {
  const { prompt, stream } = await request.json()
  if (stream) {
    // 直接返回 ChatStream，自动作为 text/event-stream (SSE) 流式输出
    return ctx.ai.stream(prompt, { system: 'You are a concise assistant.' })
  }
  const { text, usage } = await ctx.ai.chat(prompt)
  return { text, usage }
}
```

### 将应用自身的 `server/api` 自动暴露为 MCP 工具

开启 `@cormijs/ai` 后：
1. `server/api/**` 下的每个接口会按 HTTP 方法、路径参数与 JSDoc 注释自动转换为 MCP 工具（可通过 `export const mcp = false` 排除，或通过 `export const mcp = { GET: { name, description, input } }` 自定义）。
2. 插件也可以通过 `ctx.ai.tool(name, { description, input, handler })` 注册工具。
3. 外部 Agent 可以通过 HTTP MCP 端点（默认 `POST /mcp`）直接调用 Cormi 应用的工具；应用内部调用 `ctx.ai.chat(prompt, { tools: true })` 时也能自动执行这些工具。
