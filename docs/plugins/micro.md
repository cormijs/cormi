# 微前端与联邦

三个插件解决的问题不同：

| | federation | mf | qiankun |
|---|---|---|---|
| 场景 | 多个团队用同一技术栈维护一个大应用 | 在应用之间共享个别模块 | 把不同技术栈、各自独立的应用拼在一起 |
| 子应用是什么 | 底座里的 cordis 插件，页面在底座的路由器里渲染 | 一个暴露模块的容器 | 一个完整的应用，挂载进主应用的容器 |
| 依赖 | 框架与基础库是全局单例 | 按配置共享 | 各自一份 |
| 隔离 | 不隔离，靠 cordis 的插件边界 | 不隔离 | JS 沙箱与样式隔离 |
| 如何链接 | 底座运行时读取子包 URL 列表 | 构建时声明 remote | 主应用配置子应用入口 |

## federation

联邦应用：每个子包（package）是一个独立的 Cormi 应用，可以单独开发、单独构建、单独部署；底座（host）启动时按 URL 收集子包，把它们的页面接入自己的路由和布局。这一设计来自 HZERO 的“模块联邦微前端”。

### 底座

```yaml
- name: '@cormi/preset-react'
- name: '@cormi/plugin-federation/host'
  config:
    packages:
      - https://cdn.example.com/users/
      - url: https://cdn.example.com/orders/
        eager: true
    shared: [antd]
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `packages` | `[]` | 子包部署的 URL，或 `{ url, eager }`；`eager` 覆盖子包清单中的设置 |
| `shared` | `[]` | 默认单例之外的共享依赖，如 antd、公共组件库 |
| `parent` | 第一个顶层布局 | 子包的顶层路由挂在哪个路由下 |
| `name` | 包名 | 底座的容器名 |
| `override` | dev 下为 `true` | 允许 `localStorage['cormi:packages']` 添加或替换子包 |

`packages` 会写进构建产物 `packages.json`。部署后直接修改这个文件，就能增删子包、改变子包地址，而不必重新构建底座。

### 子包

```yaml
- name: '@cormi/preset-react'
  config:
    routes:
      - path: /orders
        component: orders/index
        name: 订单
      - path: /orders/:id
        component: orders/detail
        hideInMenu: true
- name: '@cormi/plugin-model'
- name: '@cormi/plugin-federation/package'
  config:
    name: orders
    entries: ['@cormi/plugin-model/client']
    exposes:
      ./CartBadge: ./src/components/CartBadge.tsx
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `name` | 包名 | 容器名，底座以 `<name>/<expose>` 导入它的模块 |
| `eager` | `false` | 随底座启动加载，而不是在访问其路由时加载 |
| `entries` | `[]` | 随子包一起进入底座的插件运行时，如 `@cormi/plugin-model/client` |
| `exposes` | `{}` | 底座和其他子包可以导入的模块 |
| `shared` | `[]` | 默认单例之外的共享依赖，需与底座一致 |

子包的构建除了能独立运行的产物，还会输出 `remoteEntry.js` 和清单 `federation.json`（名称、版本、入口，以及 JSON 形式的路由表）。资源以相对路径加载，产物可以部署在任意 URL。

### 运行方式

1. 底座在浏览器中读取 `packages.json`，并行获取各子包的 `federation.json`。获取失败的子包被跳过，不影响应用启动。
2. 所有子包的路由立即挂进底座的路由表，所以菜单从一开始就是完整的；`eager` 子包随即加载。
3. 首次访问某个子包的路由时，底座加载这个子包：在一个子 fiber 里应用它的运行时插件（`src/app.tsx`、全局样式、`entries`），再加载页面模块。

子包的页面在底座的布局里渲染。子包自己的顶层布局和 404 页只在它独立运行时使用。

### 共享

react、react-dom、react-router、cordis 与 `cormi/client` 默认以单例共享，`shared` 可以追加。子包之间的协作有两种方式：

```tsx
// 1. 渲染其他子包暴露的组件，它所属的子包会先加载
import { RemoteComponent } from '@cormi/plugin-federation/client'

<RemoteComponent id="orders/CartBadge" fallback={<span>…</span>} />
```

```ts
// 2. 子包的运行时插件提供 cordis 服务，底座与其他子包使用它
export default (ctx: Context) => {
  ctx.plugin(UserDirectory)    // 提供 ctx.users
}

// 别处
const users = ctx.get('users')
```

