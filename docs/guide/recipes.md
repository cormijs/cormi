# 常用任务手册（Recipes）

按任务组织的实战步骤：照着做就能完成功能并验证结果，适合开发者与 AI Agent 查阅。

---

## 任务一：加一个接口（Add an API Route）

### 1. 创建接口文件

`server/api/` 下的文件按路径映射为接口（默认前缀 `/api`）：
- `server/api/todos/index.ts` → `/api/todos`
- `server/api/todos/[id].ts` → `/api/todos/:id`
- `server/api/files/[...key].ts` → `/api/files/*key`

运行生成器或直接新建文件：

```sh
cormi g api todos/[id]
```

```ts [server/api/todos/[id].ts]
import type { ApiContext, ApiRequest } from '@cormijs/cormi'

// 1. 声明用到的服务；服务就绪前接口返回 503
export const inject = ['database']

type Params = { id: string }

/** GET /api/todos/:id */
export async function GET(request: Request, { params, ctx }: ApiContext<Params>) {
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo ?? Response.json({ error: 'not found' }, { status: 404 })
}

/** PATCH /api/todos/:id */
export async function PATCH(
  request: ApiRequest<{ title?: string; done?: boolean }>,
  { params, ctx }: ApiContext<Params>,
) {
  const { title, done } = await request.json()
  const { matched } = await ctx.database.set('todo', { id: Number(params.id) }, {
    ...typeof title === 'string' && { title },
    ...typeof done === 'boolean' && { done },
  })
  if (!matched) return Response.json({ error: 'not found' }, { status: 404 })
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo
}
```

### 2. 在页面中带类型调用

`src/.cormi/api.d.ts` 会自动根据 `server/api/**` 生成类型，前端用 `api` 调用时自动推导路径、请求体和返回值类型：

```tsx [src/pages/index.tsx]
import { api } from '@cormijs/cormi/client'

// 路径式调用或 Hono RPC 链式调用均可推导类型
const todo = await api.get(`/api/todos/${id}`)
const updated = await api.patch(`/api/todos/${id}`, { done: !todo.done })
// 或：await api.todos[':id'].patch({ done: true }, { param: { id } })
```

### 3. 验证

```sh
cormi check   # 检查类型、inject 声明与跨边界导入
```

或在进程内直接请求接口（不启动服务、不占端口）：

```ts
import { createApp } from '@cormijs/cormi'

const app = await createApp()
const res = await app.fetch('/api/todos/1', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ done: true }),
})
console.log(res.status, await res.json())
await app.close()
```

---

## 任务二：加一张表（Add a Database Table）

### 1. 确认 `cormi.yml` 已启用数据库与驱动

```yaml [cormi.yml]
- name: '@cormijs/database'
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
```

### 2. 确认 `server/env.d.ts` 引用了数据库类型

```ts [server/env.d.ts]
/// <reference types="@cormijs/database" />
```

### 3. 新建模型文件 `server/models/<name>.ts`

运行 `cormi g model post`（会自动补齐 `server/env.d.ts`）或手动创建：

```ts [server/models/post.ts]
import type { Context } from '@cormijs/cormi'

export interface Post {
  id: number
  title: string
  content: string
  published: boolean
  createdAt: Date
}

// 声明合并必须写在 @cormijs/database 上
declare module '@cormijs/database' {
  interface Tables {
    post: Post
  }
}

export const inject = ['model']

export function apply(ctx: Context) {
  ctx.model.extend('post', {
    id: 'unsigned',
    title: 'string',
    content: 'text',
    published: 'boolean',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    indexes: [['published', 'createdAt']],
  })
}
```

### 4. 在接口或页面 `loader` 中读写表

- **在 `server/api` 中**：`export const inject = ['database']`，调用 `ctx.database.get('post', ...)`、`ctx.database.create('post', ...)`。
- **在页面 `loader` 中**：`context.ctx.database.get('post', ...)`。
- **在页面组件中需要行的类型时**：只导入类型 `import type { Post } from '../../server/models/post'`。

### 5. 验证

