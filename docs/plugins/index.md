# 官方插件

每个官方插件都是普通的 cordis 插件：写进 `cormi.yml` 即启用，删掉条目或设置 `disabled: true` 即卸载。带浏览器端的插件从 `@cormi/plugin-*/client` 导出 API。

| 插件 | 作用 |
|---|---|
| **数据与状态** | |
| [`@cormi/plugin-model`](/plugins/data#model) | `src/models` 中的 hook 即全局模型，`useModel(namespace, selector?)` |
| [`@cormi/plugin-initial-state`](/plugins/data#initial-state) | 运行时插件监听 `initialState/load` 提供初始状态，`useInitialState()` 读取 |
| [`@cormi/plugin-request`](/plugins/data#request) | 基于 fetch 的 `request()` 与基于 ahooks 的 `useRequest()`，拦截与错误处理用事件 |
| [`@cormi/plugin-react-query`](/plugins/data#react-query) | 每个渲染的应用一个 `QueryClient`，dev 下显示 devtools |
| [`@cormi/plugin-dva`](/plugins/data#dva) | dva-core 与 dva-loading，模型来自 `src/models`，可选 immer |
| [`@cormi/plugin-valtio`](/plugins/data#valtio) | valtio，`defineStore()` 在 dev 下接入 Redux DevTools |
| **界面与样式** | |
| [`@cormi/plugin-antd`](/plugins/ui#antd) | Ant Design 的主题与语言，SSR 时抽取样式 |
| [`@cormi/plugin-layout`](/plugins/ui#layout) | 基于 antd 的布局，由路由生成菜单与面包屑 |
| [`@cormi/plugin-tailwindcss`](/plugins/ui#tailwindcss) | Tailwind CSS v4 |
| [`@cormi/plugin-unocss`](/plugins/ui#unocss) | UnoCSS |
| [`@cormi/plugin-styled-components`](/plugins/ui#styled-components) | `ThemeProvider` 与 SSR 样式抽取 |
| **构建与开发** | |
| [`@cormi/plugin-mock`](/plugins/build#mock) | `mock/**` 中的 mock 接口，优先于真实 API |
| [`@cormi/plugin-export-static`](/plugins/build#export-static) | 构建后把路由预渲染为 HTML，供静态托管 |
| [`@cormi/plugin-legacy`](/plugins/build#legacy) | 为不支持模块脚本的浏览器构建 legacy bundle |
| [`@cormi/plugin-mpa`](/plugins/build#mpa) | 多页应用：每个页面一个 HTML |
| [`@cormi/plugin-analytics`](/plugins/build#analytics) | Google Analytics 4 与百度统计 |
| [`@cormi/plugin-lint`](/plugins/build#lint) | `cormi lint` |
| **微前端与联邦** | |
| [`@cormi/plugin-federation`](/plugins/micro#federation) | 联邦应用：子包单独构建、部署，底座按 URL 汇集成一个应用 |
| [`@cormi/plugin-mf`](/plugins/micro#mf) | 模块联邦（`@module-federation/vite`） |
| [`@cormi/plugin-qiankun`](/plugins/micro#qiankun) | qiankun 主应用，以及由 Vite 构建的 qiankun 子应用 |

## 依赖

插件把运行时库作为自己的依赖，但有几个库需要应用自己安装：页面会直接导入它们，或者服务端渲染、模块共享要求它们从应用的位置解析。

| 插件 | 应用需要依赖 |
|---|---|
| `plugin-antd`、`plugin-layout` | `antd`、`@ant-design/cssinjs`（plugin-layout 通常与 plugin-antd 一起使用） |
| `plugin-react-query` | `@tanstack/react-query`（在页面中导入 `useQuery` 等） |
| `plugin-styled-components` | `styled-components` |
| `plugin-federation` | 共享的单例，如 `react-router`、`cordis` |

`plugin-antd` 缺少 `@ant-design/cssinjs`、`plugin-federation` 缺少共享依赖时，会在启动时给出警告。
