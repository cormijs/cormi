# 构建与部署

```sh
cormi build
```

构建会等待插件树加载完毕，写入生成文件，再由打包器（`ctx.bundler`）打包，然后退出。输出在 `dist/`：

| 路径 | 内容 |
|---|---|
| `dist/index.html` | 纯客户端渲染时的文档 |
| `dist/static/` | 带哈希的脚本、样式与资源 |
| `dist/server/server.mjs` | 服务端入口：仅在开启 SSR、存在服务端 `loader`、API 路由或插件注册了服务端模块时生成 |
| `public/` 中的文件 | 原样复制到 `dist/` 根目录 |

## 用 Node 运行

```sh
cormi preview
```

`preview` 运行构建产物：提供静态资源（`static/` 下的文件长期缓存），渲染页面，响应 `loader` 端点、API 路由和代理。使用了 SSR、服务端 `loader` 或 API 路由的应用，在生产环境也用它运行。端口和主机来自 preset 的 `port`、`host`，或命令行的 `--port`、`--host`。

## 静态托管

只在浏览器渲染、不依赖服务端的应用，可以把 `dist/` 交给任意静态服务器：

- 使用 `history: browser`（默认）时，静态服务器需要把未知路径回退到 `index.html`；不能配置回退时，改用 `history: hash`。
- 资源不在站点根路径下时，设置 `publicPath`（如 `/app/` 或 CDN 地址）；应用本身挂在子路径下时，设置 `base`。
- 想让静态托管的页面也带有服务端渲染的内容，用 [`@cormijs/plugin-export-static`](/plugins/build#export-static) 在构建后把路由预渲染为 HTML。

## 旧浏览器

`targets` 控制产物的语法目标。需要支持不认识模块脚本的浏览器时，加上 [`@cormijs/plugin-legacy`](/plugins/build#legacy)，它会额外构建 legacy bundle，并把对应的 `nomodule` 标签写进文档。

## 构建中的插件

插件可以在构建前后执行任务：

```ts
ctx.on('build/before', async () => {
  // 打包器开始构建之前
})

ctx.on('build/after', async ({ outDir, assets, server }) => {
  // 客户端与服务端 bundle 都已写入
})
```

`@cormijs/plugin-export-static` 在 `build/after` 中用服务端 bundle 渲染页面，`@cormijs/plugin-federation` 在其中写出联邦清单。
