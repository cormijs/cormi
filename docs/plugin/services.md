# Node 端服务

| 服务 | 提供方 | 注册方法 |
|---|---|---|
| `ctx.cormi` | `@cormijs/cormi`（根上提供，无需 inject） | — |
| `ctx.cli` | `@cormijs/cormi`（根上提供，无需 inject） | `command()`、`generator()` |
| `ctx.router` | `@cormijs/preset` | `route()`、`layout()`、`patch()`、`extension()` |
| `ctx.html` | `@cormijs/preset` | `head()`、`body()`、`transform()` |
| `ctx.app` | `@cormijs/preset` | `entry()`、`import()`、`file()`、`server()` |
| `ctx.bundler` | 打包器：`@cormijs/vite` 或 `@cormijs/rsbuild` | `plugin()`、`input()`；构建、开发文档与服务端入口 |
| `ctx.renderer` | UI 框架：`@cormijs/react` 或 `@cormijs/vue` | — |
| `ctx.vite` | `@cormijs/vite` | `plugin()`、`configure()`、`input()` |
| `ctx.rsbuild` | `@cormijs/rsbuild` | `plugin()`、`configure()`、`input()` |
| `ctx.react` | `@cormijs/react` | — |
| `ctx.vue` | `@cormijs/vue` | — |
| `ctx.server` | `@cordisjs/plugin-server`（dev 与 start） | `get()`、`post()`、`all()`、`use()`、`ws()` |
| `ctx.workspace` | `@cormijs/cormi`（根上提供） | `create()` |
| `ctx.console` | `@cormijs/preset`（dev） | `entry()`、`data()`、`method()`，见 [扩展控制台](/plugin/console) |

只用 `ctx.bundler`、`ctx.renderer` 等通用服务的插件，适用于任何打包器与 UI 框架；需要某个实现的特有能力时，注入它的具名服务——`inject: ['vite']`、`inject: ['react']`。在不支持的组合中，这样的插件会转入 pending，控制台会显示它在等待的服务。

| 插件只用到 | 写法 | 例子 |
|---|---|---|
| 通用服务 | `inject: ['app', 'html', 'router', 'bundler']`…… | mock、analytics、export-static、lint |
| 打包器插件 | `ctx.bundler.plugin({ vite: …, rsbuild: … })`，为支持的每个打包器各给一个 | tailwindcss、mf |
| React | 再 `inject: ['react']`，浏览器端从 `@cormijs/react/client` 导入 | antd、model、request、layout |
| Vite 特有的能力 | `inject: ['vite']`，使用 `ctx.vite` | legacy、qiankun 子应用 |

所有注册方法都是 effect：注册属于调用方插件，插件卸载时自动撤回，并返回一个可以提前撤回的函数。

## ctx.cormi

应用的环境。

| 成员 | 说明 |
|---|---|
| `cwd` | 应用根目录 |
| `mode` | `dev`、`build`、`start`（生产环境，`cormi start`）或 `setup` |
| `serving` | 应用是否在提供服务：`dev` 或 `start` |
| `build` | `start` 模式下，`cormi build` 编译的 Node 代码（`dist/node/manifest.json`） |
| `env` | dev 下为 `development`，否则为 `production` |
| `paths` | `{ cwd, src, server, tmp, public }`，`tmp` 即 `src/.cormi` |
| `resolve(...paths)` | 相对于应用根目录解析路径 |

```ts
if (ctx.cormi.mode === 'dev') {
  // 只在开发时做的事
}
```

服务端的插件（连接数据库、缓存、消息队列……）只在 `serving` 时连接外部系统，这样 `cormi build` 与生成器不依赖它们。提供抽象服务的插件可以只在 `serving` 时提供服务，注入它的驱动就会一直等待，`@cormijs/database` 正是这样做的：

```ts
export function apply(ctx: Context) {
  if (!ctx.cormi.serving) return
  ctx.plugin(MyService)
}
```

## ctx.router

路由表：先由约定式路由或配置式路由生成，再应用插件的注册。表的形式是扁平的 `{ [id]: Route }`，嵌套关系由 `parentId` 表达。

```ts
// 添加一个路由，id 相同时替换
ctx.router.route({ path: '/about', file: ctx.cormi.resolve('src/about.tsx'), meta: { name: '关于' } })

// 用布局包裹路由；test 决定包裹哪些
ctx.router.layout(join(ctx.app.dir, 'plugin-foo/Layout.tsx'), {
  id: '@@/plugin-foo',
  test: route => route.layout !== false,
})

// 在路由表生成之后修改它
ctx.router.patch((routes) => {
  for (const route of Object.values(routes)) route.meta = { ...route.meta, auth: true }
})
```

