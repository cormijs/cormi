# 打包器与 UI 框架

打包器与 UI 框架是 `cormi.yml` 里的两个条目：

```yaml
- name: '@cormi/preset'      # 应用：路由、HTML、页面、API、服务器
  config:
    title: My App
    ssr: true
- name: '@cormi/rsbuild'     # 或 @cormi/vite
- name: '@cormi/vue'         # 或 @cormi/react
```

换一个打包器或 UI 框架，就是换掉一行，再装上它的依赖。路由表、HTML、页面服务、API 路由、loader、插件树、控制台在各种组合下的用法都一样。

## 组合与依赖

每个组合除了 Cormi 的两个包，还要安装 UI 框架本身和它在这个打包器上的集成：

| 组合 | 依赖 |
|---|---|
| Vite + React | `@cormi/vite`、`@cormi/react`、`@vitejs/plugin-react`、`react`、`react-dom` |
| Rsbuild + React | `@cormi/rsbuild`、`@cormi/react`、`@rsbuild/plugin-react`、`react`、`react-dom` |
| Vite + Vue | `@cormi/vite`、`@cormi/vue`、`@vitejs/plugin-vue`、`vue` |
| Rsbuild + Vue | `@cormi/rsbuild`、`@cormi/vue`、`@rsbuild/plugin-vue`、`vue` |

集成包是 `@cormi/react`、`@cormi/vue` 的可选 peer 依赖：只在应用使用对应的打包器时才被导入，所以 Vite 应用不会装上 Rspack，反之亦然。缺少时，启动会报出要安装的包名，例如 `@cormi/react with rsbuild needs @rsbuild/plugin-react: add it to the dependencies of the app`。`@cormi/preset-react`（preset + Vite + React 的简写）自带 `@vitejs/plugin-react`。

有些官方插件也按打包器适配，例如 tailwindcss 在 Vite 下需要 `@tailwindcss/vite`，在 Rsbuild 下需要 `@tailwindcss/postcss`；只适用于某个 UI 框架或打包器的插件见 [官方插件](/plugins/) 的“要求”一栏。

想先试一试另一个组合，可以把改过的插件树另存一份，用 `--config` 运行：

```sh
cormi dev --config cormi.rsbuild.yml
```

## 打包器

`@cormi/vite` 与 `@cormi/rsbuild` 的配置项相同：

| 配置 | 默认值 | 说明 |
|---|---|---|
| `publicPath` | `/` | 资源的 URL 前缀 |
| `outDir` | `dist` | 构建输出目录 |
| `alias` | `{}` | 模块别名，`foo$` 只匹配完整的说明符；`@/`、`@@/` 是内置的 |
| `define` | `{}` | 编译时替换 |
| `sourcemap` | `false` | 构建时输出 source map |
| `targets` | — | 目标浏览器：`{ chrome: 87 }`，或 esbuild 目标（Vite）/ browserslist 查询（Rsbuild） |
| `vite` / `rsbuild` | — | 原样合并进打包器配置 |

两者的不同之处：

| | Vite | Rsbuild |
|---|---|---|
| 浏览器可读的环境变量 | `VITE_*`、`CORMI_APP_*` | `CORMI_APP_*`、`PUBLIC_*` |
| Less、Sass | 装上 `less`、`sass` 即可 | 另需 `@rsbuild/plugin-less`、`@rsbuild/plugin-sass` |
| 只适用于它的插件 | `ctx.vite.plugin()`，`inject: ['vite']` | `ctx.rsbuild.plugin()`，`inject: ['rsbuild']` |

两个打包器都提供 `import.meta.env.MODE`、`DEV`、`PROD`、`SSR`。Rsbuild 把应用构建为两个环境：`web`（浏览器入口）与 `node`（服务端入口），服务端入口的依赖从应用的 `node_modules` 导入。为了让服务端渲染的页面带上路由的样式，Rsbuild 在 dev 模式下预先编译所有路由，不使用懒编译。

Rsbuild 的插件写在一个本地插件里，例如 Less：

```ts
// plugin.ts，写进 cormi.yml
import { pluginLess } from '@rsbuild/plugin-less'
import type { Context } from 'cormi'
import type {} from '@cormi/rsbuild'

export const inject = ['rsbuild']

export function apply(ctx: Context) {
  ctx.rsbuild.plugin(pluginLess())
}
```

## UI 框架

| | React | Vue |
|---|---|---|
| 路由模块 | `.tsx`、`.jsx` | `.vue` 单文件组件 |
| 浏览器端 API | `@cormi/react/client` | `@cormi/vue/client` |
| 路由器 | React Router | Vue Router |
| `loader`、`clientLoader` | 路由模块的导出 | 单文件组件 `<script>` 块的导出 |
| 读取 loader 数据 | `useLoaderData()` | `useLoaderData()`，返回一个 computed ref |
| 包裹根组件 | `ctx.wrap(Component)` | `ctx.wrap(Component)`，渲染默认插槽 |
| 安装框架插件 | — | `ctx.$app.use(plugin)`，即 `app.use()` |

与 UI 框架无关的部分完全相同：约定式与配置式路由、布局、`src/app.ts` 运行时插件、`ctx.$router.add()`、`router/change` 等事件、loader 端点与 SSR。

### Vue 的路由模块

`loader` 写在普通的 `<script>` 块里（`<script setup>` 不能导出），它和只被它用到的导入会从客户端代码中去掉：

```vue
<!-- src/pages/about.vue -->
<script lang="ts">
import { platform } from 'node:os'

export async function loader() {
  return { platform: platform() }
}
</script>

<script setup lang="ts">
import { useLoaderData } from '@cormi/vue/client'

const data = useLoaderData<Awaited<ReturnType<typeof loader>>>()
</script>

<template>
  <p>served by {{ data.platform }}</p>
</template>
```

loader 在导航确认之前运行，返回 `redirect('/login')` 时导航被重定向；服务端渲染时变为 302。布局是 `src/layouts/index.vue`，用 `<RouterView />` 渲染子路由；链接用 `RouterLink`。这些都可以从 `@cormi/vue/client` 导入，它重新导出了 Vue Router。

### Vue 的运行时插件

```ts
// src/app.ts
import type { Context } from '@cormi/vue/client'
import { createPinia } from 'pinia'

export default (ctx: Context) => {
  ctx.$app.use(createPinia())
  ctx.on('router/change', location => console.log(location.pathname))
}
```

Vue 插件无法卸载：`ctx.$app.use()` 注册的插件被撤回时，应用会重新挂载一次。示例 `examples/with-vue` 展示了上面的写法。
