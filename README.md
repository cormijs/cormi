# Cormi

以 **Cordis** 为插件宿主、按 cordis / koishi 的哲学设计的 React 全栈框架。

+ 充分利用 cordis 的机制：插件树（`cormi.yml` + 官方 loader）、服务与 `inject`、effect、类型化事件、热重载
+ 覆盖 umi 的应用能力（约定式路由、SSR、loader、API 路由、mock……），但 API 以服务和事件的形式提供，而非 umi 的插件 API
+ 浏览器端同样是一个 cordis Context，插件可以同时拥有 Node 端和浏览器端

文档与官网在 [docs/](docs/)（VitePress）：`pnpm docs:dev` 本地预览，`pnpm docs:build` 构建。设计说明见 [docs/architecture.md](docs/architecture.md)。

> `references` 下有 umi 和 cordis，以及基于 cordis 的 koishi / satori 等框架的源码可以进行参考。

## 快速开始

```yaml
# cormi.yml
- name: '@cormi/preset'     # 应用：路由、HTML、页面、API、服务器
  config:
    title: My App
    ssr: true
- name: '@cormi/vite'       # 打包器
- name: '@cormi/react'      # UI 框架；三行可合写为 @cormi/preset-react
- name: ./plugin.ts
```

```ts
// plugin.ts：一个 Node 插件
import { type Context, Schema } from 'cormi'

export const name = 'my-plugin'
export const inject = ['html']
export const Config = Schema.object({ generator: Schema.string().default('cormi') })

export function apply(ctx: Context, config: { generator: string }) {
  ctx.html.head({ tag: 'meta', attrs: { name: 'generator', content: config.generator } })
}
```

```ts
// src/app.ts：应用自己的浏览器插件
import type { Context } from 'cormi/client'   // React 的 API 在 @cormi/react/client

export default (ctx: Context) => {
  ctx.on('router/change', location => console.log(location.pathname))
}
```

```sh
cormi dev              # 开发；控制台在 http://localhost:8000/__cormi/
cormi build            # 构建客户端（和服务端）bundle
cormi preview          # 运行构建产物
cormi g plugin hello   # 在 plugins/ 下新建一个工作区插件，按包名加载源码
```

## 仓库结构

| 目录 | 内容 |
|---|---|
| `packages/core` | `ctx.cormi`、`ctx.router`、`ctx.html`、`ctx.app`、`ctx.workspace`（`plugins/*` 工作区插件），以及基于官方 loader 的启动 |
| `packages/vite` | 打包器 `ctx.bundler` 的 Vite 实现（同时提供 `ctx.vite`）：dev server 与构建 |
| `packages/server` | `ctx.server` 上的页面、loader 端点、API 路由、静态资源 |
| `packages/runtime` | 与 UI 框架无关的浏览器 Context（`$app`、`$router` 契约）、loader 协议（`cormi/client`） |
| `packages/react` | React：渲染器（`ctx.renderer`、`ctx.react`）与浏览器 API `@cormi/react/client`、SSR |
| `packages/preset` | 应用本身：路由、HTML、页面、API、服务器与控制台，不含打包器与 UI 框架 |
| `packages/preset-react` | `@cormi/preset` + `@cormi/vite` + `@cormi/react` 的简写 |
| `packages/console` | dev 模式下的控制台（`/__cormi/`）：插件树管理、应用内部、日志、工作区与市场 |
| `packages/cormi` | CLI，Node 端 API（`cormi`）与 UI 框架无关的浏览器 API（`cormi/client`） |
| `plugins/*` | 官方插件：mock、tailwindcss、unocss、styled-components、antd、layout、model、initial-state、dva、valtio、react-query、request、analytics、export-static、legacy、mpa、mf、federation、qiankun、lint |
| `docs` | 官网兼文档站（VitePress） |
| `examples/*` | with-console（控制台与工作区插件）、basic、with-tailwind、with-antd、with-model、with-request、with-styles、with-data、with-layout、with-mpa、mf-host + mf-remote、federation-host + federation-users + federation-orders、qiankun-master + qiankun-slave |