| 成员 | 说明 |
|---|---|
| `routes` | 当前的路由表 |
| `pagesDir` | 约定式路由的目录 |
| `route(route)` | 添加路由（`path` 必填），`id` 默认为文件路径或 `path` |
| `layout(file, options?)` | 用布局包裹路由，后注册的布局在外层 |
| `patch(fn)` | 按注册顺序修改生成后的路由表 |
| `resolveFile(file)` | 按页面目录解析路由模块，支持 `@/` |
| `extension(...exts)` | 让这些扩展名的文件成为路由模块，UI 框架用它注册 `.tsx`、`.vue` |

路由表变化后触发 `router/update(routes)`。

## ctx.html

应用的 HTML 文档。preset 的 `title`、`metas`、`links` 等配置是它的配置。

```ts
ctx.html.head({ tag: 'link', attrs: { rel: 'preconnect', href: 'https://cdn.example.com' } })
ctx.html.body({ tag: 'script', content: 'window.__BOOT__ = Date.now()' })
ctx.html.transform(html => html.replace('<html', '<html data-theme="dark"'))
```

| 成员 | 说明 |
|---|---|
| `head(tag)` | 在 `<head>` 末尾加一个标签 |
| `body(tag)` | 在 `<body>` 末尾、应用脚本之后加一个标签 |
| `transform(fn)` | 改写最终的文档；按注册顺序执行，可以是异步的 |
| `render(options)` | 渲染文档，dev server、构建和 SSR 都用它 |

标签的形式是 `{ tag, attrs?, content? }`，`content` 原样插入。`renderTag()` 与 `escapeHtml()` 可以从 `@cormijs/cormi` 导入。

## ctx.app

应用打包时的样子：浏览器插件、全局导入、生成文件、服务端模块。

```ts
// 浏览器插件：用包名注册，config 序列化后传给它
ctx.app.entry('@scope/plugin-foo/client', { color: 'pink' })

// 在应用启动前导入（样式、polyfill）
ctx.app.import('@scope/plugin-foo/style.css')

// 生成 src/.cormi/plugin-foo/icons.ts；函数在每次生成时调用，返回 undefined 时不写入
ctx.app.file('plugin-foo/icons.ts', () => `export default ${JSON.stringify(icons)}\n`)

// 把模块打包进服务端入口，导出为 modules['foo']
ctx.app.server('foo', ctx.cormi.resolve('src/server/foo.ts'))
```

| 成员 | 说明 |
|---|---|
| `entry(module, config?)` | 挂载一个浏览器插件，按注册顺序 |
| `import(source)` | 在应用启动前导入的模块 |
| `file(path, content)` | 生成 `src/.cormi/<path>`；路径以插件名开头，避免冲突 |
| `server(key, file)` | 打包进服务端入口的模块 |
| `dir` | 生成目录 `src/.cormi` |
| `clientEntry`、`serverEntry` | 生成的入口文件 |
| `refresh()`、`flush()` | 安排一次重新生成；等待它完成 |

注册变化时，生成目录会在正在加载的插件都稳定之后重写一次；不再被注册的文件会被删除。写入后触发 `app/generate()`。

## ctx.bundler

应用的打包器，由打包器插件实现（目前是 `@cormijs/vite`）。

各个打包器的插件不能通用，所以 `plugin()` 接收一个按打包器名称索引的对象，为插件支持的每个打包器各给一个它自己的插件。当前的打包器取用自己的那一项；没有时抛出错误，插件加载失败，而不是悄悄缺少一部分功能。

```ts
import { type Context, importPeer } from '@cormijs/cormi'
import type {} from '@cormijs/rsbuild'   // 类型：rsbuild 一项的形式由 @cormijs/rsbuild 声明
import type {} from '@cormijs/vite'

export const inject = ['app', 'bundler']

export function apply(ctx: Context) {
  ctx.bundler.plugin({
    // 与 ctx.vite.plugin() 接收的相同：插件、插件数组，或每次启动、构建时调用的函数（可以是异步的）
    vite: async () => (await importPeer('@tailwindcss/vite', 'my-plugin with vite', () => import('@tailwindcss/vite'))).default(),
    // 与 ctx.rsbuild.plugin() 接收的相同
    rsbuild: { name: 'my-plugin', setup(api) { /* … */ } },
  })
}
```

各打包器的集成包宜作为可选的 peer 依赖，在用到时才用 `importPeer()` 导入：应用只需安装它所用打包器的那一个，缺少时报出包名。

修改打包配置也写成打包器的插件，例如 Vite 插件的 `config` 钩子：

```ts
ctx.bundler.plugin({
  vite: { name: 'my-plugin', config: () => ({ ssr: { noExternal: ['some-package'] } }) },
})
```

