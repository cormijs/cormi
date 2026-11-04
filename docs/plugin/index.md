# 插件的结构

Cormi 的插件就是 cordis 插件。内置能力、官方插件和应用自己的代码用的是同一种写法。

## 一个 Node 插件

::: code-group

```ts [plugin.ts]
import { type Context, Schema } from '@cormijs/cormi'

export const name = 'generator-meta'
export const inject = ['html']

export interface Config {
  generator: string
}

export const Config: Schema<Config> = Schema.object({
  generator: Schema.string().default('cormi').description('content of <meta name="generator">'),
})

export function apply(ctx: Context, config: Config) {
  ctx.html.head({ tag: 'meta', attrs: { name: 'generator', content: config.generator } })
}
```

:::

| 导出 | 作用 |
|---|---|
| `name` | 插件名，出现在日志和 `cormi config` 里 |
| `inject` | 依赖的服务。它们都就绪后插件才加载；任一服务消失，插件转入 pending，服务回来后重新加载 |
| `Config` | 配置的 Schema（[schemastery](https://github.com/shigma/schemastery)）。`cormi.yml` 中的 `config` 先经它校验、填充默认值 |
| `apply(ctx, config)` | 插件的主体：在 `ctx` 上注册 |

写进 `cormi.yml` 即可加载：

```yaml
- name: ./plugin.ts
  config:
    generator: my-app
```

插件也可以是一个函数（`export default (ctx, config) => {}`），或一个 `Service` 子类（提供服务的插件，见下文）。

## 注册与清理

`ctx.html.head()` 这类注册方法都是 effect：注册属于调用它的插件，插件卸载时自动撤回。所以 `apply` 里通常没有清理代码。

需要自己管理的资源（定时器、连接、文件监听）用 `ctx.effect()` 包起来：

```ts
ctx.effect(() => {
  const timer = setInterval(check, 1000)
  return () => clearInterval(timer)
})
```

事件监听 `ctx.on()` 同样会随插件卸载。

## 可选的依赖

只在某个服务存在时才做的事，放进 `ctx.inject()`：

```ts
export function apply(ctx: Context) {
  // ctx.server 只在 dev 与 start 下存在
  ctx.inject(['server'], (ctx) => {
    ctx.server.get('/healthz', async () => new Response('ok'))
  })
}
```

回调里的 `ctx` 是一个子插件的上下文，服务消失时，它注册的一切随之撤回。

## 组合插件

一个插件可以加载其他插件，`@cormijs/preset-react` 就是这样由 `@cormijs/preset`、`@cormijs/vite`、`@cormijs/react` 组合出来的：

```ts
import * as Mock from '@cormijs/plugin-mock'

export function apply(ctx: Context, config: Config) {
  ctx.plugin(Mock, { delay: 100 })
}
```

子插件属于父插件，父插件卸载时一起卸载。

## 提供服务

插件可以提供自己的服务，让其他插件通过 `inject` 使用：

```ts
import { type Context, Service } from '@cormijs/cormi'

declare module 'cordis' {
  interface Context {
    i18n: I18n
  }
}

export class I18n extends Service {
  messages = new Map<string, string>()

  constructor(ctx: Context) {
    super(ctx, 'i18n')
  }

  define(key: string, message: string) {
    return this.ctx.effect(() => {
      this.messages.set(key, message)
      return () => this.messages.delete(key)
    })
  }
}
```

`define()` 用 `this.ctx.effect()` 实现：在服务的方法里，`this.ctx` 是调用方插件的上下文，所以这次注册属于调用方，调用方卸载时自动撤回。这正是 Cormi 内置服务的实现方式。

## 带浏览器端的插件包

一个插件包通常同时有 Node 端和浏览器端：

```
@scope/plugin-foo/
├─ src/index.ts       Node：name、Config、inject、apply
└─ client/index.tsx   浏览器：export default (ctx, config) => {}
```

::: code-group

```json [package.json]
{
  "name": "@scope/plugin-foo",
  "type": "module",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./client/index.tsx"
  },
  "peerDependencies": {
    "cormi": "*",
    "@cormijs/react": "*"
  }
}
```

浏览器端用 React 的插件把 `@cormijs/react` 写进 `peerDependencies`，从 `@cormijs/react/client` 导入，并在 Node 端声明 `inject: ['react']`——应用换用其他 UI 框架时，插件转入 pending，而不是在浏览器里报错。与 UI 框架无关的浏览器插件只从 `@cormijs/cormi/client` 导入类型。

:::

Node 端用**包名**注册浏览器端：

```ts
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@scope/plugin-foo/client', { color: config.color })
}
```

- 使用包名而不是文件路径，生成的入口和用户代码导入的是同一个模块，打包器只会产生一份模块实例。
- `config` 要能序列化为 JSON，它会写进生成的入口，传给浏览器插件。
- 浏览器端可以直接发布 TypeScript 源码；UI 框架会把注册了入口的包打包进服务端入口（Vite 的 `ssr.noExternal`、Rsbuild 的 `autoExternal.exclude`），服务端渲染时由打包器处理。

按照约定，官方插件命名为 `@cormijs/plugin-*`，社区插件命名为 `cormi-plugin-*` 或 `@scope/cormi-plugin-*`。

## 声明兼容性

控制台的市场在安装之前就要知道插件适用于哪些应用。插件包在 package.json 的 `cormi` 字段中声明它支持的打包器与 UI 框架，名称就是 `ctx.bundler.name`、`ctx.renderer.name`：

```json
{
  "name": "@scope/plugin-foo",
  "keywords": ["cormi-plugin"],
  "cormi": {
    "bundler": ["vite", "rsbuild"],
    "renderer": ["react"]
  }
}
```

| 写法 | 含义 |
|---|---|
| 省略 `bundler` / `renderer` | 不限，与打包器、UI 框架无关的插件什么都不用写（`"cormi": {}`） |
| `["vite", "rsbuild"]` | 只支持这些 |
| `exports["./slave"]` | 包中一个插件的声明，逐个键覆盖包级的：`@scope/plugin-foo/slave` |
| `service` | koishi 式的 `required`、`optional`、`implements` |
| `description` | 市场显示的描述，可以按语言给出：`{ "zh-CN": "…", "en": "…" }` |

声明要与代码一致：`inject: ['react']` 的插件声明 `renderer: ["react"]`，`ctx.bundler.plugin()` 只给了 `vite` 一项的插件声明 `bundler: ["vite"]`。不必手写，在插件包中运行：

```sh
cormi plugin check            # 检查，与 package.json 不一致时退出码非零（适合 CI）
cormi plugin check --write    # 写回 cormi 字段，以及镜像它的关键词
```

```
@scope/plugin-foo

              react     vue
    rsbuild   failed    failed
    vite      ok        pending
    rsbuild × react, rsbuild × vue: failed: the plugin supports vite, not rsbuild
    vite × vue: pending: waits for react

  inferred  bundler: vite   renderer: react
```

它对每个组合以 setup 模式启动一个最小的应用（`@cormijs/preset`、打包器、UI 框架与这个插件），看插件是加载了、在等待 `react` 这类服务，还是因为缺少当前打包器的一项而失败；打包器的列表来自 `ctx.bundler.plugin()` 的键，UI 框架来自 `inject`。

- 组合来自插件包的开发依赖：把 `@cormijs/preset`，以及想要检查的打包器与 UI 框架（`@cormijs/vite`、`@cormijs/rsbuild`、`@cormijs/react`、`@cormijs/vue`）加入 `devDependencies`。没有安装的组合不检查，也不会被写成不支持。
- 打包器或 UI 框架本身缺少集成包（如 `@rsbuild/plugin-react`）时，那个组合标为跳过，不算插件的问题。
- 一个包导出多个插件时逐个检查，写回 `exports` 中的覆盖；浏览器模块（插件注册的入口，以及 `client`、`console`）不检查。
- 插件有必填的配置时，在 `cormi.check` 中给出检查用的配置：`"check": { ".": { "name": "example" } }`。
- 只在 dev 模式下才有的服务（如 `server`）缺少时，不影响结论。

没有 `cormi` 字段的包，市场从它对 `@cormijs/react`、`@cormijs/vite` 等的 peer 依赖推断，并标为推断。`cormi g plugin` 生成的包已经带上了 `cormi` 字段。设计见 [插件市场与兼容性](/reference/market)。

## 下一步

- [Node 端服务](/plugin/services)：可以注册什么
- [事件](/plugin/events)：可以监听什么，以及如何声明自己的事件
- [浏览器端](/plugin/client)：浏览器插件能做什么
