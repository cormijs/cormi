# Cormi

以 **Cordis** 为插件宿主、按 cordis / koishi 的哲学设计的全栈框架：页面的打包器可选 Vite 或 Rsbuild，UI 框架可选 React 或 Vue；服务端有接口、中间件与数据库（minato）。可以是前端应用、后端服务，或两者兼有。

+ 充分利用 cordis 的机制：插件树（`cormi.yml` + 官方 loader）、服务与 `inject`、effect、类型化事件、热重载
+ 覆盖 umi 的应用能力（约定式路由、SSR、loader、mock……），但 API 以服务和事件的形式提供，而非 umi 的插件 API
+ 服务端由 Node 直接运行：`server/api` 的接口、`ctx.middleware`、`@cormijs/database`；页面与服务端之间的界限由构建检查
+ 浏览器端同样是一个 cordis Context，插件可以同时拥有 Node 端和浏览器端

文档与官网在 [cormi.js.org](https://cormi.js.org/)，源码在 [docs/](docs/)（VitePress，经 GitHub Pages 发布）：`pnpm docs:dev` 本地预览，`pnpm docs:build` 构建。设计说明见 [docs/architecture.md](docs/architecture.md)。

> `references` 下有 umi 和 cordis，以及基于 cordis 的 koishi / satori 等框架的源码可以进行参考。

## 快速开始

```sh
pnpm create @cormijs my-app     # 前端、后端、前后端或服务端渲染
```

或者手动写一份插件树：

```yaml
# cormi.yml
- name: '@cormijs/preset'     # 应用：路由、HTML、页面、接口、服务器
  config:
    title: My App
    ssr: true
- name: '@cormijs/vite'       # 页面的打包器，或 @cormijs/rsbuild
- name: '@cormijs/react'      # 页面的 UI 框架，或 @cormijs/vue；Vite + React 可合写为 @cormijs/preset-react
- name: '@cormijs/database'   # 服务端的数据库，驱动是 minato 的驱动包
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
- name: ./plugin.ts
```

```ts
// plugin.ts：一个 Node 插件
import { type Context, Schema } from '@cormijs/cormi'

export const name = 'my-plugin'
export const inject = ['html']
export const Config = Schema.object({ generator: Schema.string().default('cormi') })

export function apply(ctx: Context, config: { generator: string }) {
  ctx.html.head({ tag: 'meta', attrs: { name: 'generator', content: config.generator } })
}
```

```ts
// src/app.ts：应用自己的浏览器插件
import type { Context } from '@cormijs/cormi/client'   // React、Vue 的 API 在 @cormijs/react/client、@cormijs/vue/client

export default (ctx: Context) => {
  ctx.on('router/change', location => console.log(location.pathname))
}
```

```sh
cormi dev              # 开发；控制台在 http://localhost:8000/__cormi/
cormi build            # 构建客户端（和服务端）bundle
cormi start            # 在生产环境运行构建产物
cormi g plugin hello   # 在 plugins/ 下新建一个工作区插件，按包名加载源码
```

## 仓库结构

| 目录 | 内容 |
|---|---|
| `packages/core` | `ctx.cormi`、`ctx.router`、`ctx.html`、`ctx.app`、`ctx.workspace`（`plugins/*` 工作区插件），以及基于官方 loader 的启动 |
| `packages/vite` | 打包器 `ctx.bundler` 的 Vite 实现（同时提供 `ctx.vite`）：dev server 与构建 |
| `packages/rsbuild` | 打包器 `ctx.bundler` 的 Rsbuild 实现（同时提供 `ctx.rsbuild`）：web 与 node 两个环境 |
| `packages/server` | `ctx.server` 上的页面、loader 端点、`server/` 的代码与接口、`ctx.middleware`、静态资源 |
| `packages/database` | 数据库：minato 的 `ctx.model`、`ctx.database`，只在提供服务时运行 |
| `packages/cache*` | 缓存 `ctx.cache`：接口与内存实现（`cache`），Redis（`cache-redis`），数据库（`cache-database`） |
| `packages/create` | 脚手架 `pnpm create @cormijs`：前端、后端、前后端、服务端渲染 |
| `packages/runtime` | 与 UI 框架无关的浏览器 Context（`$app`、`$router` 契约）、loader 协议（`@cormijs/cormi/client`） |
| `packages/react` | React：渲染器（`ctx.renderer`、`ctx.react`）与浏览器 API `@cormijs/react/client`、SSR |
| `packages/vue` | Vue：渲染器（`ctx.renderer`、`ctx.vue`）与浏览器 API `@cormijs/vue/client`（Vue Router）、SSR |
| `packages/preset` | 应用本身：路由、HTML、页面、API、服务器与控制台，不含打包器与 UI 框架 |
| `packages/preset-react` | `@cormijs/preset` + `@cormijs/vite` + `@cormijs/react` 的简写 |
| `packages/console` | dev 模式下的控制台（`/__cormi/`）：插件树管理、应用内部、日志、工作区与市场 |
| `packages/cormi` | CLI（命令 `cormi`），Node 端 API（`@cormijs/cormi`）与 UI 框架无关的浏览器 API（`@cormijs/cormi/client`） |
| `plugins/*` | 官方插件：session、auth、security、cors、rate-limit、mock、tailwindcss、unocss、styled-components、antd、layout、model、initial-state、dva、valtio、react-query、request、analytics、export-static、legacy、mpa、mf、federation、qiankun、lint |
| `docs` | 官网兼文档站（VitePress） |
| `examples/*` | with-console（控制台与工作区插件）、basic、with-api（纯后端）、with-auth（会话与登录）、with-tailwind、with-antd、with-model、with-request、with-styles、with-data、with-layout、with-mpa、mf-host + mf-remote、federation-host + federation-users + federation-orders、qiankun-master + qiankun-slave、with-vue |
