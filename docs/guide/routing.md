# 路由与数据

路由表与 loader 协议与 UI 框架无关；在 React 应用中，路由运行在 React Router 7 的数据路由上。`@cormijs/react/client` 重新导出了 React Router 的全部 API（`useParams`、`useLoaderData`、`useNavigate`、`redirect`……），页面和插件都从这里导入。约定式路由的扩展名由 UI 框架注册：React 是 `.tsx` 与 `.jsx`，此外 `.ts`、`.js` 总是可用。

## 约定式路由

`src/pages` 下的文件就是路由：

| 文件 | 路径 |
|---|---|
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` |
| `docs/$.tsx` | `/docs/*` |
| `not.nested.tsx` | `/not/nested` |
| `404.tsx` | `*`，所有未匹配的路径 |

同时存在 `users.tsx` 和 `users/` 目录时，`users.tsx` 是 `users/` 下各路由的布局，在其中用 `<Outlet />` 渲染子路由。

dev 模式下，新增或删除页面文件，路由表会随即更新。

## 布局

`src/layouts/index.tsx` 包裹所有路由：

::: code-group

```tsx [src/layouts/index.tsx]
import { Link, Outlet } from '@cormijs/react/client'

export default function Layout() {
  return (
    <>
      <nav>
        <Link to="/">首页</Link>
        <Link to="/users" prefetch="intent">用户</Link>
      </nav>
      <main><Outlet /></main>
    </>
  )
}
```

:::

不需要全局布局时，在 preset 配置中设置 `layout: false`；只让某个配置式路由跳过布局，给它设置 `layout: false`。

## 配置式路由

在 preset 配置中写 `routes`，就不再扫描 `src/pages`：

```yaml
- name: '@cormijs/preset'
  config:
    routes:
      - path: /
        component: index            # 相对于 src/pages
        name: 首页
        icon: HomeOutlined
      - path: /users
        name: 用户
        routes:
          - path: /users
            component: users/index
          - path: /users/:id
            component: users/detail
            hideInMenu: true
      - path: /login
        component: login
        layout: false               # 不使用全局布局
```

`name`、`icon`、`hideInMenu` 会作为路由的 `meta` 发送到浏览器，[`@cormijs/plugin-layout`](/plugins/ui#layout) 用它们生成菜单和面包屑。插件也可以在运行时用 `ctx.router.route()`、`ctx.router.patch()` 增改路由，见 [Node 端服务](/plugin/services#ctx-router)。

## 路由模块

页面文件可以导出这些成员：

```tsx
export default function Page() {}                                  // 页面组件
export async function loader({ request, params }) {}              // 仅在服务端运行，会从客户端 bundle 中剥离
export async function clientLoader({ request, params, serverLoader }) {} // 在浏览器运行
export function ErrorBoundary() {}                                // 本路由出错时渲染
export function HydrateFallback() {}                              // hydrate 前，数据尚未就绪时渲染
export const handle = {}                                          // 任意静态数据，用 useMatches() 读取
export function shouldRevalidate() {}                             // 控制导航后是否重新加载数据
```

## 加载数据

服务端 `loader` 可以访问数据库、文件系统和密钥，它的代码不会进入浏览器：

::: code-group

```tsx [src/pages/about.tsx]
import { useLoaderData } from '@cormijs/react/client'

export async function loader() {
  const { platform } = await import('node:os')
  return { platform: platform() }
}

export default function About() {
  const data = useLoaderData<typeof loader>()
  return <p>运行在 {data.platform} 上</p>
}
```

:::

- 开启 SSR 时，首屏的数据由服务端渲染时直接取得，随页面一起 hydrate。
- 客户端导航时，数据从 `<base>/__cormi/loader` 端点获取。`loader` 中抛出的 `redirect()` 同样生效。
- 纯客户端渲染（`ssr: false`）的应用也可以使用服务端 `loader`，只要它运行在 `cormi dev` 或 `cormi preview` 之上。

`clientLoader` 在浏览器中运行，可以通过 `serverLoader()` 调用同一路由的服务端 `loader`，再加以处理：

```tsx
export async function clientLoader({ serverLoader }) {
  const cached = sessionStorage.getItem('users')
  return cached ? JSON.parse(cached) : serverLoader()
}
```

## 链接与预加载

`@cormijs/react/client` 的 `<Link>` 是 React Router 的 `<Link>`，额外支持 `prefetch`，提前加载目标路由的模块：

| `prefetch` | 时机 |
|---|---|
| `none` | 不预加载（默认） |
| `intent` | 鼠标悬停或获得焦点时 |
| `render` | 链接渲染时 |
| `viewport` | 链接进入视口时 |

在代码中可以调用 `ctx.$router.preload('/users')`，或用 `ctx.$router.navigate()` 导航。

## 运行时添加路由

浏览器插件可以在运行时添加路由，插件卸载时它们会被移除。[联邦应用](/plugins/micro#federation) 就是这样把子包的路由接入底座的：

```ts
ctx.$router.add(
  [{ id: 'reports', path: '/reports', parentId: '@@/global-layout' }],
  { reports: () => import('./pages/reports') },
)
```

见 [浏览器端](/plugin/client#ctx-router)。
