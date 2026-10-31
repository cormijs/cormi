# cormi.yml

`cormi.yml` 是应用的插件树，由 cordis 官方的 [`@cordisjs/plugin-loader`](https://github.com/cordiverse/cordis) 加载。文件是一个列表，每个条目是一个插件：

```yaml
- name: '@cormi/preset-react'     # 包名
  config:
    title: My App
    ssr: true
- name: '@cormi/plugin-request'
  config:
    timeout: 3000
- name: ./plugin.ts               # 应用自己的插件，TypeScript 由 tsx 加载
  config:
    generator: cormi
- name: '@cormi/plugin-mock'
  disabled: true                  # 保留配置，但不加载
```

| 字段 | 含义 |
|---|---|
| `name` | 插件模块：包名、包的子路径（`@cormi/plugin-qiankun/master`）或相对路径的本地文件 |
| `config` | 插件的配置。加载前先经插件的 `Config`（Schema）校验，并填充默认值 |
| `disabled` | 为 `true` 时不加载该插件 |

## 热重载

dev 模式下，`cormi.yml` 的变化会被逐条应用，而不是重启整个应用：

- 修改某个条目的 `config`：只有这个插件重载
- 新增条目：加载对应插件
- 删除条目或设置 `disabled: true`：卸载对应插件，它注册的路由、标签、Vite 插件、浏览器入口都会撤回

本地插件（如 `./plugin.ts`）的源码修改后也会被热替换。

## 表达式

以 `!!js` 标记的值是 JavaScript 表达式，常用来读取环境变量：

```yaml
- name: '@cormi/plugin-mf'
  config:
    name: host
    remotes:
      remote: !!js "(process.env.REMOTE_ORIGIN || 'http://localhost:8002') + '/remoteEntry.js'"
```

表达式以字符串引号开头时，整体要再用一层引号包起来，否则 YAML 会把它当作普通字符串。

## preset-react 的配置

`@cormi/preset-react` 的配置是扁平的，它的各个子插件读取各自需要的字段。

### 服务器

| 配置 | 默认值 | 说明 |
|---|---|---|
| `host` | `localhost`（或 `HOST`） | dev 与 preview 服务器的主机 |
| `port` | `8000`（或 `PORT`） | dev 与 preview 服务器的端口，被占用时顺延 |
| `proxy` | — | 转发请求到其他服务器，见 [代理](/guide/server#代理) |

命令行的 `--port`、`--host` 优先于配置。

### 路由与渲染

| 配置 | 默认值 | 说明 |
|---|---|---|
| `pages` | `src/pages` | 约定式路由的目录 |
| `layout` | `true` | 用 `src/layouts/index` 包裹所有路由 |
| `routes` | — | 配置式路由；配置后不再扫描约定式路由，见 [配置式路由](/guide/routing#配置式路由) |
| `base` | `/` | 应用的 basename |
| `history` | `browser` | `browser`、`hash` 或 `memory` |
| `ssr` | `false` | 在服务端渲染页面 |

### HTML

| 配置 | 默认值 | 说明 |
|---|---|---|
| `title` | — | 文档标题 |
| `lang` | `en` | `<html lang>` |
| `mountElementId` | `root` | 应用挂载的元素 id |
| `favicons` | `[]` | 图标 URL；不配置时使用 `public/favicon.*` |
| `metas` | `[]` | `<meta>` 标签的属性 |
| `links` | `[]` | `<link>` 标签的属性 |
| `styles` | `[]` | 样式表：URL，或 `{ tag, attrs, content }` |
| `headScripts` | `[]` | `<head>` 中的脚本：URL，或 `{ tag, attrs, content }` |
| `scripts` | `[]` | `<body>` 末尾的脚本 |
| `crossorigin` | `false` | 入口脚本、样式和预加载的 `crossorigin`，资源由 CDN 提供时使用 |

### 构建

| 配置 | 默认值 | 说明 |
|---|---|---|
| `publicPath` | `/` | 资源的 URL 前缀 |
| `outDir` | `dist` | 构建输出目录 |
| `alias` | `{}` | 模块别名 |
| `define` | `{}` | 编译时替换的常量 |
| `sourcemap` | `false` | 生成 source map |
| `targets` | — | 目标浏览器：`{ chrome: 87, safari: 14 }`（umi 写法）或 esbuild 目标数组 |
| `vite` | — | 原始的 Vite 配置，合并在默认配置之上 |

## 环境变量

启动时，应用目录下的 `.env` 与 `.env.local` 会被读入 `process.env`（后者优先，支持 `${VAR}` 展开）。`NODE_ENV` 在 dev 模式下为 `development`，其余模式为 `production`。

浏览器代码通过 `import.meta.env` 读取以 `VITE_` 或 `CORMI_APP_` 开头的变量。

## 查看解析后的配置

```sh
cormi config                 # 列出插件树：名称、状态、id
cormi config preset-react    # 打印匹配插件解析后的配置（含默认值）
```
