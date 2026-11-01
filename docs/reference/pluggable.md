# 设计：可选的打包器与 UI 框架

> 状态：设计已定，按阶段实施中（第 1、2 阶段已完成）。本页记录决策与理由。

目标：Vite 与 React 不再是框架的一部分，而是可替换的实现。用户在 `cormi.yml` 里选择打包器与 UI 框架，其余能力（路由表、HTML、页面服务、API、loader、插件树、控制台）保持一致。

## 两条接缝

不抽象“通用的打包配置”。那会退化成所有打包器的最小公分母，或者 webpack-chain 式的配置翻译层。只抽象两条接缝，每条都是一个 cordis 服务，由可替换的插件实现——与 koishi 的 `ctx.database` 由 mysql、sqlite 等插件实现是同一个模型：

| 服务 | 契约 | 实现 |
|---|---|---|
| `ctx.bundler` | 开发服务器与 HMR、开发时加载服务端入口、构建并给出规范化的资源清单、跨打包器插件 | `@cormi/vite`（同时提供 `ctx.vite`）、`@cormi/rsbuild`（同时提供 `ctx.rsbuild`） |
| `ctx.renderer` | 路由文件扩展名、路由模块导出分析、生成浏览器与服务端入口、按打包器分派的编译插件、生成器模板 | `@cormi/react`（同时提供 `ctx.react`）、`@cormi/vue`（同时提供 `ctx.vue`） |

每个实现另外提供一个具名服务作为逃生舱：需要 Vite 特有能力的插件 `inject: ['vite']`，只适用于 React 的插件 `inject: ['react']`。

已经与两者无关、保持不变的部分：`ctx.router` 的路由表、`ctx.html`、`ctx.app`（浏览器插件、全局导入、生成文件、服务端模块）、CLI、工作区、loader 协议，以及**服务端入口契约**——导出 `handler.render(request)`、`handler.loader(request, routeId)`、`modules`、`base`。页面服务、API 路由、静态导出只依赖这个契约。

## 契约

契约在 `@cormi/core` 的 `bundler.ts`。已经实现的部分：

```ts
interface Bundler {
  readonly name: string                      // 'vite'
  /** 打包器插件：{ vite?: Vite.PluginInput, … }，取当前打包器的一项；没有时抛出错误 */
  plugin(spec: Bundler.Plugin): Disposable
  /** 只包含各打包器共有的选项 */
  readonly config: { publicPath: string; outDir: string; alias: Dict<string>; define: Dict<unknown>; sourcemap: boolean }
  readonly outDir: string
  /** dev 下开发服务器是否就绪；页面服务在此之前回应“正在启动” */
  readonly ready: boolean
  /** 额外的构建入口（多页应用） */
  input(name: string, file: string): Disposable
  /** 入口的资源：dev 下是模块本身，构建后来自打包器的 manifest，规范化为 EntryAssets */
  assets(file: string): Promise<EntryAssets>
  // 开发
  transformDocument(url: string, html: string): Promise<string>
  devStyles?(entry: string): string
  fixStacktrace?(error: Error): void
  loadServerEntry(): Promise<ServerEntry>
  // 构建
  build(): Promise<{ outDir: string; assets: EntryAssets; inputs: Dict<EntryAssets>; server?: string }>
}

interface Renderer {
  readonly name: string                      // 'react'
}
```

渲染器的其余职责不是 `Renderer` 上的方法，而是它对其他服务的注册：用 `ctx.router.extension('.tsx', '.jsx')` 注册路由文件的扩展名（core 只认 `.ts`、`.js`），用 `ctx.app.file()` 生成 `entry.*`、`server.*`（遵守服务端入口契约）与 `routes.ts`，`ctx.app.clientEntry` / `serverEntry` 按注册的文件名找到入口。

`plugin()` 的参数以打包器名称为键，值是那个打包器自己的插件形式。键与值的类型由打包器包通过声明合并加入 `Bundler.Plugins`（`@cormi/vite` 加入 `vite: Vite.PluginInput`），所以拼错键名、给错插件形式都是类型错误。unplugin 的各个变体放得进这个对象：`{ vite: () => plugin.vite(options), rspack: () => plugin.rspack(options) }`。修改打包配置也写成打包器插件（Vite 插件的 `config` 钩子、Rsbuild 插件的 `modifyRsbuildConfig`），所以只适用于一种打包器的内容都收在这个对象里。

缺少当前打包器的一项时抛出错误，而不是忽略：插件加载失败，并说明它支持哪些打包器。悄悄跳过会让 tailwind 这类插件“加载成功”却不生效。可有可无的增强（只在 Vite 下才需要的额外配置）由插件写成 `ctx.inject(['vite'], …)`。

随第二个实现补上的部分：

```ts
interface Bundler {
  /** 生成代码中的热更新：import.meta.hot（Vite）或 import.meta.webpackHot（Rspack） */
  hmr: { accept(deps: string[], callback: string): string }
}

interface Renderer {
  /** 编译 UI 框架的打包器插件 */
  compile: { vite?(): unknown; rspack?(): unknown }
  /** loader、clientLoader 等导出的识别（.vue 需要自己的实现） */
  analyzeExports(file: string): Promise<string[]>
}
```

浏览器端同样分两层：

