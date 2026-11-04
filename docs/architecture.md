# Cormi 架构

Cormi 是一个以 Cordis 4 为宿主的全栈框架。它不是 umi 的克隆：umi 只作为「全栈框架该有哪些能力」的清单，API 形态完全遵循 cordis / koishi 的哲学。打包器与 UI 框架也是插件：打包器有 Vite（`@cormijs/vite`）与 Rsbuild（`@cormijs/rsbuild`），UI 框架有 React（`@cormijs/react`）与 Vue（`@cormijs/vue`），设计见 [可选的打包器与 UI 框架](./reference/pluggable.md)。

## 原则

1. **一切皆插件。** 内置能力和第三方能力用同一种写法：`name`、`Config`（Schema）、`inject`、`apply(ctx, config)`，或一个 `Service` 子类。
2. **能力是服务。** 能力以 `ctx.<name>` 的形式暴露。插件通过 `inject` 声明依赖，加载顺序由依赖决定，而不是由文件顺序或阶段决定。
3. **注册即副作用（effect）。** 每个注册方法（`ctx.html.head()`、`ctx.app.entry()`、`ctx.bundler.plugin()`……）都属于调用方插件的 fiber，并返回 disposer；插件卸载时，它的贡献会自动撤回。
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
- name: '@cormijs/preset'      # 应用：路由、HTML、页面、API、服务器
  config:
    title: Cormi
    ssr: true
- name: '@cormijs/vite'        # 打包器：ctx.bundler
- name: '@cormijs/react'       # UI 框架：ctx.renderer
- name: '@cormijs/plugin-antd'
  config:
    theme: { token: { colorPrimary: '#6366f1' } }
