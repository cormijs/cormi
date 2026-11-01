# 浏览器端

浏览器里的运行时是一个 cordis `Context`，与 koishi-webui 的模型相同。它分两层：`cormi/client` 是与 UI 框架无关的部分（`$app` 的生命周期与 props、`$router` 的路由表与导航、loader 协议），UI 框架在此之上提供自己的 API——React 应用从 `@cormijs/react/client` 导入，Vue 应用从 `@cormijs/vue/client` 导入（见 [Vue](#vue)）。浏览器插件的形式是：

```tsx
import type { Context } from '@cormijs/react/client'

export default (ctx: Context, config: { color: string }) => {
  ctx.wrap(({ children }) => <ThemeContext value={config.color}>{children}</ThemeContext>)
  ctx.on('router/change', (location) => { /* ... */ })
}
```

浏览器插件有两个来源：应用自己的 `src/app.tsx`，以及 Node 插件通过 `ctx.app.entry(module, config)` 注册的模块。它们按注册顺序挂载；入口会等所有插件应用完毕（包括异步的 `apply`）再渲染应用。

## 核心服务

核心服务在根上提供，任何浏览器插件都无需 inject。名字带 `$`，与 Node 端的 `ctx.app`、`ctx.router` 在类型上互不冲突。

### ctx.$app

应用的根组件。

| 成员 | 说明 |
|---|---|
| `wrap(component, order?)` | 用组件包裹应用根部，也可以写作 `ctx.wrap()`。`order` 大的在外层，相同时后注册的在外层；Vue 的包装组件渲染默认插槽 |
| `use(plugin, ...options)`（Vue） | 安装一个 Vue 插件，即 `app.use()` |
| `props` | 宿主（如 qiankun 主应用）传入的 props；独立运行时为空对象 |
| `setProps(props)` | 更新 props，触发 `app/props` |

包装器是 effect，插件卸载时被拆除。包装器变化会让根组件重新渲染其下的树，所以需要全局 Provider 的插件应在应用挂载前注册。

### ctx.$router

路由表、模块与导航。React 应用中由 React Router 7 的数据路由实现，Vue 应用中由 Vue Router 实现（路由以 id 命名）。

| 成员 | 说明 |
|---|---|
| `routes` | 路由清单 `{ [id]: RouteData }`，含 `path`、`parentId`、`meta` |
| `router` | React Router 或 Vue Router 的路由器实例，应用渲染后可用 |
| `add(routes, modules?)` | 在运行时添加路由；已渲染时直接修补路由器，插件卸载时移除 |
| `navigate(to, options?)` | 导航 |
| `href(location)` | 一个位置的 URL：带上 basename，hash 模式下在 `#` 之后 |
| `preload(path)` | 加载匹配路由的模块，例如链接悬停时 |
| `load(id)` | 加载一个路由模块（结果被缓存） |
| `base`、`basename` | 应用自己的 base；路由实际运行的 basename（被宿主挂在子路径下时二者不同） |

用路由清单的 `meta` 生成菜单：

```tsx
import { Link, useCordis } from '@cormijs/react/client'

export function Menu() {
  const { $router } = useCordis()
  const items = Object.values($router.routes).filter(route => route.meta?.name && !route.meta.hideInMenu)
  return <nav>{items.map(route => <Link key={route.id} to={route.path!}>{route.meta!.name}</Link>)}</nav>
}
```

`add()` 的路由以 `parentId` 指定挂载位置，`modules` 提供懒加载的路由模块：

```ts
ctx.$router.add(
  [
    { id: 'reports', path: '/reports', parentId: '@@/global-layout', meta: { name: '报表' } },
    { id: 'reports/detail', path: ':id', parentId: 'reports' },
  ],
  {
    'reports': () => import('./pages/Reports'),
    'reports/detail': () => import('./pages/ReportDetail'),
  },
)
```

## 事件

| 事件 | 方式 | 时机 |
|---|---|---|
| `router/change(location, action)` | emit | 位置变化，包括初始位置 |
| `app/bootstrap()` | bail | 入口即将挂载应用；返回 `true` 表示由该插件接管挂载 |
| `app/mount()` | emit | 应用渲染进页面之后 |
| `app/props(props)` | emit | 宿主更新了传入的 props |

## React 钩子

| 钩子 | 说明 |
|---|---|
| `useCordis()` | 应用的根 Context |
| `useContext()` | 派生一个随组件卸载而销毁的 Context，在组件里注册的监听、包装器随组件一起清理（同 koishi） |
| `useHostProps()` | 宿主传入的 props |
| `useServerInsertedHTML(fn)` | SSR 时向 `<head>` 插入 HTML，供 CSS-in-JS 库使用 |

```tsx
import { useContext } from '@cormijs/react/client'
import { useEffect } from 'react'

function Tracker() {
  const ctx = useContext()
  useEffect(() => {
    // 不需要返回清理函数：组件卸载时，ctx 连同这个监听一起销毁
    ctx.on('router/change', location => report(location.pathname))
  }, [ctx])
  return null
}
```

## Vue

Vue 应用的浏览器插件与 React 的写法相同，只是从 `@cormijs/vue/client` 导入，并多了 `ctx.$app.use()`：

```ts
import type { Context } from '@cormijs/vue/client'
import { createPinia } from 'pinia'

export default (ctx: Context) => {
  ctx.$app.use(createPinia())
}
```

Vue 插件无法卸载，所以 `use()` 的注册被撤回时，应用会重新挂载一次。组合式函数：

| 函数 | 说明 |
|---|---|
| `useCordis()` | 应用的根 Context |
| `useContext()` | 派生一个随组件作用域销毁的 Context |
| `useHostProps()` | 宿主传入的 props，一个 ref |
| `useLoaderData()` | 当前路由组件的 loader 数据，一个 computed ref |

`@cormijs/vue/client` 还重新导出了 Vue Router（`RouterLink`、`RouterView`、`useRoute`……）与 `redirect()`。

## 入口的生命周期

生成的入口导出 `bootstrap`、`mount(options)`、`update(options)`、`unmount`。默认情况下入口自己调用 `mount()`；某个插件在 `app/bootstrap` 中返回 `true` 时，由它接管——例如 qiankun 子应用由主应用调用 `mount({ container, basename, origin, props })`。

## 服务端渲染

开启 SSR 时，服务端同样会创建 Context 并应用浏览器插件，用来渲染页面。只能在浏览器中运行的代码，放进事件监听或 `useEffect`，或用 `typeof window` 判断。

## 热更新

dev 模式下，浏览器插件模块更新时，入口只卸载并重新应用这一个插件的 fiber，其他插件不受影响。
