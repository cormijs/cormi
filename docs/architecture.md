# Cormi 架构

Cormi 是一个以 Cordis 4 为宿主的 React 全栈框架。它不是 umi 的克隆：umi 只作为「全栈框架该有哪些能力」的清单，API 形态完全遵循 cordis / koishi 的哲学。

## 原则

1. **一切皆插件。** 内置能力和第三方能力用同一种写法：`name`、`Config`（Schema）、`inject`、`apply(ctx, config)`，或一个 `Service` 子类。
2. **能力是服务。** 能力以 `ctx.<name>` 的形式暴露。插件通过 `inject` 声明依赖，加载顺序由依赖决定，而不是由文件顺序或阶段决定。
3. **注册即副作用（effect）。** 每个注册方法（`ctx.html.head()`、`ctx.app.entry()`、`ctx.vite.plugin()`……）都属于调用方插件的 fiber，并返回 disposer；插件卸载时，它的贡献会自动撤回。
4. **响应式而非阶段式。** 没有 umi 的 stage 状态机。服务在注册集合变化时重新计算产物（路由表、生成文件、Vite 配置），所以插件可以在运行中被加载、卸载、重载。
5. **类型化事件。** 事件通过声明合并（declaration merging）声明，命名为 `namespace/action`，每个事件都写明分发模式。
6. **浏览器端也是 Cordis。** 浏览器运行时是一个 cordis `Context`（koishi-webui 的模型）。Node 插件通过 `ctx.app.entry(module, config)` 贡献浏览器插件，类似 koishi 的 `ctx.console.addEntry()`。

## 启动

```
cormi dev | build | preview | setup
  └─ root Context
     ├─ @cordisjs/plugin-logger-console
     ├─ @cordisjs/plugin-timer
     ├─ ctx.cormi                    Cormi：cwd、mode、paths（在 root 上提供，任何插件无需 inject 即可访问）
     ├─ @cordisjs/plugin-hmr         （仅 dev：Node 插件源码热替换、cormi.yml 变更）
     └─ @cordisjs/plugin-loader
        └─ @cordisjs/plugin-include  →  cormi.yml（插件树）
```

`cormi.yml` 就是插件树。修改一个条目的 `config` 只会重载该插件（`fiber.update`）；新增、删除、`disabled` 条目会挂载或卸载对应插件。`cormi.yml` 中的 TypeScript 插件（如 `./plugin.ts`）通过 tsx 加载。

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

| mode | 行为 |
|---|---|
| `dev` | daemon 进程监管 worker（koishi 模型）；HTTP 服务 + Vite 开发中间件 + 文件监听；常驻 |
| `build` | 等待插件树加载完毕，生成文件，执行 `ctx.vite.build()`，然后退出 |
| `preview` | HTTP 服务，基于构建产物提供静态资源、SSR、loader 和 API |
| `setup` | 只生成 `src/.cormi`（用于类型检查），然后退出 |

`idle(ctx)` 等待插件树中没有正在加载或卸载的 fiber（包括 loader 正在导入的模块）。生成文件和创建 dev server 之前都会先等待它，因此一批同时加载的插件只触发一次生成、一次 Vite 启动。

## Node 端服务

| 服务 | 提供方 | 注册方法（均为 effect） |
|---|---|---|
| `ctx.cormi` | `@cormi/core`（root） | — |
| `ctx.router` | `@cormi/core` | `route(route)`、`layout(file, options?)`、`patch(fn)` |
| `ctx.html` | `@cormi/core` | `head(tag)`、`body(tag)`、`transform(fn)` |
| `ctx.app` | `@cormi/core` | `entry(module, config?)`、`import(source)`、`file(path, content)`、`server(key, file)` |
| `ctx.vite` | `@cormi/vite` | `plugin(plugin)`、`configure(config \| fn)` |
| `ctx.server` | `@cordisjs/plugin-server` | `get/post/all(path, mw)`、`use(mw)`、`ws(path)` |

`@cormi/preset-react` 是一个普通插件，组合 router、html、app、vite 服务，React 渲染器（`Renderer`），页面与 API 路由（`Pages`、`ApiRoutes`），以及 dev/preview 下的 HTTP 服务（`@cordisjs/plugin-server`）与静态资源（`Static`）。preset 的配置是扁平的，各部分读取各自的字段。

事件：

| 事件 | 模式 | 时机 |
|---|---|---|
| `router/update(routes)` | emit | 路由表重新计算且发生变化之后 |
| `app/generate()` | emit | `src/.cormi` 写入之后 |
| `build/before()` | parallel | Vite 构建开始之前 |
| `build/after(result)` | parallel | 客户端与服务端 bundle 写入之后 |

## 生成文件（`src/.cormi`）

| 文件 | 用途 |
|---|---|
| `routes.ts` | 路由清单 + 懒加载的路由模块 |
| `entry.tsx` | 浏览器入口：创建客户端 Context，挂载运行时插件，渲染或 hydrate；运行时插件模块更新时只替换对应 fiber |
| `server.tsx` | 服务端入口（仅当开启 SSR、存在服务端 loader 或注册了服务端模块时生成） |
| `tsconfig.json`、`typings.d.ts` | 路径别名与资源类型，被项目的 tsconfig 继承 |
| `plugin-*/…` | 插件通过 `ctx.app.file()` 生成的模块 |

