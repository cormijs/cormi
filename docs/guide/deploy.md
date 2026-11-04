# 构建与部署

`cormi dev` 运行源码；生产环境运行构建产物：先 `cormi build`，再 `cormi start`。

| 类型 | 构建 | 运行 | 部署的内容 |
|---|---|---|---|
| 前端 | `cormi build` | 任意静态服务器，或 `cormi start` | 页面：`dist/` 中除 `node/`、`server/` 以外的文件 |
| 后端 | `cormi build` | `cormi start` | `dist/`、`cormi.yml`、`package.json` 与依赖 |
| 前后端、服务端渲染 | `cormi build` | `cormi start` | 同上 |

## 构建

```sh
cormi build
```

构建会等待插件树加载完毕，然后做两件事：

1. **页面**：写入生成文件，由打包器（`ctx.bundler`）打包。没有页面的后端跳过这一步。
2. **Node 代码**：用 esbuild 编译应用自己的 Node 代码——`server/` 的插件、表与接口，`cormi.yml` 中的本地插件（如 `./plugin.ts`），以及插件树用到的工作区插件包——每个文件编译为一个模块，共用的代码放进公共 chunk。它们导入的应用内文件、工作区插件包与 tsconfig 路径别名指向的文件一并编译；`node_modules` 中的包与 Node 的内置模块在运行时导入，所以生产环境要安装依赖。

构建不运行 `server/` 的代码，也不连接数据库。输出在 `dist/`：

| 路径 | 内容 |
|---|---|
| `dist/index.html` | 纯客户端渲染时的文档 |
| `dist/static/` | 带哈希的脚本、样式与资源 |
| `public/` 中的文件 | 原样复制到 `dist/` 根目录 |
| `dist/server/server.mjs` | 页面的服务端入口：仅在开启 SSR、存在服务端 `loader` 或插件注册了服务端模块时生成 |
| `dist/node/` | 编译后的 Node 代码，`manifest.json` 记录每个模块来自哪个源文件 |

`dist/node` 的位置是固定的；打包器的 `outDir` 只决定页面的输出位置。

## 用 Node 运行

```sh
cormi start
```

`start` 以生产模式（`ctx.cormi.mode` 为 `start`，`NODE_ENV=production`）运行构建产物：

- 插件树中的本地插件与工作区插件包，加载的是 `dist/node` 中编译后的模块；
- `server/` 的插件、表与接口来自 `dist/node`，接口的路由表在构建时确定；
- 页面由 `dist/` 提供：静态资源（`static/` 下的文件长期缓存）、服务端渲染、`loader` 端点。

运行时不需要源码，也不需要 TypeScript；源码改了要重新构建。端口和主机来自 preset 的 `port`、`host`，环境变量 `PORT`、`HOST`，或命令行的 `--port`、`--host`；端口被占用时直接报错。还没有构建时，`cormi start` 会提示先运行 `cormi build`。

编译后的模块位于 `dist/node`，所以 Node 代码不要用 `import.meta.url` 定位应用中的文件，改用 `ctx.cormi.resolve('data/seed.json')` 这样相对于应用根目录的路径。

部署的内容是 `dist/`、`cormi.yml`、`package.json`、`.env`（如果有）与生产依赖。用 Docker 时，构建与运行可以分成两个阶段：

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY cormi.yml ./
ENV PORT=8000
CMD ["pnpm", "start"]
```

数据库的密码等机密通过环境变量传入，`cormi.yml` 中用 `!!js process.env.DATABASE_PASSWORD` 读取。

## 静态托管

只在浏览器渲染、没有服务端的前端应用，也可以把页面交给任意静态服务器——`dist/` 中除 `node/`、`server/` 以外的文件：

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
