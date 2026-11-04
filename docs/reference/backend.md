# 设计：后端服务

> 状态：设计已定，第 1 阶段（服务端基础、数据库、脚手架）已完成，其余按阶段实施中。本页记录决策与理由。

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
| 接口代码 | 原生运行在 Node | `server/api/**` 在 dev 下直接运行源码、热重载；每个接口模块可以 `export const inject`，handler 拿到注入了这些服务的 `ctx`。不经过页面的打包器：纯后端应用不需要 Vite 或 Rsbuild |
| 生产环境 | `cormi start` 运行编译后的代码 | `cormi build` 用 esbuild 把应用自己的 Node 代码（`server/`、本地插件、工作区插件包）编译到 `dist/node`；`start` 模式下插件树加载编译后的模块，不需要源码与 TypeScript。生产环境运行的就是构建、测试过的产物 |
| 页面的服务端代码 | 通过 `context` 拿到 `ctx` | `loader` 仍在服务端入口（打包后的代码）里运行，Cormi 在调用时传入 `context: { ctx, state }` |
| 中间件 | 基于 fetch，有顺序与路径 | `(request, context, next) => Response`；`order` 决定先后，`path` 限定作用范围；会话、登录用户等放在请求级的 `state` 中，中间件、接口与 `loader` 共享 |
| 第一批能力 | 数据库与接口、会话与鉴权、中间件顺序与常用中间件、缓存、对象存储 | — |
| 前后端的界限 | 页面（`src/`）与服务端（`server/`）是应用的两侧，只通过 HTTP、`loader` 的 `context` 与 `import type` 相遇；页面从 `server/` 导入值时构建失败 | 同一个仓库里写前后端，最大的负担是分不清代码在哪里运行、能用什么。把界限做成规则，由打包器检查，比文档里的约定更可靠 |
| 服务端何时运行 | 只在应用提供服务时（`cormi dev`、`cormi start`）：`ctx.cormi.serving`。`@cormijs/database` 在构建时不提供 `model`，注入它的驱动随之等待 | 构建页面不应依赖数据库：CI 与 Docker 的构建阶段通常连不上它 |
| 脚手架 | `@cormijs/create`（`pnpm create @cormijs`），按两侧组合出四种类型：前端、后端、前后端、服务端渲染；只询问已选的一侧需要的选择 | 类型不是配置，而是由 `cormi.yml` 与目录推出：应用可以从一种类型长成另一种 |

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

declare module '@cormijs/database' {
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
- `server/` 中的文件变化时，服务端代码整体重新加载（旧的插件先卸载）；导入的应用内文件通过模块代数（`?cormi-v=N`）一并重新加载，`node_modules` 不变。
- 生产环境运行 `cormi build` 编译后的代码（`cormi start`），接口的路由表在构建时确定。
- 服务端用到的服务的类型由 `server/env.d.ts` 引用（`/// <reference types="@cormijs/database" />`）：只做声明合并不会加载一个包的类型。
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

- `@cormijs/plugin-session`：cookie 会话，`state.session` 可读写，存储在 `ctx.cache`。会话要求有缓存服务，而不是在没有时退回内存：退回是悄悄的，多进程部署时会话各在各的进程里，问题要到生产环境才出现；写一行 `@cormijs/cache` 则是明确的。
- `@cormijs/plugin-auth`：`ctx.auth.login(state, user)`、`logout()`，`state.user` 是当前用户；接口模块 `export const auth = true`（或对用户的检查）即要求登录，否则 401 / 403；提供密码散列与校验（scrypt）。用户存在哪里由应用决定。导出 `auth` 的接口会等待 `auth` 服务：漏了鉴权插件时接口返回 503，而不是对所有人开放。
- 中间件只包裹应用自己的请求（接口、`loader`、页面）：开发服务器的模块、静态资源、mock 与代理在它们之前回答，会话不会为每个静态文件读取一次。

## 缓存与对象存储

```ts
await ctx.cache.set('captcha', id, code, 5 * 60 * 1000)
const code = await ctx.cache.get('captcha', id)

const { url } = await ctx.storage.put(`avatars/${id}.png`, file, { contentType: 'image/png' })
```

- `@cormijs/cache` 提供 `ctx.cache` 的接口（按表分区，带过期时间，`increment`、`getOrSet`）与内存实现；`@cormijs/cache-redis`、`@cormijs/cache-database`（存在 minato 中）是另外两种实现。实现本身提供服务，与 `ctx.bundler` 的做法相同：`cormi.yml` 中写哪一个，`ctx.cache` 就是哪一个。值一律以 JSON 保存，换实现时读到的值不变。
- `@cormijs/storage` 提供 `ctx.storage` 的接口（`put`、`get`、`head`、`delete`、`list`、`url`、`response`）与本地磁盘实现（目录 `data/storage`，由 `ctx.server` 在 `/storage` 公开），与缓存一样：接口包自带最简单的实现。`@cormijs/storage-s3` 用 aws4fetch 签名请求，不依赖体积 3MB 的 AWS SDK。键的每一段不能为空、不能以 `.` 开头，文件不会写到存储之外。

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

1. **服务端基础**（已完成）：`server/` 约定与原生运行的接口（`inject`、热重载、503）；`loader` 的 `context`；`ctx.middleware`（顺序、路径、`state`）；纯后端应用与 `cormi start`；`@cormijs/database`；页面与服务端的界限；`@cormijs/create`；示例 `with-api` 与 e2e。
2. **缓存**（已完成）：`@cormijs/cache`（接口与内存实现）、`@cormijs/cache-redis`、`@cormijs/cache-database`，三者运行同一组契约测试。
3. **会话、鉴权与常用中间件**（已完成）：`@cormijs/plugin-session`、`-auth`、`-cors`、`-security`、`-rate-limit`，固定的 `order`；示例 `with-auth`。
4. **对象存储**（已完成）：`@cormijs/storage`（接口与本地磁盘实现）、`@cormijs/storage-s3`（aws4fetch 签名，AWS、R2、MinIO 等），运行同一组契约测试。
5. **控制台与文档**：数据库与接口页面，registry 收录 minato 驱动，指南。