## 浏览器端

```ts
import type { Context } from 'cormi/client'

export default (ctx: Context, config: Config) => {
  ctx.wrap(({ children }) => <Provider value={config}>{children}</Provider>)
  ctx.on('router/change', (location) => { /* ... */ })
}
```

- 核心服务在 root 上提供，任何运行时插件无需 inject：`ctx.$app`（根组件包装器，常用方法以 mixin 暴露为 `ctx.wrap(component, order?)`）、`ctx.$router`（React Router 7 数据路由）。名字带 `$`，与同一应用的 Node 端服务（`ctx.app`、`ctx.router`）在类型上互不冲突——koishi 的客户端也是这样做的。
- 事件：`router/change(location, action)`、`app/mount()`。
- `src/app.(ts|tsx)` 的默认导出会自动作为运行时插件挂载。
- React 钩子：`useCordis()`（应用的 ctx）、`useContext()`（派生一个随组件卸载而销毁的 fiber，同 koishi）。
- `useServerInsertedHTML()` 让 CSS-in-JS 库在 SSR 时向 `<head>` 插入样式。

## 路由模块

```ts
export default function Page() {}                                   // 组件
export async function loader({ request, params }) {}                 // 仅服务端，从客户端 bundle 中剥离
export async function clientLoader({ serverLoader, params }) {}      // 浏览器端
export function ErrorBoundary() {}
export const handle = {}
```

客户端导航时，服务端 `loader` 的数据从 `<base>/__cormi/loader` 端点获取。

`src/api/**` 下的文件是 API 路由（`src/api/users/[id].ts` → `/api/users/:id`），按方法导出处理器（`GET`、`POST`……）或一个 `default` 处理器，签名为 `(request: Request, { params }) => Response | any`，非 `Response` 的返回值以 JSON 发送。

## 插件包结构（参照 koishi）

```
plugins/plugin-foo/
  src/index.ts        Node：name、Config、inject、apply
  client/index.tsx    浏览器：export default (ctx, config) => { ... }
```

Node 部分以**包名**注册浏览器入口：`ctx.app.entry('@scope/plugin-foo/client', config)`。生成的入口与用户代码使用同一个说明符，Vite 因此只会产生一份模块实例；Renderer 会把这些包加入 `ssr.noExternal`，让 SSR 能处理其中的 TypeScript 源码。

官方插件：

| 插件 | 内容 |
|---|---|
| `@cormi/plugin-mock` | dev 下由 `mock/**` 提供 mock 路由（`defineMock({ 'GET /api/me': ... })`），优先于真实 API |
| `@cormi/plugin-tailwindcss` | Tailwind CSS v4：注册 Vite 插件并在应用启动前导入样式表 |
| `@cormi/plugin-antd` | Ant Design：`ConfigProvider` 主题与语言、SSR 样式抽取（应用需依赖 `@ant-design/cssinjs`） |
| `@cormi/plugin-model` | `src/models/*` 中的 hook 作为全局模型，`useModel(namespace, selector?)`，类型自动生成 |
| `@cormi/plugin-initial-state` | 运行时插件监听 `initialState/load`（serial）提供初始状态，组件用 `useInitialState()` 读取 |

## umi 能力对照

| umi | Cormi |
|---|---|
| `api.addHTMLMetas/Links/Scripts` | `ctx.html.head(tag)` / `ctx.html.body(tag)` |
| `api.modifyHTML` | `ctx.html.transform(fn)` |
| `api.addRuntimePlugin` + 运行时 key | `ctx.app.entry(module, config)` + 浏览器端 `ctx.wrap()` / 事件 |
| `api.addEntryImports` | `ctx.app.import(source)` |
| `api.writeTmpFile` | `ctx.app.file(path, content)` |
| `api.modifyRoutes` / `addLayouts` | `ctx.router.patch(fn)` / `ctx.router.layout(file)` |
| `api.modifyViteConfig` | `ctx.vite.configure(fn)` / `ctx.vite.plugin(p)` |
| `api.addMiddlewares` | `ctx.server.use(mw)` / `ctx.server.get(path, mw)` |
| `api.onBuildComplete` | `ctx.on('build/after', fn)` |
| `api.describe({ key, config })` | `export const name` + `export const Config` |
| `enableBy: config` | 在 `cormi.yml` 中列出（或 `disabled`）该插件 |
| `api.restartServer()` | 不需要：注册变化会被响应式地应用 |

## 已知的上游问题

`@cordisjs/plugin-server` 的最新版本（1.7.0）仍在调用 cordis rc.12 中已改名的 `Service.resolveConfig`（现为 `resolveIntercept`）。`@cormi/core` 的 `compat.ts` 为它提供了别名，上游跟进后即可删除。

## 验证

```sh
pnpm build             # tsc -b
pnpm typecheck:client  # 插件的浏览器端代码
pnpm test              # 单元测试
pnpm e2e               # 构建并 preview 每个示例，在浏览器中断言
pnpm e2e:dev           # 同上，使用 dev server
```
