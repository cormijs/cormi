# 服务端代码与接口

`server/` 是应用的服务端，由 Node 运行，不经过页面的打包器，所以没有页面的后端服务同样适用：`cormi dev` 直接运行它的源码，`cormi build` 把它编译到 `dist/node`，`cormi start` 在生产环境运行编译后的代码。它只在应用提供服务时运行，见 [页面与服务端](/guide/sides)。

```
server/
├─ index.ts            应用在服务端的插件，例如中间件
├─ env.d.ts            服务端用到的服务的类型
├─ models/*.ts         表结构，每个文件是一个插件
└─ api/**              接口：api/users/[id].ts 是 /api/users/:id
```

`server/index.ts` 与 `server/models/*.ts` 是普通的 cordis 插件，按这个顺序加载：导出 `apply`（以及 `inject`、`Config`），或默认导出一个插件。

## 接口

`server/api` 下的每个模块是一个接口：

| 文件 | 路径 |
|---|---|
| `server/api/users/index.ts` | `/api/users` |
| `server/api/users/[id].ts` | `/api/users/:id` |
| `server/api/files/[...path].ts` | `/api/files/*path` |

模块按 HTTP 方法导出处理器（`GET`、`POST`……），或导出处理所有方法的 `default`。处理器接收标准的 `Request` 与 `{ params, ctx, state }`，返回 `Response`；返回其他值时以 JSON 发送：

::: code-group

```ts [server/api/todos/[id].ts]
import type { ApiContext } from '@cormijs/cormi'

// 处理器用到的服务
export const inject = ['database']

export async function GET(request: Request, { params, ctx }: ApiContext<{ id: string }>) {
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo ?? Response.json({ error: 'not found' }, { status: 404 })
}
```

:::

| 参数 | 说明 |
|---|---|
| `params` | 路径参数，`[...path]` 是数组 |
| `ctx` | 这个接口的上下文：可以使用 `inject` 声明的服务 |
| `state` | 请求级的状态，与中间件、页面的 `loader` 共享，见 [中间件](/guide/middleware#请求状态) |
| `ip` | 客户端的地址 |

- 每个接口模块是一个插件：`inject` 的服务就绪之前，请求得到 503，并说明在等哪个服务；服务消失时，接口随之等待。没有声明的服务不能使用（cordis 会报 `cannot get property "database" without inject`）。
- 参数更少的路由优先匹配：`/api/users/me` 先于 `/api/users/:id`。
- 模块没有导出请求方法对应的处理器时返回 405，并带上 `allow` 头；没有匹配的接口时返回 404。

要求登录的接口导出 `auth`（`true`，或对用户的检查），见 [会话、鉴权与常用中间件](/guide/auth#要求登录的接口)。

开发阶段需要假数据时，用 [`@cormijs/plugin-mock`](/plugins/build#mock)，它的路由优先于真实的接口。

## 服务端的类型

服务端代码用到的服务（`ctx.database`、`ctx.model`……）由插件包声明类型。`server/env.d.ts` 引用这些包，它们的类型就在整个服务端生效：

::: code-group

```ts [server/env.d.ts]
// The types of the services the server code uses: a line for each plugin of cormi.yml that provides one
/// <reference types="@cormijs/database" />
```

:::

新增一个提供服务的插件时，在这里加一行；`cormi g model` 会自动加上数据库的这一行。

请求状态（`State`）与表（`Tables`）的类型通过声明合并扩展，写在设置它们的文件里：

```ts
declare module '@cormijs/cormi' {
  interface State {
    requestId: string
  }
}
```

## 前后端类型打通（Typed RPC）

`cormi dev`、`cormi setup`、`cormi build` 与 `cormi check` 会自动根据 `server/api/**` 生成 `src/.cormi/api.d.ts`，将接口的路径、HTTP 方法、路径参数、请求体（可通过 `ApiRequest<Body>` 或 `ApiContext<Params, Body>` 标注）以及返回值类型推导到前端客户端，而不会把服务端代码打进前端 bundle。

在页面中使用 `@cormijs/cormi/client`（或 `@cormijs/react/client`、`@cormijs/vue/client`）导出的 `api`，同时支持路径式调用与 Hono RPC 风格的链式调用：

```ts
import { api } from '@cormijs/cormi/client'

// 路径式调用：自动校验路径与方法，并推导返回值类型
const todos = await api.get('/api/todos')
const created = await api.post('/api/todos', { title: 'Learn Cormi' })
const updated = await api.patch(`/api/todos/${created.id}`, { done: true })

// Hono RPC 风格链式调用：$get/$post 返回 TypedResponse<T>，get/post 直接返回解析后的数据
const res = await api.todos.$get()
const list = await res.json()
const item = await api.todos[':id'].patch({ done: true }, { param: { id: created.id } })
```

如果服务端接口需要返回特定状态码（如 `201`）同时保留准确的返回值类型，可以使用 `Response.json(data, { status: 201 })` 或 `json(data, 201)`；返回错误状态（4xx/5xx）的 `Response.json(...)` 会自动从正常响应类型推导中排除。`@cormijs/plugin-request` 的 `request()` 同样会自动推导 `ApiRoutes` 中的路径与返回值类型。

## 进程内测试（`createApp`）

不需要启动开发服务器或绑定端口，可以直接在单元测试中用 `createApp()` 以 `test` 模式加载应用，并通过 `app.fetch(request)` 在进程内调用完整的中间件、鉴权与接口链路：

```ts
import { createApiClient, createApp } from '@cormijs/cormi'

const app = await createApp()
const res = await app.fetch('/api/todos', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'In-process test' }),
})

// 也可以将类型化客户端绑定到 app.fetch
const client = createApiClient({ fetch: app.fetch })
const todos = await client.get('/api/todos')

await app.close()
```

## 热重载

在 `cormi dev` 下，`server/` 中的文件变化时，服务端代码整体重新加载：旧的插件先卸载，新的再加载，所以同一个服务不会被提供两次。`server/` 导入的应用内文件随之重新加载，`node_modules` 中的依赖保持不变。

## 生产环境

```sh
cormi build     # 编译 server/ 到 dist/node，接口的路由表一并确定
cormi start     # 运行 dist/node 中编译后的代码
```

`server/index.ts`、`server/models/*.ts` 与每个接口模块各自编译为一个模块，共用的代码（例如几个接口都导入的 `server/lib/db.ts`）放进公共 chunk，所以模块级的状态在生产环境同样只有一份；`node_modules` 中的依赖保持导入。生产环境不需要源码，见 [构建与部署](/guide/deploy)。

## 生成器

```sh
cormi g api todos/[id]     # server/api/todos/[id].ts
cormi g model todo         # server/models/todo.ts（需要 @cormijs/database）
```
