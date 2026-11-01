# 设计：可选的打包器与 UI 框架

> 状态：四个阶段均已完成。本页记录决策与理由。

目标：Vite 与 React 不再是框架的一部分，而是可替换的实现。用户在 `cormi.yml` 里选择打包器与 UI 框架，其余能力（路由表、HTML、页面服务、API、loader、插件树、控制台）保持一致。

## 两条接缝

不抽象“通用的打包配置”。那会退化成所有打包器的最小公分母，或者 webpack-chain 式的配置翻译层。只抽象两条接缝，每条都是一个 cordis 服务，由可替换的插件实现——与 koishi 的 `ctx.database` 由 mysql、sqlite 等插件实现是同一个模型：

| 服务 | 契约 | 实现 |
|---|---|---|
| `ctx.bundler` | 开发服务器与 HMR、开发时加载服务端入口、构建并给出规范化的资源清单、跨打包器插件 | `@cormijs/vite`（同时提供 `ctx.vite`）、`@cormijs/rsbuild`（同时提供 `ctx.rsbuild`） |
| `ctx.renderer` | 路由文件扩展名、路由模块导出分析、生成浏览器与服务端入口、按打包器分派的编译插件、生成器模板 | `@cormijs/react`（同时提供 `ctx.react`）、`@cormijs/vue`（同时提供 `ctx.vue`） |

每个实现另外提供一个具名服务作为逃生舱：需要 Vite 特有能力的插件 `inject: ['vite']`，只适用于 React 的插件 `inject: ['react']`。

已经与两者无关、保持不变的部分：`ctx.router` 的路由表、`ctx.html`、`ctx.app`（浏览器插件、全局导入、生成文件、服务端模块）、CLI、工作区、loader 协议，以及**服务端入口契约**——导出 `handler.render(request)`、`handler.loader(request, routeId)`、`modules`、`base`。页面服务、API 路由、静态导出只依赖这个契约。

## 契约

契约在 `@cormijs/core` 的 `bundler.ts`。已经实现的部分：

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

`plugin()` 的参数以打包器名称为键，值是那个打包器自己的插件形式。键与值的类型由打包器包通过声明合并加入 `Bundler.Plugins`（`@cormijs/vite` 加入 `vite: Vite.PluginInput`），所以拼错键名、给错插件形式都是类型错误。unplugin 的各个变体放得进这个对象：`{ vite: () => plugin.vite(options), rspack: () => plugin.rspack(options) }`。修改打包配置也写成打包器插件（Vite 插件的 `config` 钩子、Rsbuild 插件的 `modifyRsbuildConfig`），所以只适用于一种打包器的内容都收在这个对象里。

缺少当前打包器的一项时抛出错误，而不是忽略：插件加载失败，并说明它支持哪些打包器。悄悄跳过会让 tailwind 这类插件“加载成功”却不生效。可有可无的增强（只在 Vite 下才需要的额外配置）由插件写成 `ctx.inject(['vite'], …)`。

第二个实现带来的部分：

```ts
interface Bundler {
  /**
   * 生成热替换代码：import * as name 的模块更新时，以新模块调用 callback。
   * Vite 用 import.meta.hot.accept()；Rspack 用 import.meta.webpackHot.accept()，
   * 它在回调前重新绑定更新过的导入，新模块就是绑定变了的那些
   */
  hotAccept(imports: [specifier: string, name: string][], callback: string): string
}

interface Renderer {
  /** 不是脚本的路由模块的导出，例如 .vue 文件 <script> 块的；脚本由路由器自己读取 */
  routeExports?(file: string): Promise<string[] | undefined>
}
```

原计划中 `Renderer` 的 `compile`（按打包器分派的编译插件）不需要单独的方法：渲染器用 `ctx.bundler.plugin({ vite, rsbuild })` 注册它们，与其他插件相同。

浏览器端同样分两层：

| 包 | 内容 |
|---|---|
| `@cormijs/runtime`（`cormi/client`） | 与 UI 框架无关的浏览器 Context：`$app` 的生命周期与 props、`$router` 的最小契约（`routes`、`load`、`add`、`href`、`navigate`、`preload`、`router/change` 事件）、loader 协议 |
| `@cormijs/react/client`、`@cormijs/vue/client` | 各框架的实现：React 的 `ctx.wrap()`、钩子、基于 React Router 的 `$router`、SSR；Vue 的 `app.use()`、组合式函数、基于 Vue Router 的 `$router`、SSR |

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
| 控制台 | 与应用的打包器、UI 框架解耦 | 控制台作为开发工具自带 Vite 与 React，无论应用用什么；它的 Vite 以路径区分 HMR，与应用的 Vite 共用一个 HTTP 服务也不冲突 |
| UI 框架 API 的导入路径 | `@cormijs/react/client`、`@cormijs/vue/client` | UI 集成是应用的直接依赖，与插件的 `/client` 约定一致；`cormi/client` 变为与框架无关的运行时，`cormi` 不再依赖 React |
| `cormi.yml` 的写法 | 显式组合，保留 preset 简写 | `@cormijs/preset`（应用：路由、HTML、页面、API、服务器）+ 打包器 + UI 框架，选择一目了然；`@cormijs/preset-react` 保留为等价简写 |