| 包 | 内容 |
|---|---|
| `@cormi/runtime`（`cormi/client`） | 与 UI 框架无关的浏览器 Context：`$app` 的生命周期与 props、`$router` 的最小契约（`routes`、`load`、`add`、`href`、`navigate`、`preload`、`router/change` 事件）、loader 协议 |
| `@cormi/react/client`、`@cormi/vue/client` | 各框架的实现：React 的 `ctx.wrap()`、钩子、基于 React Router 的 `$router`、SSR；Vue 的 `app.use()`、组合式函数、基于 Vue Router 的 `$router`、SSR |

## 已定的决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 用来验证 `ctx.bundler` 的第二个打包器 | Rsbuild（Rspack） | 有自定义服务器的中间件模式和 SSR bundle 加载；Rspack 原生支持模块联邦；与 Vite 差异足够大 |
| 用来验证 `ctx.renderer` 的第二个 UI 框架 | Vue | 非 JSX 的单文件组件、不同的路由与 SSR API，最能检验抽象 |
| 路由 | 各框架用原生路由 | React 用 React Router，Vue 用 Vue Router；Cormi 只统一路由表与 loader 协议，对各框架用户最地道 |
| 插件的兼容性 | 用 `inject` 声明 | 只适用于 React 的插件 `inject: ['react']`，不支持的组合中插件转入 pending，控制台显示原因 |
| 跨打包器插件 | 按打包器分派的映射，unplugin 的变体可以放进去 | unplugin 一份实现覆盖 Vite、Rollup、Rspack、webpack、esbuild；tailwind、unocss 这类各有适配的工具用映射 |
| 映射缺少当前打包器 | 抛出错误，插件加载失败 | 不支持的组合要看得见；可有可无的部分用 `ctx.inject(['vite'], …)` |
| 路由导出的剥离 | 不用 unplugin，在映射中给每个打包器一个实现 | 它只能作用于客户端构建，而 unplugin 的通用钩子分不清客户端与服务端；Vite 用 `transform` 的 `ssr` 参数，Rsbuild 用 `api.transform({ environments })` |
| 控制台 | 与应用的打包器、UI 框架解耦 | 控制台作为开发工具自带 Vite 与 React，无论应用用什么 |
| UI 框架 API 的导入路径 | `@cormi/react/client`、`@cormi/vue/client` | UI 集成是应用的直接依赖，与插件的 `/client` 约定一致；`cormi/client` 变为与框架无关的运行时，`cormi` 不再依赖 React |
| `cormi.yml` 的写法 | 显式组合，保留 preset 简写 | `@cormi/preset`（应用：路由、HTML、页面、API、服务器）+ 打包器 + UI 框架，选择一目了然；`@cormi/preset-react` 保留为等价简写 |

```yaml
- name: '@cormi/preset'      # 应用：title、port、routes、ssr……
  config:
    title: My App
    ssr: true
- name: '@cormi/vite'        # 打包器：publicPath、outDir、alias……；或 @cormi/rsbuild
- name: '@cormi/react'       # UI 框架；或 @cormi/vue
```

## 插件的分类

| 类别 | 插件 | 写法 |
|---|---|---|
| 通用 | mock、analytics、export-static、lint | 只用通用服务 |
| 按打包器适配 | tailwindcss、unocss | `ctx.bundler.plugin({ vite, … })` |
| React | model、initial-state、request、react-query、dva、valtio、antd、layout、mpa、qiankun 主应用；styled-components 另按打包器适配 | `inject: ['react']` |
| Vite | legacy、mf | `inject: ['vite']` |
| React 与 Vite | federation、qiankun 子应用 | `inject: ['vite', 'react']` |

legacy 是 `@vitejs/plugin-legacy` 的封装，Rsbuild 自己按 browserslist 降级，不需要它。mf 与 federation 依赖 `@module-federation/vite`，Rsbuild 下改用原生的模块联邦，在第 3 阶段补上。

## 实施阶段

每个阶段结束时，全部示例的 e2e（preview 与 dev）保持通过。

1. **无行为变化的拆分**（已完成）：`@cormi/client` 拆为 `@cormi/runtime` 与 `@cormi/react`；preset 中的 React 渲染器移入 `@cormi/react`，与 UI 框架无关的部分成为 `@cormi/preset`；`@cormi/vite` 提供 `bundler`；页面服务中 Vite 特有的逻辑移到 `bundler` 接口之后；core 不再写死 `.tsx`；`cormi` 不再依赖 React 与 Vite。只适用于 Vite 的插件已改用 `ctx.vite` 的类型并以 `@cormi/vite` 为 peer 依赖。
2. **插件分类与改造**（已完成）：`ctx.bundler.plugin()` 与 `Bundler.Plugins`；React 渲染器、文件约定、tailwindcss、unocss、styled-components 通过它注册打包器插件，不再注入 `vite`；React 插件声明 `inject: ['react']`；plugin-lint 只在 React 应用中启用 hooks 规则。分类见下表。
3. **第二实现**：`@cormi/rsbuild`（basic、tailwind、模块联邦的 e2e），`@cormi/vue` 与 Vue 示例；e2e 变为组合矩阵。
4. **控制台解耦**与文档，控制台概览显示当前的打包器与 UI 框架。
