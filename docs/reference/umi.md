# 从 umi 迁移

umi 是 Cormi 的能力清单：一个全栈框架该有的东西，Cormi 基本都有。但 API 的形态不同——umi 的插件 API 在 Cormi 里是服务上的注册方法和类型化事件，umi 的配置文件在这里是插件树。

## 概念

| umi | Cormi |
|---|---|
| `.umirc.ts` / `config/config.ts` | `cormi.yml`：插件树，每个插件带自己的配置 |
| `plugins: [...]` + `enableBy: config` | 在 `cormi.yml` 中列出插件，或设置 `disabled: true` |
| 插件 API 的阶段（`onStart`、`modifyConfig`……） | 没有阶段：服务在注册变化时重新计算产物 |
| `api.restartServer()` | 不需要：修改配置只重载对应的插件 |
| `src/app.ts` 的运行时配置 key | `src/app.tsx` 是一个浏览器插件：`ctx.wrap()`、`ctx.on()` |
| `.umi` 临时目录 | `src/.cormi`，由 `ctx.app.file()` 维护 |

## 插件 API

| umi | Cormi |
|---|---|
| `api.describe({ key, config })` | `export const name` + `export const Config`（Schema） |
| `api.addHTMLMetas` / `addHTMLLinks` / `addHTMLScripts` | `ctx.html.head(tag)` / `ctx.html.body(tag)` |
| `api.modifyHTML` | `ctx.html.transform(fn)` |
| `api.addRuntimePlugin` + 运行时 key | `ctx.app.entry(module, config)`，浏览器端用 `ctx.wrap()` 与事件 |
| `api.addEntryImports` | `ctx.app.import(source)` |
| `api.writeTmpFile` | `ctx.app.file(path, content)` |
| `api.modifyRoutes` | `ctx.router.patch(fn)` |
| `api.addLayouts` | `ctx.router.layout(file)` |
| `api.modifyViteConfig` | `ctx.vite.configure(fn)` / `ctx.vite.plugin(plugin)` |
| `api.addMiddlewares` | `ctx.server.use(mw)` / `ctx.server.get(path, mw)` |
| `api.onBuildComplete` | `ctx.on('build/after', fn)` |
| `api.registerCommand` | `ctx.cli.command(name, command)` |
| `api.registerGenerator` | `ctx.cli.generator(type, generator)` |
| `api.applyPlugins({ key })` | 在自己的事件上 `ctx.emit` / `ctx.serial` / `ctx.waterfall` |

## 配置项

| umi | Cormi（`@cormi/preset-react` 的配置，除非另有说明） |
|---|---|
| `routes` | `routes` |
| `base`、`publicPath`、`history.type` | `base`、`publicPath`、`history` |
| `ssr` | `ssr` |
| `title`、`metas`、`links`、`scripts`、`headScripts`、`styles`、`favicons` | 同名 |
| `alias`、`define`、`targets`、`outputPath` | `alias`、`define`、`targets`、`outDir` |
| `proxy` | `proxy` |
| `mock` | `@cormi/plugin-mock` |
| `exportStatic` | `@cormi/plugin-export-static` |
| `mpa` | `@cormi/plugin-mpa` |
| `legacy` | `@cormi/plugin-legacy` |
| `model`、`initialState`、`request`、`antd`、`layout`、`qiankun`、`dva`、`valtio`、`reactQuery`、`analytics`、`tailwindcss` | 同名的官方插件 |

## 覆盖情况

已覆盖：约定式与配置式路由、全局布局、404、`clientLoader` 与服务端 `loader`、SSR、API 路由、mock、`proxy`；HTML 配置；`base`、`publicPath`、`history`、`alias`、`define`、`targets`；`global`、`overrides`、`loading`、`favicon` 约定；路由预加载；exportStatic、MPA、legacy；dev、build、preview、setup、generate、config、lint 命令；以及 antd、tailwindcss、unocss、styled-components、model、initial-state、dva、valtio、react-query、request、layout、analytics、qiankun、mf 插件。umi 没有内置的联邦应用（federation）也已提供。

尚未覆盖：access 与 locale 插件。webpack、mako、mfsu 这类与打包器绑定的功能有意不做——Cormi 只用 Vite。