```yaml
- name: '@cormijs/preset'      # 应用：title、port、routes、ssr……
  config:
    title: My App
    ssr: true
- name: '@cormijs/vite'        # 打包器：publicPath、outDir、alias……；或 @cormijs/rsbuild
- name: '@cormijs/react'       # UI 框架；或 @cormijs/vue
```

### 第二个实现的取舍

| 问题 | 做法 |
|---|---|
| 打包器与 UI 框架的集成包（`@vitejs/plugin-react`、`@rsbuild/plugin-vue`……） | `@cormijs/react`、`@cormijs/vue` 与官方插件的可选 peer 依赖，用到时才由 `importPeer()` 导入，缺少时报出包名；Vite 应用不会装上 Rspack。`@cormijs/preset-react` 自带 `@vitejs/plugin-react` |
| Rsbuild 的服务端入口 | `node` 环境；应用的依赖从它的 `node_modules` 导入（`autoExternal`），框架只有一份实例，工作区包与浏览器插件的包从源码打包。dev 下产出 CommonJS：Rsbuild 运行 ES 模块的 bundle 需要 `--experimental-vm-modules`，CommonJS 则可以 `require()` ES 模块（Node 22.12） |
| Rsbuild 的 dev 资源 | 来自 manifest（`output.manifest.generate` 在编译时记下）；关闭懒编译，否则服务端渲染的页面拿不到路由的样式 |
| Rsbuild 的 HMR | 中间件模式挂在 `ctx.server` 上，WebSocket 在同一个 HTTP 服务；客户端端口固定为应用的端口，模块联邦的 remote 被其他应用加载时也连回自己 |
| 模块联邦 | Rsbuild 下用 `@module-federation/rsbuild-plugin`，入口异步启动（`asyncStartup`）而不需要 bootstrap 模块；remote 的资源以 `assetPrefix: 'auto'` 从自己的地址加载；服务端用 `NormalModuleReplacementPlugin` 把 remote 换成空组件 |
| Vue 的路由模块 | `loader` 写在 `<script>` 块；剥离发生在编译之前，从源码中去掉——Vue 的编译器在 dev 下把组件的所有顶层绑定交给模板，编译之后再删会留下引用 |
| Vue 的 loader | 在 Vue Router 的 `beforeResolve` 中运行，数据在导航确认后写入；按路由器实例保存，服务端每个请求一份。`useLoaderData()` 通过 `matchedRouteKey` 找到所在的路由 |
| e2e | `--bundler rsbuild` 把示例的 `@cormijs/vite` 换成 `@cormijs/rsbuild`（或把 `@cormijs/preset-react` 展开），用 `--config` 运行生成的插件树 |

## 插件的分类

| 类别 | 插件 | 写法 |
|---|---|---|
| 通用 | mock、analytics、export-static、lint | 只用通用服务 |
| 按打包器适配 | tailwindcss、mf（Vite、Rsbuild）；unocss（Vite） | `ctx.bundler.plugin({ vite, … })` |
| React | model、initial-state、request、react-query、dva、valtio、antd、layout、mpa、qiankun 主应用；styled-components 另按打包器适配 | `inject: ['react']` |
| Vite | legacy | `inject: ['vite']` |
| React 与 Vite | federation、qiankun 子应用 | `inject: ['vite', 'react']` |

legacy 是 `@vitejs/plugin-legacy` 的封装，Rsbuild 自己按 browserslist 降级，不需要它。federation 的子包是 `@module-federation/vite` 的 ES 模块容器，所以底座也注入 `vite`。

## 实施阶段

每个阶段结束时，全部示例的 e2e（preview 与 dev）保持通过。

1. **无行为变化的拆分**（已完成）：`@cormijs/client` 拆为 `@cormijs/runtime` 与 `@cormijs/react`；preset 中的 React 渲染器移入 `@cormijs/react`，与 UI 框架无关的部分成为 `@cormijs/preset`；`@cormijs/vite` 提供 `bundler`；页面服务中 Vite 特有的逻辑移到 `bundler` 接口之后；core 不再写死 `.tsx`；`cormi` 不再依赖 React 与 Vite。只适用于 Vite 的插件已改用 `ctx.vite` 的类型并以 `@cormijs/vite` 为 peer 依赖。
2. **插件分类与改造**（已完成）：`ctx.bundler.plugin()` 与 `Bundler.Plugins`；React 渲染器、文件约定、tailwindcss、unocss、styled-components 通过它注册打包器插件，不再注入 `vite`；React 插件声明 `inject: ['react']`；plugin-lint 只在 React 应用中启用 hooks 规则。分类见下表。
3. **第二实现**（已完成）：`@cormijs/rsbuild`；React、文件约定、tailwindcss、mf 的 Rsbuild 实现；`@cormijs/vue` 与 `with-vue` 示例。e2e 是组合矩阵：Vite 上全部示例，Rsbuild 上 basic、with-tailwind、with-vue 与模块联邦，各自 preview 与 dev。
4. **控制台解耦**（已完成）：控制台自带 Vite 与 React，以中间件模式挂在 `/__cormi/`，入口是它自己的虚拟模块，不再写进应用的 `src/.cormi`；概览显示打包器与 UI 框架（契约增加 `version`），“应用”页列出打包器解析出的插件。e2e 中控制台在 Vite、Rsbuild 应用与 Vue 应用里都被检查。
