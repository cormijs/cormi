# 设计：后端服务

> 状态：设计已定，按阶段实施中。本页记录决策与理由。

目标：Cormi 不只渲染页面，也能独立作为后端服务——连接数据库、编写接口，并以插件的方式接入各种中间件与基础服务。

## 一个模型：抽象服务与可替换的实现

后端的每种基础能力都是一个 cordis 服务，由可替换的插件实现。这与 Cormi 对打包器、UI 框架的做法（`ctx.bundler`、`ctx.renderer`）相同，也与 koishi 的数据库相同：

| 服务 | 作用 | 实现（`cormi.yml` 中的一行） |
|---|---|---|
| `ctx.database`、`ctx.model` | 表结构、查询、事务 | minato 的驱动：`@minatojs/driver-sqlite`、`-mysql`、`-postgres`、`-mongo`、`-memory` |
| `ctx.cache` | 带过期时间的键值缓存 | 内存、Redis、数据库 |
| `ctx.storage` | 文件与对象存储 | 本地磁盘、S3 兼容服务 |
| `ctx.session`、`ctx.auth` | 会话、登录状态、接口保护 | 会话存储用 `ctx.cache`（没有缓存服务时存在内存） |

依赖某个服务的插件 `inject` 它；换一个实现（SQLite 换成 PostgreSQL，内存缓存换成 Redis），业务代码不变。

## 已定的决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 数据层 | minato | cordis 原生的类型驱动 ORM：`Database` 是服务，驱动是插件，表的类型由声明合并得到（`interface Tables`）；koishi 用的就是它 |
| 数据库驱动 | 直接使用 minato 的驱动包 | 它们本来就是 cordis 插件，写进 `cormi.yml` 即可；Cormi 只提供 `@cormijs/database`（服务、日志服务、控制台页面、生成器），registry 把 minato 驱动作为外部包收录。维护量最小 |
| 接口代码 | 原生运行在 Node | `server/api/**` 由 tsx 直接加载，与工作区插件一样运行源码、按文件热重载；每个接口模块可以 `export const inject`，handler 拿到注入了这些服务的 `ctx`。不经过打包器：纯后端应用不需要 Vite 或 Rsbuild |
| 页面的服务端代码 | 通过 `context` 拿到 `ctx` | `loader` 仍在服务端入口（打包后的代码）里运行，Cormi 在调用时传入 `context: { ctx, state }` |
| 中间件 | 基于 fetch，有顺序与路径 | `(request, context, next) => Response`；`order` 决定先后，`path` 限定作用范围；会话、登录用户等放在请求级的 `state` 中，中间件、接口与 `loader` 共享 |
| 第一批能力 | 数据库与接口、会话与鉴权、中间件顺序与常用中间件、缓存、对象存储 | — |

## 服务端代码：`server/`

```
server/
├─ index.ts            应用自己的 Node 插件（与 src/app.ts 对称，自动加载）
├─ models/*.ts         表结构：每个文件是一个插件，自动加载
└─ api/**              接口：users/[id].ts → /api/users/:id
```

```ts
// server/models/user.ts
import type { Context } from '@cormijs/cormi'

declare module 'minato' {
  interface Tables {
    user: { id: number; name: string; createdAt: Date }
  }
}

export const inject = ['model']

export function apply(ctx: Context) {
  ctx.model.extend('user', { id: 'unsigned', name: 'string', createdAt: 'timestamp' }, { autoInc: true })
}
```

```ts
// server/api/users/[id].ts
import type { ApiContext } from '@cormijs/cormi'

export const inject = ['database']

export async function GET(request: Request, { params, ctx }: ApiContext) {
  const [user] = await ctx.database.get('user', { id: Number(params.id) })
  return user ?? new Response(null, { status: 404 })
}
```

- 每个接口模块是一个子插件：`inject` 的服务就绪之前，请求得到 503 并说明在等哪个服务；服务消失时，接口随之下线。
- 修改接口文件只重载这一个插件（`@cordisjs/plugin-hmr`）；新增、删除文件由目录监听处理。
- 生产环境同样由 tsx 运行源码（`cormi start`），不需要构建步骤。
- 页面的 `loader` 通过参数中的 `context.ctx` 访问服务、`context.state` 访问会话与登录用户。
- `cormi g api users/[id]`、`cormi g model user` 生成上面的文件。

