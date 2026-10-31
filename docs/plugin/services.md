# Node 端服务

| 服务 | 提供方 | 注册方法 |
|---|---|---|
| `ctx.cormi` | `cormi`（根上提供，无需 inject） | — |
| `ctx.cli` | `cormi`（根上提供，无需 inject） | `command()`、`generator()` |
| `ctx.router` | `@cormi/preset-react` | `route()`、`layout()`、`patch()` |
| `ctx.html` | `@cormi/preset-react` | `head()`、`body()`、`transform()` |
| `ctx.app` | `@cormi/preset-react` | `entry()`、`import()`、`file()`、`server()` |
| `ctx.vite` | `@cormi/preset-react` | `plugin()`、`configure()`、`input()` |
| `ctx.server` | `@cordisjs/plugin-server`（dev 与 preview） | `get()`、`post()`、`all()`、`use()`、`ws()` |

所有注册方法都是 effect：注册属于调用方插件，插件卸载时自动撤回，并返回一个可以提前撤回的函数。

## ctx.cormi

应用的环境。

| 成员 | 说明 |
|---|---|
| `cwd` | 应用根目录 |
| `mode` | `dev`、`build`、`preview` 或 `setup` |
| `env` | dev 下为 `development`，否则为 `production` |
| `paths` | `{ cwd, src, tmp, public }`，`tmp` 即 `src/.cormi` |
| `resolve(...paths)` | 相对于应用根目录解析路径 |

```ts
if (ctx.cormi.mode === 'dev') {
  // 只在开发时做的事
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

标签的形式是 `{ tag, attrs?, content? }`，`content` 原样插入。`renderTag()` 与 `escapeHtml()` 可以从 `cormi` 导入。

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

## ctx.vite

打包器。dev 模式下，Vite 开发服务器挂在 `ctx.server` 上，注册变化时自动重启。

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
| `plugin(plugin)` | 加一个 Vite 插件 |
| `configure(config)` | 合并或修改 Vite 配置，按注册顺序 |
| `input(name, file)` | 客户端构建的额外入口 |
| `config` | preset 的构建配置（`publicPath`、`outDir`……） |
| `outDir` | 构建输出目录的绝对路径 |
| `devServer` | dev 模式下的 Vite 开发服务器 |
| `build()` | 构建客户端与服务端 bundle，前后触发 `build/before`、`build/after` |

## ctx.server

`@cordisjs/plugin-server` 提供的 HTTP 服务，只在 dev 与 preview 下存在，所以要放进 `ctx.inject(['server'], ...)`。

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

## ctx.cli

命令行。注册的命令以 `setup` 模式加载插件树后运行。

```ts
import { CommandError, createFile } from 'cormi'

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
