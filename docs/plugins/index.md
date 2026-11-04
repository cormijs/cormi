# 官方插件

每个官方插件都是普通的 cordis 插件：写进 `cormi.yml` 即启用，删掉条目或设置 `disabled: true` 即卸载。带浏览器端的插件从 `@cormijs/plugin-*/client` 导出 API。

| 插件 | 作用 | 要求 |
|---|---|---|
| **数据与状态** | | |
| [`@cormijs/plugin-model`](/plugins/data#model) | `src/models` 中的 hook 即全局模型，`useModel(namespace, selector?)` | React |
| [`@cormijs/plugin-initial-state`](/plugins/data#initial-state) | 运行时插件监听 `initialState/load` 提供初始状态，`useInitialState()` 读取 | React |
| [`@cormijs/plugin-request`](/plugins/data#request) | 基于 fetch 的 `request()` 与基于 ahooks 的 `useRequest()`，拦截与错误处理用事件 | React |
| [`@cormijs/plugin-react-query`](/plugins/data#react-query) | 每个渲染的应用一个 `QueryClient`，dev 下显示 devtools | React |
| [`@cormijs/plugin-dva`](/plugins/data#dva) | dva-core 与 dva-loading，模型来自 `src/models`，可选 immer | React |
| [`@cormijs/plugin-valtio`](/plugins/data#valtio) | valtio，`defineStore()` 在 dev 下接入 Redux DevTools | React |
| **界面与样式** | | |
| [`@cormijs/plugin-antd`](/plugins/ui#antd) | Ant Design 的主题与语言，SSR 时抽取样式 | React |
| [`@cormijs/plugin-layout`](/plugins/ui#layout) | 基于 antd 的布局，由路由生成菜单与面包屑 | React |
| [`@cormijs/plugin-tailwindcss`](/plugins/ui#tailwindcss) | Tailwind CSS v4 | Vite、Rsbuild¹ |
| [`@cormijs/plugin-unocss`](/plugins/ui#unocss) | UnoCSS | Vite¹ |
| [`@cormijs/plugin-styled-components`](/plugins/ui#styled-components) | `ThemeProvider` 与 SSR 样式抽取 | React · Vite¹ |
| **构建与开发** | | |
| [`@cormijs/plugin-mock`](/plugins/build#mock) | `mock/**` 中的 mock 接口，优先于真实 API | — |
| [`@cormijs/plugin-export-static`](/plugins/build#export-static) | 构建后把路由预渲染为 HTML，供静态托管 | — |
| [`@cormijs/plugin-legacy`](/plugins/build#legacy) | 为不支持模块脚本的浏览器构建 legacy bundle | Vite |
| [`@cormijs/plugin-mpa`](/plugins/build#mpa) | 多页应用：每个页面一个 HTML | React |
| [`@cormijs/plugin-analytics`](/plugins/build#analytics) | Google Analytics 4 与百度统计 | — |
| [`@cormijs/plugin-lint`](/plugins/build#lint) | `cormi lint` | — |
| **服务端** | | |
| [`@cormijs/plugin-session`](/guide/auth#会话) | cookie 会话，`state.session`，存在 `ctx.cache` | — |
| [`@cormijs/plugin-auth`](/guide/auth#登录) | 登录用户 `state.user`，要求登录的接口，密码散列 | — |
| [`@cormijs/plugin-security`](/guide/auth#安全响应头) | 安全响应头 | — |
| [`@cormijs/plugin-cors`](/guide/auth#跨域) | 接口的跨域请求 | — |
| [`@cormijs/plugin-rate-limit`](/guide/auth#限流) | 按客户端与时间窗口限流，计数存在 `ctx.cache` | — |
| **微前端与联邦** | | |
| [`@cormijs/plugin-federation`](/plugins/micro#federation) | 联邦应用：子包单独构建、部署，底座按 URL 汇集成一个应用 | React · Vite |
| [`@cormijs/plugin-mf`](/plugins/micro#mf) | 模块联邦 | Vite、Rsbuild¹ |
| [`@cormijs/plugin-qiankun`](/plugins/micro#qiankun) | qiankun 主应用，以及由 Vite 构建的 qiankun 子应用 | React；子应用另需 Vite |

“要求”是插件需要的 UI 框架与打包器，“—”表示都可以。在不满足要求的应用里，插件转入 pending（控制台显示它在等待的服务），或者加载失败并说明原因。

¹ 通过 `ctx.bundler.plugin()` 为每个打包器各给一个插件；只列出 Vite 的，表示其他打包器的还没有提供。各打包器的集成包由应用安装，例如 tailwindcss 在 Vite 下需要 `@tailwindcss/vite`、在 Rsbuild 下需要 `@tailwindcss/postcss`，mf 需要 `@module-federation/vite` 或 `@module-federation/rsbuild-plugin`。

## 依赖

插件把运行时库作为自己的依赖，但有几个库需要应用自己安装：页面会直接导入它们，或者服务端渲染、模块共享要求它们从应用的位置解析。

| 插件 | 应用需要依赖 |
|---|---|---|
| `plugin-antd`、`plugin-layout` | `antd`、`@ant-design/cssinjs`（plugin-layout 通常与 plugin-antd 一起使用） |
| `plugin-react-query` | `@tanstack/react-query`（在页面中导入 `useQuery` 等） |
| `plugin-styled-components` | `styled-components` |
| `plugin-federation` | 共享的单例，如 `react-router`、`cordis` |

`plugin-antd` 缺少 `@ant-design/cssinjs`、`plugin-federation` 缺少共享依赖时，会在启动时给出警告。