## 数据库：`@cormijs/database`

```yaml
- name: '@cormijs/preset'
- name: '@cormijs/database'
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
```

- 提供 minato 的 `Database` 服务（`ctx.model`、`ctx.database`），并提供驱动需要的 `logger` 服务（`@cordisjs/plugin-logger`）——minato 4 的驱动在 cordis rc.12 上把它作为必需的依赖。
- 表结构在注入 `model`（查询时还有 `database`）的插件里声明：驱动就绪之前声明的表不会被创建，这是 minato 与 cordis rc.12 的已知行为，`server/models/*.ts` 的约定正好满足它。
- 控制台的“数据库”页面：表、字段、索引，按页浏览与编辑数据。
- registry 收录 minato 的驱动（外部包），市场里可以直接安装。

## 中间件

```ts
ctx.middleware.use(async (request, { state }, next) => {
  const response = await next()
  response.headers.set('x-powered-by', 'cormi')
  return response
}, { order: 10, path: '/api' })
```

- 基于 fetch：中间件收到 `Request`，返回 `Response`；`next()` 是后续的中间件、路由与页面。
- `order` 小的在外层（先执行、后返回），默认 0；`path` 限定前缀。
- `state` 是请求级的对象，由插件以声明合并扩展（会话插件加入 `state.session`，鉴权插件加入 `state.user`），接口与 `loader` 读取同一个对象。
- 官方中间件插件：`@cormijs/plugin-cors`、`@cormijs/plugin-security`（安全相关的响应头）、`@cormijs/plugin-rate-limit`（计数存在 `ctx.cache`）。

## 会话与鉴权

- `@cormijs/plugin-session`：cookie 会话，`state.session` 可读写，存储在 `ctx.cache`（没有缓存服务时在内存中）。
- `@cormijs/plugin-auth`：`ctx.auth.login(state, user)`、`logout()`，`state.user` 是当前用户；接口模块 `export const auth = true` 即要求登录（否则 401）；提供密码散列与校验（scrypt）。用户存在哪里由应用决定。

## 缓存与对象存储

```ts
await ctx.cache.set('captcha', id, code, 5 * 60 * 1000)
const code = await ctx.cache.get('captcha', id)

const { url } = await ctx.storage.put(`avatars/${id}.png`, file, { contentType: 'image/png' })
```

- `@cormijs/cache` 提供 `ctx.cache`（按表分区，带过期时间），驱动：`@cormijs/cache-memory`（默认）、`@cormijs/cache-redis`、`@cormijs/cache-database`（存在 minato 中）。
- `@cormijs/storage` 提供 `ctx.storage`（`put`、`get`、`delete`、`list`、`url`），驱动：`@cormijs/storage-local`（目录，由 `ctx.server` 提供公开访问）、`@cormijs/storage-s3`（S3 兼容：AWS、R2、MinIO、OSS 等）。

## 纯后端应用

```yaml
- name: '@cormijs/preset'      # 不写打包器与 UI 框架：没有页面
- name: '@cormijs/database'
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
- name: '@cormijs/plugin-session'
- name: '@cormijs/plugin-auth'
```

`cormi dev` 运行接口与控制台，`cormi start` 在生产环境运行。控制台自带 Vite 与 React，纯后端应用里同样可用；它的“接口”页面列出所有路由（方法、路径、来自哪个插件），可以直接发请求试用。

## 实施阶段

1. **服务端基础**：`server/` 约定与原生运行的接口（`inject`、热重载、503）；`loader` 的 `context`；`ctx.middleware`（顺序、路径、`state`）；纯后端应用与 `cormi start`；`@cormijs/database`；示例 `with-api` 与 e2e。
2. **缓存**：`@cormijs/cache` 与内存、Redis、数据库驱动。
3. **会话、鉴权与常用中间件**：session、auth、cors、security、rate-limit。
4. **对象存储**：`@cormijs/storage` 与本地、S3 驱动。
5. **控制台与文档**：数据库与接口页面，registry 收录 minato 驱动，指南。