提供服务的子包应设为 `eager`，确保使用者访问时它已加载。底座也可以通过 `ctx.$federation` 访问子包：`packages` 列出它们，`load(name)` 加载一个子包，`import(id)` 导入一个暴露的模块。

### 开发

- 子包 `cormi dev` 时仍是一个独立的应用（带着自己的布局），同时提供 `/federation.json` 与 `remoteEntry.js`。
- dev 模式下，底座读取 `localStorage['cormi:packages']`（URL 数组）。在部署好的底座上把某个子包指向本地开发服务器：

```js
localStorage.setItem('cormi:packages', JSON.stringify(['http://localhost:8011/']))
```

### 约束

- 共享依赖要是应用的直接依赖（pnpm 下 `react-router`、`cordis` 也要写进 package.json），否则插件会警告：模块联邦按应用能解析的包来共享和预构建。
- 子包部署的服务器需允许底座跨域读取（CORS）；`cormi dev` 与 `cormi preview` 已经允许。
- 子包页面在浏览器中运行，用 `clientLoader` 获取数据；导出服务端 `loader` 的路由会在构建时警告。
- 子包的顶层路由使用绝对路径，子包的页面宜放在自己的前缀下（如 `/orders`）。
- 懒加载的子包注册 `ctx.wrap()` 包装器时，根组件会重新挂载一次；需要全局 Provider 的子包宜设为 `eager`。

## mf

模块联邦（`@module-federation/vite`）：在应用之间共享个别模块。

```yaml
# remote：暴露模块
- name: '@cormi/plugin-mf'
  config:
    name: remote
    exposes:
      ./Greeting: ./src/components/Greeting.tsx

# host：导入模块
- name: '@cormi/plugin-mf'
  config:
    name: host
    remotes:
      remote: http://localhost:8002/remoteEntry.js
```

```tsx
import { lazy } from 'react'

const Greeting = lazy(() => import('remote/Greeting'))
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `name` | — | 容器名，必填 |
| `remotes` | `{}` | 导入的 remote：入口 URL，或 `{ entry, name }` |
| `exposes` | `{}` | 暴露的模块 |
| `shared` | `['react', 'react-dom']` | 共享依赖：名称数组，或 `{ [名称]: { singleton, requiredVersion, eager } }` |
| `filename` | `remoteEntry.js` | remote 入口的文件名 |
| `dts` | `true` | 生成暴露模块的类型，并下载 remote 的类型 |

host 在应用入口中初始化（Cormi 的应用没有 index.html）。服务端渲染时 remote 的模块渲染为空，由浏览器加载。暴露模块的应用会允许跨域访问。

## qiankun

### 主应用

```yaml
- name: '@cormi/plugin-qiankun/master'
  config:
    apps:
      - name: app1
        entry: //localhost:8001
        props:
          from: master
    routes:
      - path: /app1/*
        app: app1
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `apps` | `[]` | 子应用：`{ name, entry, props }` |
| `routes` | `[]` | 渲染子应用的路由：`{ path, app, props }` |
| `sandbox` | `true` | qiankun 的沙箱；也可以是 `{ strictStyleIsolation, experimentalStyleIsolation }` |
| `prefetch` | `true` | 主应用挂载后预加载子应用 |

不通过路由时，用组件渲染子应用：

```tsx
import { MicroApp } from '@cormi/plugin-qiankun/master/client'

<MicroApp name="app1" base="/app1" />
```

### 子应用

由 Vite 构建的 Cormi 应用作为 qiankun 子应用。文档中的模块脚本会被替换为 qiankun 能执行的加载脚本，由它在主应用的容器里——或独立运行时在页面里——挂载应用。

```yaml
- name: '@cormi/plugin-qiankun/slave'
  config:
    name: app1
```

```tsx
import { useInQiankun, useMasterProps } from '@cormi/plugin-qiankun/slave/client'

const inQiankun = useInQiankun()
const { from } = useMasterProps()
```

子应用的路由运行在主应用分配的 basename 下；服务端 `loader` 的请求发往子应用自己的服务器。

已知限制：ES 模块在真实的 `window` 上运行，不在 qiankun 的 JS 沙箱里；Vite 注入到 `document.head` 的样式不受样式隔离约束。这一点与 vite-plugin-qiankun 相同。