用 [unplugin](https://unplugin.unjs.io) 写的插件一份实现覆盖多个打包器，把它的各个变体放进对象：`{ vite: () => plugin.vite(options), rspack: () => plugin.rspack(options) }`——`@cormijs/rsbuild` 没有 `rsbuild` 一项时使用 `rspack` 一项。

| 成员 | 说明 |
|---|---|
| `name`、`version` | 实现的名称，如 `vite`，与打包器的版本 |
| `config` | 各打包器共有的构建配置：`publicPath`、`outDir`、`alias`、`define`、`sourcemap` |
| `outDir` | 构建输出目录的绝对路径 |
| `plugin(plugins)` | 加一个打包器插件：`{ [打包器]: 插件 }`，取当前打包器的一项 |
| `input(name, file)` | 客户端构建的额外入口 |
| `assets(file)` | 一个入口的资源：dev 下是模块本身，构建后是它的产物 |
| `transformDocument(url, html)` | dev 下给文档加上 HMR 客户端等 |
| `hotAccept(imports, callback)` | 生成热替换代码：`import * as name` 的模块更新时，以新模块调用 `callback`；渲染器生成入口时使用 |
| `loadServerEntry()` | 服务端入口：dev 下由开发服务器加载，否则来自构建产物 |
| `build()` | 构建，前后触发 `build/before`、`build/after` |

## ctx.vite

Vite 特有的能力，`ctx.bundler` 在 Vite 下就是它。dev 模式下，Vite 开发服务器挂在 `ctx.server` 上，注册变化时自动重启。只适用于 Vite 的插件 `inject: ['vite']` 后使用它；只是加一个 Vite 插件的话，用 `ctx.bundler.plugin({ vite })` 就够了。

```ts
import tailwindcss from '@tailwindcss/vite'

// 函数形式在每次启动或构建时调用，得到新的插件实例；env.ssr 表示服务端构建
ctx.vite.plugin(env => env.ssr ? [] : tailwindcss())

// 合并一个对象，或用函数修改
ctx.vite.configure({ build: { assetsInlineLimit: 0 } })
ctx.vite.configure((config, env) => ({ ...config, server: { ...config.server, origin: 'http://localhost:8000' } }))

// 构建的额外入口，例如多页应用的一个页面
ctx.vite.input('about', ctx.cormi.resolve('src/pages/about/index.tsx'))
```

| 成员 | 说明 |
|---|---|
| `plugin(plugin)` | 加一个 Vite 插件；也接收 `ctx.bundler.plugin()` 的对象 |
| `configure(config)` | 合并或修改 Vite 配置，按注册顺序 |
| `input(name, file)` | 客户端构建的额外入口 |
| `config` | preset 的构建配置（`publicPath`、`outDir`……） |
| `outDir` | 构建输出目录的绝对路径 |
| `devServer` | dev 模式下的 Vite 开发服务器 |
| `build()` | 构建客户端与服务端 bundle，前后触发 `build/before`、`build/after` |

## ctx.rsbuild

Rsbuild 特有的能力，`ctx.bundler` 在 Rsbuild 下就是它。应用分两个环境构建：`web`（浏览器入口与 `input()` 的入口）与 `node`（服务端入口），插件可以用 `api.modifyEnvironmentConfig` 只修改其中一个。dev 模式下开发服务器以中间件模式挂在 `ctx.server` 上，HMR 的 WebSocket 也在同一个 HTTP 服务上。

| 成员 | 说明 |
|---|---|
| `plugin(plugin)` | 加一个 Rsbuild 插件，或函数（每次启动、构建时调用）；也接收 `ctx.bundler.plugin()` 的对象 |
| `configure(config)` | 合并或修改 Rsbuild 配置，按注册顺序 |
| `input(name, file)` | 客户端构建的额外入口 |
| `devServer` | dev 模式下的 Rsbuild 开发服务器 |
| `build()` | 构建两个环境，前后触发 `build/before`、`build/after` |

## ctx.workspace

应用的 [工作区](/guide/console#工作区)：`plugins/*` 下的插件包。它在根上提供，但子插件读取它时要用 `ctx.get('workspace')`，或在 `inject` 中声明。

| 成员 | 说明 |
|---|---|
| `packages` | 工作区包：`{ [name]: { name, version, description, dir, path, exports } }` |
| `resolve(specifier, conditions)` | 工作区包中某个模块的文件，`source` 条件优先；不属于工作区时为 `undefined` |
| `create(name, options?)` | 新建一个插件包：`{ client?, console? }` |

包增删后触发 `workspace/update(packages)`。

## ctx.server

`@cordisjs/plugin-server` 提供的 HTTP 服务，只在 dev 与 start 下存在，所以要放进 `ctx.inject(['server'], ...)`。应用自己的中间件用更简单的 [`ctx.middleware`](#ctx-middleware)。

```ts
ctx.inject(['server'], (ctx) => {
  ctx.server.get('/healthz', async () => new Response('ok'))

  ctx.server.use(async (req, res, next) => {
    res._res.setHeader('access-control-allow-origin', '*')
    return next()
  })
})
```

路由处理器可以返回一个 `Response`。页面是所有路由之后的回退。

## ctx.middleware

应用的中间件，只在 dev 与 start 下存在，要 `inject: ['middleware']`。中间件基于 fetch，`order` 小的在外层，`path` 限定路径，`state` 是请求级的状态，见 [中间件与代理](/guide/middleware)。

```ts
export const inject = ['middleware']

export function apply(ctx: Context) {
  ctx.middleware.use(async (request, { state }, next) => {
    const response = await next()
    response.headers.set('x-frame-options', 'DENY')
    return response
  }, { order: -10 })
}
```

在 `ctx.server` 的路由中，用 `getRequestContext(req)` 取得同一个请求的 fetch `Request` 与 `state`。

## ctx.model、ctx.database

`@cormijs/database` 提供的 minato 服务：`ctx.model` 声明表，`ctx.database` 查询，只在 dev 与 start 下存在。见 [数据库](/guide/database)。

## build/node

`cormi build` 编译应用自己的 Node 代码时触发：插件把需要在生产环境运行的源文件加入 `entries`，并可以在 `data` 中记录运行时需要的信息（例如接口的路由表），`start` 模式下从 `ctx.cormi.build.data` 读取。插件树中的本地插件与工作区插件包由 core 自动加入。

```ts
if (ctx.cormi.mode === 'build') {
  ctx.on('build/node', (build) => {
    build.entries.add(ctx.cormi.resolve('jobs/cleanup.ts'))
    build.data.jobs = ['jobs/cleanup.ts']
  })
}
```

`start` 模式下，导入这些源文件的路径（`import(pathToFileURL(ctx.cormi.resolve('jobs/cleanup.ts')).href)`）得到的就是编译后的模块，即使源文件没有部署；`ctx.cormi.build.files` 是源文件到编译产物（相对于 `dist/node`）的对照。

## ctx.cache

`@cormijs/cache`（内存）、`@cormijs/cache-redis` 或 `@cormijs/cache-database` 提供的键值缓存，按表分开、可以过期，只在 dev 与 start 下存在，要 `inject: ['cache']`。见 [缓存](/guide/cache)。

实现另一种缓存，就是继承 `@cormijs/cache` 的 `Cache` 并实现 `get`、`set`、`delete`、`clear`、`keys`、`increment`；`getOrSet` 由基类提供。用 `packages/cache/tests/contract.ts` 的 `testCache()` 测试它，行为就与官方的实现一致。

## ctx.storage

`@cormijs/storage`（本地磁盘）或 `@cormijs/storage-s3` 提供的文件存储：`put`、`get`、`head`、`delete`、`list`、`url`、`response`，只在 dev 与 start 下存在，要 `inject: ['storage']`。见 [文件存储](/guide/storage)。实现另一种存储，就是继承 `@cormijs/storage` 的 `Storage`，用 `packages/storage/tests/contract.ts` 的 `testStorage()` 测试。

## ctx.session、ctx.auth

`@cormijs/plugin-session` 与 `@cormijs/plugin-auth` 提供：`ctx.session.regenerate(state)`、`destroy(state)`，`ctx.auth.login(state, user)`、`logout(state)`、`hash()`、`verify()`。见 [会话、鉴权与常用中间件](/guide/auth)。

## api/request

接口被请求、处理器运行之前触发（serial）：监听器返回的响应代替处理器的响应。`@cormijs/plugin-auth` 用它检查接口模块导出的 `auth`；插件可以用同样的方式实现按接口生效的规则，`route.module` 是接口模块的全部导出。

```ts
ctx.on('api/request', (route, request, { state }) => {
  if (route.module.beta && !state.user?.beta) return Response.json({ error: 'not yet' }, { status: 404 })
})
```

## ctx.cli

命令行。注册的命令以 `setup` 模式加载插件树后运行。

```ts
import { CommandError, createFile } from '@cormijs/cormi'

ctx.cli.command('routes', {
  description: 'print the routes of the app',
  async action(args) {
    for (const route of Object.values(ctx.router.routes)) console.log(route.id, route.path)
  },
})

ctx.cli.generator('store', {
  description: 'a store: src/stores/<name>.ts',
  async run(name) {
    if (!/^\w+$/.test(name)) throw new CommandError(`invalid name: ${name}`)
    return [await createFile(ctx.cormi.resolve(`src/stores/${name}.ts`), 'export default {}\n')]
  },
})
```

- `CommandError` 只打印消息，不打印调用栈，用来报告用户输入的问题。
- `createFile()` 不会覆盖已存在的文件。
- `cormi g store cart` 运行上面的生成器；`cormi help` 会列出插件注册的命令。