- name: ./plugin.ts
```

| mode | 行为 |
|---|---|
| `dev` | daemon 进程监管 worker（koishi 模型）；HTTP 服务 + Vite 开发中间件 + 文件监听；常驻 |
| `build` | 等待插件树加载完毕，生成文件，执行 `ctx.bundler.build()`，然后退出 |
| `preview` | HTTP 服务，基于构建产物提供静态资源、SSR、loader 和 API |
| `setup` | 只生成 `src/.cormi`（用于类型检查），然后退出 |

`idle(ctx)` 等待插件树中没有正在加载或卸载的 fiber（包括 loader 正在导入的模块）。生成文件和创建 dev server 之前都会先等待它，因此一批同时加载的插件只触发一次生成、一次 Vite 启动。生成文件之前还会等待路由表的重新计算（UI 框架注册的扩展名会改变路由表）；等待期间到达的 Vite 注册已包含在新建 dev server 的配置中，不会再触发重启。

## Node 端服务

| 服务 | 提供方 | 注册方法（均为 effect） |
|---|---|---|
| `ctx.cormi` | `@cormijs/core`（root） | — |
| `ctx.cli` | `@cormijs/core`（root） | `command(name, command)`、`generator(type, generator)` |
| `ctx.router` | `@cormijs/core` | `route(route)`、`layout(file, options?)`、`patch(fn)`、`extension(...exts)` |
| `ctx.html` | `@cormijs/core` | `head(tag)`、`body(tag)`、`transform(fn)` |
| `ctx.app` | `@cormijs/core` | `entry(module, config?)`、`import(source)`、`file(path, content)`、`server(key, file)` |
| `ctx.bundler` | 打包器（`@cormijs/vite`、`@cormijs/rsbuild`） | `plugin({ [打包器]: 插件 })`、`input(name, file)`；`assets(file)`、`loadServerEntry()`、`hotAccept()`、`build()` 等由页面服务器、渲染器与命令使用 |
| `ctx.renderer` | UI 框架（`@cormijs/react`、`@cormijs/vue`） | —（标记当前的 UI 框架，生成 `entry.*`、`server.*` 等文件；`routeExports()` 读取非脚本路由模块的导出） |
| `ctx.vite` | `@cormijs/vite` | `plugin(plugin)`、`configure(config \| fn)`、`input(name, file)` |
| `ctx.rsbuild` | `@cormijs/rsbuild` | `plugin(plugin)`、`configure(config \| fn)`、`input(name, file)` |
| `ctx.react`、`ctx.vue` | `@cormijs/react`、`@cormijs/vue` | — |
| `ctx.server` | `@cordisjs/plugin-server` | `get/post/all(path, mw)`、`use(mw)`、`ws(path)` |

`ctx.bundler` 与 `ctx.renderer` 是两个接缝（契约在 `@cormijs/core` 的 `bundler.ts`）：与打包器、UI 框架无关的插件只用它们；只适用于某个实现的插件 `inject: ['vite']` 或 `inject: ['react']`，换掉实现时自动转入 pending。打包器插件不能通用，`ctx.bundler.plugin({ vite, rsbuild })` 为每个打包器各给一个，键的类型由打包器包以声明合并加入 `Bundler.Plugins`；没有当前打包器的一项时抛出错误。React 渲染器、文件约定、tailwindcss、unocss、styled-components 都这样注册打包器插件，修改打包配置也写成插件（Vite 插件的 `config` 钩子）。

`@cormijs/preset` 是一个普通插件，组合 router、html、app 服务，文件约定（`Conventions`），页面与 API 路由（`Pages`、`ApiRoutes`），以及 dev/preview 下的 HTTP 服务（`@cordisjs/plugin-server`）、代理、静态资源（`Static`）与 dev 下的控制台。preset 的配置是扁平的，各部分读取各自的字段。`@cormijs/preset-react` 是 `@cormijs/preset` + `@cormijs/vite` + `@cormijs/react` 的简写，三者的配置写在一起。

事件：

| 事件 | 模式 | 时机 |
|---|---|---|
| `router/update(routes)` | emit | 路由表重新计算且发生变化之后 |
| `app/generate()` | emit | `src/.cormi` 写入之后 |
| `build/before()` | parallel | 打包器构建开始之前 |
| `build/after(result)` | parallel | 客户端与服务端 bundle 写入之后 |

preset 的配置还包括 `proxy`（基于 fetch 的转发，dev 与 preview 下生效，排在 mock 之后）、`crossorigin`；`targets`（umi 的浏览器版本写法或 esbuild 目标）、`alias`、`define`、`publicPath`、`outDir` 是 `@cormijs/vite` 的配置。

## 文件约定

由 preset 中的 `Conventions` 插件处理。每条约定都是一份贡献，文件存在时生效，删除文件即撤回：

| 文件 | 作用 |
|---|---|
| `src/app.(ts\|tsx)` | 应用自己的运行时插件 |
| `src/global.(css\|less\|scss…)`、`src/global.(ts\|tsx)` | 在应用启动前导入（服务端渲染时也会执行） |
| `src/overrides.(css\|less\|scss…)` | 导入时给选择器加 `body` 前缀，用于覆盖其他样式 |
| `src/loading.(tsx\|jsx)` | 纯客户端渲染时，首屏路由加载期间显示（React 渲染器处理） |
| `public/favicon.(ico\|png\|svg)` | 未配置 `favicons` 时作为页面图标 |

## 命令

`dev`、`build`、`preview`、`setup` 由 CLI 内置；其他命令由插件通过 `ctx.cli.command()` 注册，执行时以 `setup` 模式加载插件树后运行。core 内置两个：`generate`（别名 `g`），分发给插件注册的生成器（preset 提供 page、component、api，plugin-mock 提供 mock）；`config`，列出插件树，或打印匹配插件解析后的配置。`cormi help` 会列出插件注册的命令。

## 生成文件（`src/.cormi`）

| 文件 | 用途 |
|---|---|
| `routes.ts` | 路由清单 + 懒加载的路由模块 |
| `entry.tsx` | 浏览器入口：创建客户端 Context，挂载运行时插件，渲染或 hydrate；运行时插件模块更新时只替换对应 fiber |
| `server.tsx` | 服务端入口（仅当开启 SSR、存在服务端 loader 或注册了服务端模块时生成），导出 `handler.render/loader`、`modules`、`base` |

入口文件由 UI 框架生成，扩展名也由它决定（React 是 `entry.tsx`），`ctx.app.clientEntry` / `serverEntry` 按注册的文件找到它们。
| `tsconfig.json`、`typings.d.ts` | 路径别名与资源类型，被项目的 tsconfig 继承 |
| `plugin-*/…` | 插件通过 `ctx.app.file()` 生成的模块 |

## 浏览器端

```ts
import type { Context } from '@cormijs/react/client'

