# 介绍

Cormi 是一个 React 全栈框架。它的插件宿主是 [Cordis](https://github.com/cordiverse/cordis)——[Koishi](https://koishi.chat) 背后的插件系统——设计也遵循 cordis 与 koishi 的哲学。

它提供的能力与 umi 这一类框架相当：约定式与配置式路由、布局、服务端渲染、数据加载、API 路由、mock、代理，以及一组覆盖 antd、状态管理、请求、微前端的官方插件。不同之处在于这些能力的形态：Cormi 没有 `api.modifyXxx` 式的插件 API，没有阶段状态机，能力是 `ctx` 上的服务，扩展点是类型化事件。

## 应用是一棵插件树

应用写在 `cormi.yml` 里，每个条目是一个插件：

```yaml
- name: '@cormi/preset-react'
  config:
    title: My App
    ssr: true
- name: '@cormi/plugin-antd'
  config:
    locale: zh_CN
- name: ./plugin.ts
```

`@cormi/preset-react` 也只是一个插件。它组合了路由、HTML、打包、React 渲染器和 HTTP 服务，每一部分都是一个子插件，也可以不经 preset 单独组合。`cormi.yml` 由 cordis 官方的 loader 加载，所以 cordis 生态里的插件同样可以写进来。

## 能力是服务

插件通过 `ctx.<name>` 使用能力，并用 `inject` 声明依赖。加载顺序由依赖决定：一个插件需要的服务就绪之后，它才会加载。

```ts
import { type Context, Schema } from 'cormi'

export const name = 'generator-meta'
export const inject = ['html']

export const Config = Schema.object({
  generator: Schema.string().default('cormi'),
})

export function apply(ctx: Context, config: { generator: string }) {
  ctx.html.head({ tag: 'meta', attrs: { name: 'generator', content: config.generator } })
}
```

Node 端的服务有 `ctx.router`、`ctx.html`、`ctx.app`、`ctx.vite`、`ctx.server`、`ctx.cli` 等，见 [Node 端服务](/plugin/services)。

## 注册即副作用

每个注册方法——`ctx.html.head()`、`ctx.app.entry()`、`ctx.vite.plugin()`……——都是调用方插件的一个 effect：它属于这个插件，并返回一个撤销函数。插件卸载时，它注册过的一切会自动撤回。插件里不需要写清理代码，也不会留下卸载不干净的状态。

## 响应式，而不是分阶段

umi 的插件在固定的阶段里依次运行；改动配置往往意味着重启。Cormi 的服务则在注册集合变化时重新计算产物：路由表、`src/.cormi` 下的生成文件、Vite 配置。

所以在 dev 模式下修改 `cormi.yml` 中某个条目的配置，只有这一个插件会重载；新增或删除条目，对应的插件就加载或卸载。首页的示意图演示的正是这个过程。

## 浏览器端也是 Cordis

浏览器里的运行时同样是一个 cordis `Context`（与 koishi-webui 的模型相同）。Node 插件通过 `ctx.app.entry()` 注册浏览器插件，浏览器插件用 `ctx.wrap()` 包裹根组件、用 `ctx.on()` 监听导航等事件，这些注册也会随插件卸载：

```tsx
import type { Context } from 'cormi/client'

export default (ctx: Context) => {
  ctx.on('router/change', location => console.log(location.pathname))
}
```

见 [浏览器端](/plugin/client)。

## 与 umi、Koishi 的关系

- **umi** 是 Cormi 的能力清单，而不是 API 模型。熟悉 umi 的话，[从 umi 迁移](/reference/umi) 列出了概念的对应关系。
- **Koishi** 与 Cormi 共用同一个插件系统。koishi 插件的写法、服务与 `inject`、`cormi.yml` 的结构（koishi 的 `koishi.yml`）在这里都一样适用。

## 下一步

- [快速开始](/guide/getting-started)：运行示例，或创建一个应用
- [插件的结构](/plugin/)：写第一个插件
