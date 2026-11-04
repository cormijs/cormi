# 构建与部署

怎样部署取决于应用有哪一侧（见 [页面与服务端](/guide/sides)）：

| 类型 | 构建 | 运行 | 部署的内容 |
|---|---|---|---|
| 前端 | `cormi build` | 任意静态服务器 | `dist/` |
| 后端 | 不需要 | `cormi start` | 源码（`cormi.yml`、`server/`）与依赖 |
| 前后端、服务端渲染 | `cormi build` | `cormi start` | 源码、依赖与 `dist/` |

## 构建页面

```sh
cormi build
```

构建会等待插件树加载完毕，写入生成文件，再由打包器（`ctx.bundler`）打包页面，然后退出。它不运行 `server/` 的代码，也不连接数据库。输出在 `dist/`：

| 路径 | 内容 |
|---|---|
| `dist/index.html` | 纯客户端渲染时的文档 |
| `dist/static/` | 带哈希的脚本、样式与资源 |
| `dist/server/server.mjs` | 页面的服务端入口：仅在开启 SSR、存在服务端 `loader` 或插件注册了服务端模块时生成 |
| `public/` 中的文件 | 原样复制到 `dist/` 根目录 |

没有页面的后端运行 `cormi build` 时什么也不做，所以 CI 可以对每种应用都执行 `build`。

## 用 Node 运行

```sh
cormi start
```

`start` 运行应用：服务端代码（`server/` 的插件、表与接口）、中间件、数据库这类服务端的服务，以及构建好的页面——提供静态资源（`static/` 下的文件长期缓存）、渲染页面、响应 `loader` 端点与代理。端口和主机来自 preset 的 `port`、`host`，环境变量 `PORT`、`HOST`，或命令行的 `--port`、`--host`。

服务端代码在生产环境同样直接运行源码，所以部署的是源码与依赖，而不只是 `dist/`：

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV PORT=8000
CMD ["pnpm", "start"]
```

数据库的密码等机密通过环境变量传入，`cormi.yml` 中用 `!!js process.env.DATABASE_PASSWORD` 读取；应用根目录的 `.env` 也会被加载。`cormi preview` 与 `start` 相同，用于在本地试用构建产物。

## 静态托管

只在浏览器渲染的前端应用，可以把 `dist/` 交给任意静态服务器：

- 使用 `history: browser`（默认）时，静态服务器需要把未知路径回退到 `index.html`；不能配置回退时，改用 `history: hash`。
- 资源不在站点根路径下时，设置 `publicPath`（如 `/app/` 或 CDN 地址）；应用本身挂在子路径下时，设置 `base`。
- 想让静态托管的页面也带有服务端渲染的内容，用 [`@cormijs/plugin-export-static`](/plugins/build#export-static) 在构建后把路由预渲染为 HTML。
- 后端单独部署时，开发阶段用 [代理](/guide/middleware#代理) 把 `/api` 转发过去。

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
