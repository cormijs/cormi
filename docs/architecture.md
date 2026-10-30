# Cormi 架构

Cormi 是一个以 Cordis 4 为宿主的 React 全栈框架。它不是 umi 的克隆：umi 只作为「全栈框架该有哪些能力」的清单，API 形态完全遵循 cordis / koishi 的哲学。

## 原则

1. **一切皆插件。** 内置能力和第三方能力用同一种写法：`name`、`Config`（Schema）、`inject`、`apply(ctx, config)`，或一个 `Service` 子类。
2. **能力是服务。** 能力以 `ctx.<name>` 的形式暴露（`ctx.router`、`ctx.html`、`ctx.runtime`、`ctx.vite`、`ctx.server`）。插件通过 `inject` 声明依赖，加载顺序由依赖决定，而不是由文件顺序或阶段决定。
3. **注册即副作用（effect）。** 每个注册方法（`ctx.html.head()`、`ctx.runtime.entry()`、`ctx.vite.plugin()`……）都属于调用方插件的 fiber，并返回 disposer；插件卸载时，它的贡献会自动撤回。
4. **响应式而非阶段式。** 没有 umi 的 stage 状态机。服务在注册集合变化时重新计算产物（生成文件、路由表、Vite 配置），所以插件可以在运行中被加载、卸载、重载。
5. **类型化事件。** 事件通过声明合并（declaration merging）声明，命名为 `namespace/action`，每个事件都写明分发模式。
6. **浏览器端也是 Cordis。** 浏览器运行时是一个 cordis `Context`（koishi-webui 模型）。Node 插件通过 `ctx.runtime.entry(file, config)` 贡献浏览器插件，类似 koishi 的 `ctx.console.addEntry()`。

## 启动

```
cormi dev | build | preview | setup
  └─ root Context
     ├─ @cordisjs/plugin-logger-console
     ├─ @cordisjs/plugin-timer
     ├─ ctx.cormi         Cormi：cwd、mode、paths（由 root 提供，任何地方都能访问）
     ├─ @cordisjs/plugin-hmr          （仅 dev：Node 插件源码热替换）
     └─ @cordisjs/plugin-loader
        └─ @cordisjs/plugin-include  →  cormi.yml
```

`cormi.yml` 就是插件树。修改一个条目的 `config` 只会重载该插件（`fiber.update`）；新增、删除、`disabled` 条目会挂载或卸载对应插件。

```yaml
- name: '@cormi/preset-react'
  config:
    title: Cormi
    ssr: true
- name: '@cormi/plugin-antd'
  config:
    theme: { token: { colorPrimary: '#6366f1' } }
- name: ./plugin.ts
```

模式：

| mode | 行为 |
|---|---|
| `dev` | HTTP 服务 + Vite 开发中间件 + 监听器；常驻进程 |
| `build` | 等待插件树稳定，刷新代码生成，执行 `ctx.vite.build()`，然后退出 |
| `preview` | HTTP 服务，基于构建产物提供静态资源、SSR、loader 和 API |
| `setup` | 只生成 `src/.cormi`（用于类型检查），然后退出 |

## Node 端服务

| 服务 | 提供方 | 注册方法（均为 effect） |
|---|---|---|
| `ctx.cormi` | `@cormi/core`（root） | — |
| `ctx.router` | `@cormi/core` | `route(route)`、`layout(file, test?)`、`patch(fn)` |
| `ctx.html` | `@cormi/core` | `head(tag)`、`body(tag)`、`transform(fn)` |
| `ctx.runtime` | `@cormi/core` | `entry(file, config?)`、`import(source)`、`file(path, content)`、`server(key, file)` |
| `ctx.vite` | `@cormi/vite` | `plugin(plugin)`、`config(config \| fn)` |
| `ctx.server` | `@cordisjs/plugin-server` | `get/post/all(path, mw)`、`use(mw)`、`ws(path)` |

