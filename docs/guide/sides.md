# 页面与服务端

一个 Cormi 应用最多有两侧：**页面**与**服务端**。另外还有一层装配：`cormi.yml` 决定应用有哪一侧、用哪些插件。前端应用只有页面，后端服务只有服务端，全栈应用两侧都有。

每个文件、每个插件、每条命令都只属于其中一处。写代码时先问一句“它在哪一侧”，就知道它在哪里运行、能用什么、文档在哪一节。

| | 页面 | 服务端 | 应用 |
|---|---|---|---|
| 目录 | `src/` | `server/` | `cormi.yml`、`plugin.ts`、`plugins/` |
| 运行在 | 浏览器；开启 SSR 时也在服务端入口中渲染 | Node | Node：每条命令都会加载 |
| 构建 | 打包器：`dist/` | esbuild：`dist/node` | 本地插件同样编译到 `dist/node` |
| 何时运行 | 打包之后 | 应用提供服务时：`cormi dev`（源码）、`cormi start`（编译后的代码） | 每条命令 |
| 由谁处理 | 打包器与 UI 框架（`ctx.bundler`、`ctx.renderer`） | `ctx.server`、`ctx.middleware` 与服务（`ctx.database`……） | cordis 的 loader |
| 应用自己的插件 | `src/app.tsx` | `server/index.ts` | `plugin.ts` |
| 生成器 | `cormi g page`、`cormi g component` | `cormi g api`、`cormi g model` | `cormi g plugin` |
| 文档 | [目录与约定](/guide/conventions)、[路由与数据](/guide/routing)、[打包器与 UI 框架](/guide/stack) | [服务端代码与接口](/guide/server)、[中间件与代理](/guide/middleware)、[数据库](/guide/database)、[缓存](/guide/cache)、[文件存储](/guide/storage)、[会话与鉴权](/guide/auth) | [cormi.yml](/guide/config)、[命令行](/guide/cli)、[构建与部署](/guide/deploy) |

## 四种应用

创建应用时选择的类型，就是选择它有哪一侧、页面在哪里渲染：

| 类型 | 页面 | 服务端 | 生产环境（`cormi build` 之后） |
|---|---|---|---|
| 前端 `web` | 在浏览器渲染 | — | 任意静态托管，或 `cormi start` |
| 后端 `api` | — | 接口与数据库 | `cormi start` |
| 前后端 `fullstack` | 在浏览器渲染 | 接口与数据库 | `cormi start`：页面与接口在同一个服务 |
| 服务端渲染 `ssr` | 在服务端渲染 | 接口与数据库 | `cormi start` |

类型不是一项配置，而是由 `cormi.yml` 与目录推出来的：有打包器与 UI 框架就有页面，preset 开启 `ssr` 页面就在服务端渲染，有 `server/` 就有服务端代码。所以应用可以从一种类型长成另一种：给前端应用加上 `server/api`，它就成了前后端应用；给后端加上打包器、UI 框架和 `src/pages`，它就有了页面。

```sh
pnpm create @cormijs my-app            # 依次询问类型、UI 框架、打包器、数据库
pnpm create @cormijs my-app -t ssr     # 直接指定类型
```

见 [快速开始](/guide/getting-started)。

## 两侧只在三处相遇

页面不导入服务端的代码，服务端也不渲染页面的组件。两侧之间只有三条路：

1. **HTTP**：页面用 `fetch('/api/todos')` 调用 `server/api` 的接口。这条路在两侧分开部署时同样成立。
2. **`loader` 的 `context`**：页面的服务端 `loader` 运行在服务端，通过 `context.ctx` 使用服务端的服务，通过 `context.state` 读取中间件写入的请求状态：

   ```tsx
   export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
     return context.ctx.database.get('todo', {})
   }
   ```

3. **类型**：页面用 `import type` 导入服务端的类型，例如表的接口：

   ```ts
   import type { Todo } from '../../server/models/todo'
   ```

页面一旦从 `server/` 导入值（而不只是类型），构建就会失败，并说明该走哪条路：

```
src/pages/index.tsx imports server/models/todo.ts, but the code in server/ runs in Node and is not
bundled into the pages: import its types only (`import type`), call its API with fetch, or use its
services in a loader through `context.ctx`
```

这条规则避免了一类难以察觉的错误：服务端的代码被打包进页面后，会带着自己的一份状态（数据库连接、缓存）运行在另一个地方，与真正的服务端互不相知。

## 服务端只在提供服务时运行

`server/` 的代码、数据库这类服务端的服务，只在应用提供服务时运行：`cormi dev` 运行源码，`cormi start` 运行 `cormi build` 编译后的代码。`cormi build`、`cormi setup` 与生成器不会运行它们，也不会连接数据库，所以在没有数据库的 CI 中同样可以构建。

插件用 `ctx.cormi.serving` 判断应用是否在提供服务，服务端插件据此决定是否连接外部系统，见 [Node 端服务](/plugin/services#ctx-cormi)。

## 插件属于哪一侧

插件同样有归属。写进 `cormi.yml` 时，按它服务的一侧放在一起，读起来更清楚：

| 一侧 | 插件 |
|---|---|
| 页面 | 打包器与 UI 框架，`@cormijs/plugin-antd`、`-tailwindcss`、`-model`、`-request`、`-layout`…… |
| 服务端 | `@cormijs/database` 与 minato 的驱动，`@cormijs/cache` 及其 Redis、数据库实现，`@cormijs/storage` 与 `@cormijs/storage-s3`，`@cormijs/plugin-session`、`-auth`、`-security`、`-cors`、`-rate-limit` |
| 应用 | `@cormijs/preset`、`@cormijs/plugin-mock`、`-lint`，以及应用自己的 `plugin.ts` |

```yaml
# 应用
- name: '@cormijs/preset'
  config:
    ssr: true
# 页面
- name: '@cormijs/vite'
- name: '@cormijs/react'
- name: '@cormijs/plugin-antd'
# 服务端
- name: '@cormijs/database'
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
```