export default (ctx: Context, config: Config) => {
  ctx.wrap(({ children }) => <Provider value={config}>{children}</Provider>)
  ctx.on('router/change', (location) => { /* ... */ })
}
```

浏览器端分两层：`@cormijs/runtime`（即 `@cormijs/cormi/client`）是与 UI 框架无关的部分——`Context`、`$app`（props 与生命周期事件）、抽象的 `$router`（路由清单、模块加载、`add()`、`href()`、服务端 loader 协议）；`@cormijs/react/client` 在其上实现 React Router 数据路由、`ctx.wrap()`、钩子与 SSR。不涉及组件的浏览器插件只依赖前者。

- 入口导出 `bootstrap`、`mount(options)`、`update(options)`、`unmount` 生命周期。入口会等运行时插件应用完毕后再挂载；某个插件在 `app/bootstrap`（bail）中返回 `true`，就表示由它接管挂载，例如 qiankun 子应用由加载脚本调用 `mount({ container, basename, origin, props })`。宿主传入的 props 用 `useHostProps()` 读取。
- 核心服务在 root 上提供，任何运行时插件无需 inject：`ctx.$app`（React 下还是根组件包装器，常用方法以 mixin 暴露为 `ctx.wrap(component, order?)`）、`ctx.$router`（React 下是 React Router 7 数据路由；`ctx.$router.add(routes, modules)` 在运行时添加路由，已渲染时直接修补路由器，插件销毁时移除）。名字带 `$`，与同一应用的 Node 端服务（`ctx.app`、`ctx.router`）在类型上互不冲突——koishi 的客户端也是这样做的。
- 事件：`router/change(location, action)`（emit）、`app/bootstrap()`（bail）、`app/mount()`（emit）、`app/props(props)`（emit）。
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

`server/api/**` 下的文件是接口（`server/api/users/[id].ts` → `/api/users/:id`），由 Node 直接运行，每个模块是一个注入 `inject` 中服务的插件；按方法导出处理器（`GET`、`POST`……）或一个 `default` 处理器，签名为 `(request: Request, { params, ctx, state }) => Response | any`，非 `Response` 的返回值以 JSON 发送。见 [服务端代码与接口](/guide/server)。

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
| `@cormijs/plugin-mock` | dev 下由 `mock/**` 提供 mock 路由（`defineMock({ 'GET /api/me': ... })`），优先于真实 API |
| `@cormijs/plugin-tailwindcss` | Tailwind CSS v4：注册打包器插件（Vite 下是 `@tailwindcss/vite`）并在应用启动前导入样式表 |
| `@cormijs/plugin-antd` | Ant Design：`ConfigProvider` 主题与语言、SSR 样式抽取（应用需依赖 `@ant-design/cssinjs`） |
| `@cormijs/plugin-model` | `src/models/*` 中的 hook 作为全局模型，`useModel(namespace, selector?)`，类型自动生成 |
| `@cormijs/plugin-initial-state` | 运行时插件监听 `initialState/load`（serial）提供初始状态，组件用 `useInitialState()` 读取 |
| `@cormijs/plugin-request` | 基于 fetch 的 `request()` 与基于 ahooks 的 `useRequest()`（可用 `dataField` 解包）；拦截用 `request/fetch`（waterfall），全局错误处理用 `request/error`（bail，返回 `true` 表示已处理） |
| `@cormijs/plugin-qiankun/master` | qiankun 主应用：`<MicroApp name>` 组件，以及挂载子应用的路由；把主应用 props 和子应用的 basename 传给子应用 |
| `@cormijs/plugin-qiankun/slave` | 由 Vite 构建的 qiankun 子应用：文档中的模块脚本会被替换为 qiankun 能执行的加载脚本，由它在主应用容器里（或独立运行时在页面里）挂载应用；同时提供 CORS、资源 URL 处理和 `useMasterProps()` |
| `@cormijs/plugin-export-static` | 构建后用服务端 bundle 预渲染静态路由（及 `extraRoutePaths`）为 HTML，供静态托管，页面会 hydrate |
| `@cormijs/plugin-lint` | `cormi lint [files] [--fix]`：使用应用自己的 `eslint.config.*`，没有时使用 TypeScript 与 React hooks 的默认配置 |
| `@cormijs/plugin-layout` | 基于 antd 的布局：由路由生成菜单与面包屑；配置式路由提供 `name`、`icon`、`hideInMenu`，只打包用到的图标 |
| `@cormijs/plugin-react-query` | 每个渲染的应用一个 `QueryClient`（创建时触发 `reactQuery/client`），dev 下 hydrate 后显示 devtools |
| `@cormijs/plugin-dva` | dva-core + dva-loading（可选 immer），模型来自 `src/models`（与 plugin-model 共用目录，各取所需）；`dva/create` 事件 |
| `@cormijs/plugin-valtio` | valtio 再导出，`defineStore()` 在 dev 下接入 Redux DevTools |
| `@cormijs/plugin-styled-components` | `ThemeProvider` 与 SSR 样式抽取 |
| `@cormijs/plugin-unocss` | UnoCSS：没有 `uno.config.*` 时使用默认预设 |
| `@cormijs/plugin-analytics` | Google Analytics 4 与百度统计；客户端导航通过 `router/change` 上报 |
| `@cormijs/plugin-legacy` | `@vitejs/plugin-legacy` 构建旧浏览器 bundle，并按 manifest 把 nomodule 等标签注入应用的文档 |
| `@cormijs/plugin-mpa` | 多页应用：`src/pages/<name>/index.tsx` 各自成为 `<name>.html`，不带路由，运行时插件同样生效 |
| `@cormijs/plugin-mf` | 模块联邦（`@module-federation/vite`），host 在入口中初始化；服务端渲染时 remote 模块渲染为空 |
| `@cormijs/plugin-federation/host`、`/package` | 联邦应用：各子包单独构建、单独部署，底座通过 URL 汇集成一个应用，基础依赖为全局单例（见下文） |

qiankun 子应用的已知限制：ES 模块在真实的 `window` 上运行，不在 qiankun 的 JS 沙箱里；Vite 注入到 `document.head` 的样式不受样式隔离约束。这一点与 vite-plugin-qiankun 相同。

## 联邦应用（`@cormijs/plugin-federation`）

适合多个团队用同一技术栈共同维护一个大应用：每个子包（package）是一个独立的 Cormi 应用，可以单独开发、单独构建、单独部署；底座（host）在启动时按 URL 收集子包，把它们的页面接入自己的路由和布局。与 qiankun 不同，子包不是被隔离的另一个应用，而是底座里的 cordis 插件：react、react-dom、react-router、cordis、`@cormijs/cormi/client`、`@cormijs/react/client` 以单例共享（可用 `shared` 追加，如 antd 或公共组件库），子包的页面在底座的路由器里渲染，子包之间可以通过 cordis 服务协作。这一设计来自 HZERO（`@hzerojs/plugin-micro`）的“模块联邦微前端”。

```yaml
# 底座 cormi.yml
- name: '@cormijs/plugin-federation/host'
  config:
    packages:                     # 写入构建产物 packages.json，部署时可直接修改
      - https://cdn.example.com/users/
      - url: https://cdn.example.com/orders/
        eager: true               # 覆盖子包清单中的 eager
    shared: [antd]                # 默认单例之外的共享依赖
    parent: '@@/global-layout'    # 子包路由挂在哪个路由下，默认第一个顶层布局

# 子包 cormi.yml
- name: '@cormijs/plugin-federation/package'
  config:
    name: orders                  # 容器名，默认取自 package.json
    eager: false                  # true：随底座启动加载（例如提供服务的子包）
    entries: ['@cormijs/plugin-model/client']   # 随子包进入底座的插件运行时
    exposes: { ./CartBadge: ./src/components/CartBadge.tsx }
```

| 环节 | 做法 |
|---|---|
| 子包构建 | 除了自身可独立运行的产物，额外输出 `remoteEntry.js`（暴露 `./plugin`）与清单 `federation.json`：名称、版本、入口、`eager`，以及**路由表（JSON）**。资源以相对路径加载，产物可以部署在任意 URL |
| 底座启动 | 浏览器端读取 `packages.json`，并行获取各子包清单（失败的跳过），用 `registerRemotes` 注册远程容器，把所有子包的路由立即挂入 `$router`——菜单因此完整；`eager` 子包随即加载。全部完成后应用才挂载 |
| 按需加载 | 子包路由的模块是惰性的：首次访问时加载 `<name>/plugin`，在底座里以子 fiber 应用子包的运行时插件（`src/app.tsx`、全局样式、`entries`），再加载页面模块。HZERO 的 `registerRegex` 因此不再需要 |
| 共享页面与组件 | 子包的页面即底座的路由；`<RemoteComponent id="orders/CartBadge" />` 或 `ctx.$federation.import(id)` 加载其他子包暴露的模块（会先加载其所属子包） |
| 子包间协作 | 子包的运行时插件可以提供 cordis 服务（如 `ctx.users`），其他子包与底座用 `ctx.get('users')` 或 `inject` 使用；提供服务的子包应设为 `eager` |
| 开发 | 子包 `cormi dev` 时同时作为独立应用运行（使用自己的布局）并提供 `/federation.json` 与 `remoteEntry.js`；dev 模式下底座读取 `localStorage['cormi:packages']`（URL 数组），可把某个子包指向本地开发服务器 |

清单中的路由：子包的顶层布局（独立运行时的外框）与 404 页不进入底座，顶层路由使用绝对路径，id 加上 `<name>/` 前缀。约束：

- 共享依赖需是应用的直接依赖（pnpm 下 `react-router`、`cordis` 也要写进 package.json），否则插件会警告：模块联邦按应用能解析的包来共享和预构建。
- 子包部署的服务器需允许底座跨域读取（CORS）；`cormi dev` / `cormi preview` 已经允许。
- 子包页面在浏览器中运行，数据用 `clientLoader` 获取；导出服务端 `loader` 的路由会在构建时警告。底座开启 SSR 时，子包路由由客户端渲染，替换服务端的 404。
- 懒加载的子包通过 `ctx.wrap()` 添加包装器时会让根组件重新挂载一次；需要全局 Provider 的子包宜设为 `eager`。

`@cormijs/react/client` 为此调整了两处：`$router.add()`；渲染时才读取 react-router 的工厂函数——子包独立运行时，共享模块在其模块求值之后才就绪。

## 工作区与控制台

**工作区**（`ctx.workspace`，`@cormijs/core`，在加载插件树之前由 `start()` 提供）：应用 `plugins/*` 下的插件包按包名加载，直接运行源码，模型来自 koishi 模板项目的工作区。

- Node：通过 `module.register()` 注册解析钩子，工作区包名解析到 `exports` 的 `source` 条件（没有时为 `src/index.ts`），再交给 tsx。包增删时经 MessagePort 更新钩子。
- Vite：`cormi:workspace` 插件在浏览器与 SSR 中做同样的解析。
- 类型：React 渲染器在生成的 tsconfig 中写入工作区包的 `paths`。
- `cormi g plugin <name>` 生成插件包（`--console`、`--no-client`）；dev 下监听 `plugins/*/package.json` 的增删。

**控制台**（`@cormijs/console`，preset 在 dev 模式下挂载，`console: false` 关闭）：挂在 `/__cormi/`，自带 Vite 与 React，与应用的打包器和 UI 框架无关：一个以中间件模式运行的 Vite 开发服务器，根目录是 `@cormijs/console` 包（React 从这里解析，插件的控制台页面也去重到它），HMR 的 WebSocket 以路径与应用的区分。控制台本身是一个浏览器端的 cordis Context：页面是浏览器插件，经 `ctx.console.entry()` 注册（与 `ctx.app.entry()` 同构）；入口是控制台 Vite 的虚拟模块，位于应用根目录下，所以插件的控制台页面按包名从应用解析，入口变化时浏览器重新加载控制台。概览显示 `ctx.bundler`、`ctx.renderer` 的名称与版本（契约中的 `name`、`version`）。数据经 WebSocket：Node 端 `ctx.console.data(name, get)` 推送、`method(name, handler)` 响应调用、`broadcast()` 发事件；浏览器端 `ctx.$console.page()`、`useData()`、`call()`。

内置页面读取 loader 的 include 子树（顺序与 `cormi.yml` 一致），修改经子树的 `update/create/remove` 写回文件；注册列表来自 `fiber.getEffects()`（含子 fiber），状态变化监听 `internal/status`、`internal/plugin`；服务来自 `ctx.reflect.store`；日志经 `ctx.logger.exporter()`。控制台文档只响应接受 `text/html` 的请求，`/__cormi/loader` 等端点不受影响。

## 与 umi 的覆盖情况

已覆盖：约定式与配置式路由、全局布局、404、`clientLoader` 与服务端 `loader`、SSR、API 路由、mock、`proxy`；HTML 配置（title、metas、links、scripts、styles、favicons、crossorigin）；`base`、`publicPath`、`history`、`alias`、`define`、`targets`；`global`、`overrides`、`loading`、`favicon` 约定；路由预加载（`<Link prefetch>`）；exportStatic、MPA、legacy；dev、build、preview、setup、generate、config、lint 命令；以及 antd、tailwindcss、unocss、styled-components、model、initial-state、dva、valtio、react-query、request、layout、analytics、qiankun、mf 插件；此外还有 umi 没有内置的联邦应用（federation）。

尚未覆盖：access、locale 插件（按计划暂缓）。mfsu 这类与某个打包器深度绑定的功能有意不做；第二个打包器（Rsbuild）与 UI 框架（Vue）的计划见 [可选的打包器与 UI 框架](./reference/pluggable.md)。

## umi 能力对照

| umi | Cormi |
|---|---|
| `api.addHTMLMetas/Links/Scripts` | `ctx.html.head(tag)` / `ctx.html.body(tag)` |
| `api.modifyHTML` | `ctx.html.transform(fn)` |
| `api.addRuntimePlugin` + 运行时 key | `ctx.app.entry(module, config)` + 浏览器端 `ctx.wrap()` / 事件 |
| `api.addEntryImports` | `ctx.app.import(source)` |
| `api.writeTmpFile` | `ctx.app.file(path, content)` |
| `api.modifyRoutes` / `addLayouts` | `ctx.router.patch(fn)` / `ctx.router.layout(file)` |
| `api.modifyViteConfig` | `ctx.vite.configure(fn)` / `ctx.vite.plugin(p)`（`inject: ['vite']`） |
| `api.addMiddlewares` | `ctx.server.use(mw)` / `ctx.server.get(path, mw)` |
| `api.onBuildComplete` | `ctx.on('build/after', fn)` |
| `api.describe({ key, config })` | `export const name` + `export const Config` |
| `enableBy: config` | 在 `cormi.yml` 中列出（或 `disabled`）该插件 |
| `api.restartServer()` | 不需要：注册变化会被响应式地应用 |

## 已知的上游问题

`@cordisjs/plugin-server` 的最新版本（1.7.0）仍在调用 cordis rc.12 中已改名的 `Service.resolveConfig`（现为 `resolveIntercept`）。`@cormijs/core` 的 `compat.ts` 为它提供了别名，上游跟进后即可删除。

## 验证

```sh
pnpm build             # tsc -b
pnpm typecheck:client  # 插件的浏览器端代码
pnpm test              # 单元测试
pnpm check:plugins     # 官方插件的兼容性声明与代码一致（cormi plugin check）
pnpm e2e               # 构建并 preview 每个示例，在浏览器中断言
pnpm e2e:dev           # 同上，使用 dev server
pnpm e2e --bundler rsbuild      # 支持 Rsbuild 的示例改用它运行
pnpm e2e:dev --bundler rsbuild
```