`@cormi/preset-react` 是一个普通插件，负责组合 router、html、runtime、vite、React 集成，以及（dev/preview 下的）HTTP 服务和请求处理器。

事件：

| 事件 | 模式 | 时机 |
|---|---|---|
| `router/update(routes)` | emit | 路由表重新计算之后 |
| `runtime/generate()` | emit | `src/.cormi` 写入之后 |
| `build/before()` | parallel | Vite 构建开始之前 |
| `build/after(result)` | parallel | 客户端与服务端 bundle 写入之后 |

## 生成文件（`src/.cormi`）

| 文件 | 用途 |
|---|---|
| `routes.ts` | 路由清单 + 懒加载组件 + loader 封装 |
| `entry.tsx` | 浏览器启动入口：创建客户端 Context，挂载运行时插件，渲染或 hydrate |
| `server.tsx` | 服务端 bundle 入口：路由（含服务端 loader）、SSR 渲染、服务端模块（如 API 路由） |
| `tsconfig.json` | 路径别名，被项目的 tsconfig 继承 |

## 浏览器端

```ts
import { Context } from '@cormi/client'   // 应用代码里通过 'cormi/client' 引入

export default (ctx: Context, config: Config) => {
  ctx.app.wrap(({ children }) => <Provider value={config}>{children}</Provider>)
  ctx.on('router/change', (location) => { /* ... */ })
}
```

- `ctx.app`：根组件包装器（`wrap(Component)`），在 Context 上提供。
- `ctx.router`：React Router 7 的数据路由；`router/change` 事件。
- `src/app.tsx` 的默认导出会自动作为运行时插件注册。
- React 钩子：`useCordis()`（当前 ctx）、`useContext()`（派生一个绑定组件生命周期的 fiber）。
- 运行时插件模块更新时，热替换方式是销毁旧 fiber、再挂载新模块。

## 路由模块

```ts
export default function Page() {}             // 组件
export async function loader({ request, params }) {}        // 仅服务端，从客户端 bundle 中剥离
export async function clientLoader({ serverLoader, params }) {} // 浏览器端
export function ErrorBoundary() {}
export const handle = {}
```

`src/api/**` 下的文件是 API 路由（`src/api/users/[id].ts` → `/api/users/:id`），导出 `GET`、`POST` 等函数，或一个默认处理器，签名为 `(request: Request, ctx) => Response | any`。

## 插件包结构（参照 koishi）

```
plugins/plugin-foo/
  src/index.ts        Node：name、Config、inject、apply → ctx.runtime.entry(resolve('../client/index.tsx'), config)
  client/index.tsx    浏览器：export default (ctx, config) => { ... }
```

## umi 能力对照

| umi | Cormi |
|---|---|
| `api.addHTMLMetas/Links/Scripts` | `ctx.html.head(tag)` / `ctx.html.body(tag)` |
| `api.modifyHTML` | `ctx.html.transform(fn)` |
| `api.addRuntimePlugin` + 运行时 key | `ctx.runtime.entry(file, config)` + 浏览器端 `ctx.app.wrap()` / 事件 |
| `api.addEntryImports` | `ctx.runtime.import(source)` |
| `api.writeTmpFile` | `ctx.runtime.file(path, content)` |
| `api.modifyRoutes` / `addLayouts` | `ctx.router.patch(fn)` / `ctx.router.layout(file)` |
| `api.modifyViteConfig` | `ctx.vite.config(fn)` / `ctx.vite.plugin(p)` |
| `api.addMiddlewares` | `ctx.server.use(mw)` / `ctx.server.get(path, mw)` |
| `api.onBuildComplete` | `ctx.on('build/after', fn)` |
| `api.describe({ key, config })` | `export const name` + `export const Config` |
| `enableBy: config` | 在 `cormi.yml` 中列出（或 `disabled`）该插件 |
| `api.restartServer()` | 不需要：注册变化会被响应式地应用 |
