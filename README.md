# Cormi

以 **Cordis** 为插件宿主、按 cordis / koishi 的哲学设计的 React 全栈框架。

+ 充分利用 cordis 的机制：插件树（`cormi.yml` + 官方 loader）、服务与 `inject`、effect、类型化事件、热重载
+ 覆盖 umi 的应用能力（约定式路由、SSR、loader、API 路由、mock……），但 API 以服务和事件的形式提供，而非 umi 的插件 API
+ 浏览器端同样是一个 cordis Context，插件可以同时拥有 Node 端和浏览器端

设计见 [docs/architecture.md](docs/architecture.md)。

> `references` 下有 umi 和 cordis，以及基于 cordis 的 koishi / satori 等框架的源码可以进行参考。

## 快速开始

```yaml
# cormi.yml
- name: '@cormi/preset-react'
  config:
    title: My App
    ssr: true
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
import type { Context } from 'cormi/client'

export default (ctx: Context) => {
  ctx.on('router/change', location => console.log(location.pathname))
}
```

```sh
cormi dev       # 开发
cormi build     # 构建客户端（和服务端）bundle
cormi preview   # 运行构建产物
```

## 仓库结构

| 目录 | 内容 |
|---|---|
| `packages/core` | `ctx.cormi`、`ctx.router`、`ctx.html`、`ctx.app`，以及基于官方 loader 的启动 |
| `packages/vite` | `ctx.vite`：dev server（挂在 `ctx.server` 上）与构建 |
| `packages/client` | 浏览器端 Context（`$app`、`$router`）、SSR |
| `packages/server` | `ctx.server` 上的页面、loader 端点、API 路由、静态资源 |
| `packages/preset-react` | 组合以上服务的 preset 与 React 渲染器 |
| `packages/cormi` | CLI，Node 端 API（`cormi`）与浏览器端 API（`cormi/client`） |
| `plugins/*` | 官方插件：mock、tailwindcss、antd、model、initial-state、request、qiankun |
| `examples/*` | basic、with-tailwind、with-antd、with-model、with-request、qiankun-master + qiankun-slave |