1. 运行 `cormi check`，确认表声明合并生效且无类型错误。
2. 若开发服务器正在运行，可通过 `cormi mcp` 的 `database_tables`、`database_write`、`database_query` 工具直接查看表结构与读写测试数据。

---

## 任务三：加登录与鉴权（Add Authentication）

### 1. 在 `cormi.yml` 中启用缓存、会话与鉴权

`@cormijs/plugin-session` 依赖 `cache` 与 `middleware`；`@cormijs/plugin-auth` 依赖 `session` 与 `middleware`：

```yaml [cormi.yml]
- name: '@cormijs/cache'
- name: '@cormijs/plugin-session'
- name: '@cormijs/plugin-auth'
```

### 2. 在 `server/env.d.ts` 中引用类型并扩展 `User`

```ts [server/env.d.ts]
/// <reference types="@cormijs/cache" />
/// <reference types="@cormijs/plugin-session" />
/// <reference types="@cormijs/plugin-auth" />

declare module '@cormijs/plugin-auth' {
  interface User {
    id: number
    name: string
    role: 'admin' | 'member'
  }
}
```

### 3. 实现登录、登出与当前用户接口

::: code-group

```ts [server/api/login.ts]
import type { ApiContext, ApiRequest } from '@cormijs/cormi'

export const inject = ['auth', 'database']

export async function POST(
  request: ApiRequest<{ name: string; password: string }>,
  { ctx, state }: ApiContext,
) {
  const { name, password } = await request.json()
  const [account] = await ctx.database.get('user', { name })
  if (!account || !await ctx.auth.verify(password, account.passwordHash)) {
    return Response.json({ error: 'invalid credentials' }, { status: 401 })
  }
  ctx.auth.login(state, { id: account.id, name: account.name, role: account.role })
  return state.user
}
```

```ts [server/api/logout.ts]
import type { ApiContext } from '@cormijs/cormi'

export const inject = ['auth']

export function POST(request: Request, { ctx, state }: ApiContext) {
  ctx.auth.logout(state)
  return new Response(null, { status: 204 })
}
```

```ts [server/api/me.ts]
import type { ApiContext } from '@cormijs/cormi'

// 未登录返回 401；也可写函数 (user: User) => user.role === 'admin'（不满足返回 403）
export const auth = true

export function GET(request: Request, { state }: ApiContext) {
  return state.user
}
```

:::

### 4. 在页面 `loader` 中保护路由

```tsx [src/pages/admin.tsx]
import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, redirect, useLoaderData } from '@cormijs/react/client'

export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  if (context.state.user?.role !== 'admin') throw redirect('/login')
  return { user: context.state.user }
}

export default function Admin() {
  const { user } = useLoaderData<typeof loader>()
  return <h1>Welcome, {user.name}</h1>
}
```

### 5. 验证

- 运行 `cormi check`。
- 用 `cormi mcp` 的 `request` 工具（自带持久 Cookie Jar 会话）：先 `POST /api/login`，再请求 `GET /api/me` 验证登录态。

---

## 任务四：加 AI 接口与暴露 MCP 工具（Add AI & MCP）

### 1. 在 `cormi.yml` 与 `server/env.d.ts` 中启用 `@cormijs/ai`

```yaml [cormi.yml]
- name: '@cormijs/ai'       # 或 @cormijs/ai-openai、@cormijs/ai-anthropic
  config:
    model: gpt-4o-mini
    mcp: /mcp               # 自动将 server/api 暴露为 HTTP MCP 端点
```

```ts [server/env.d.ts]
/// <reference types="@cormijs/ai" />
```

### 2. 编写流式 AI 接口

```ts [server/api/chat.ts]
import type { ApiContext, ApiRequest } from '@cormijs/cormi'

export const inject = ['ai']

// 该接口无需作为 MCP 工具暴露给自身
export const mcp = false

export async function POST(request: ApiRequest<{ prompt: string }>, { ctx }: ApiContext) {
  const { prompt } = await request.json()
  // 直接返回 ChatStream 即自动以 text/event-stream (SSE) 流式响应
  return ctx.ai.stream(prompt, {
    system: 'You are a helpful assistant.',
    tools: true, // 允许模型调用应用自身的 MCP 工具
  })
}
```
