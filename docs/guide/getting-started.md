# 快速开始

::: warning 候选版本
Cormi 正处于 0.1 的候选版本（`0.1.0-rc`），API 在正式版之前还可能调整。在第一个正式版发布之前，npm 的 `latest` 与 `next` 标签都指向最新的候选版本。
:::

## 环境要求

- Node.js 22.12 或更高
- pnpm 10（npm、yarn 也可以）

## 创建一个应用

```sh
pnpm create @cormijs my-app      # 或 npm create @cormijs、yarn create @cormijs
```

脚手架先问应用有哪一侧，再只问这一侧需要的选择：

| 类型 | 有什么 | 接着询问 |
|---|---|---|
| 前端 `web` | 在浏览器渲染的页面，构建为静态文件 | UI 框架、打包器 |
| 后端 `api` | 接口与数据库，没有页面 | 数据库 |
| 前后端 `fullstack` | 在浏览器渲染的页面，加上接口与数据库 | UI 框架、打包器、数据库 |
| 服务端渲染 `ssr` | 在服务端渲染的页面，它的 `loader` 直接读取数据库；加上接口 | UI 框架、打包器、数据库 |

四种类型的区别见 [页面与服务端](/guide/sides)。所有选择也可以由参数给出，适合脚本与 CI：

```sh
pnpm create @cormijs my-app --template ssr --ui vue --bundler rsbuild --database postgres
pnpm create @cormijs my-api -t api --database sqlite --no-install
```

| 参数 | 取值 |
|---|---|
| `-t`、`--template` | `web`、`api`、`fullstack`、`ssr` |
| `--ui` | `react`、`vue` |
| `--bundler` | `vite`、`rsbuild` |
| `--database` | `sqlite`、`postgres`、`mysql`、`mongo`、`memory`、`none` |
| `--no-install` | 只写文件，不安装依赖 |
| `-y`、`--yes` | 未给出的选择使用默认值，不再询问 |
| `-f`、`--force` | 写入非空的目录 |

然后运行：

```sh
cd my-app
pnpm dev              # http://localhost:8000，控制台在 /__cormi/
```

前后端应用的首页是一个待办列表：页面通过接口读写 SQLite 中的数据；服务端渲染的应用由 `loader` 直接读取数据库，HTML 里就带着数据。

### 手动创建

不用脚手架时，一个前端应用只需要这些：

```sh
mkdir my-app && cd my-app
pnpm init
pnpm add @cormijs/cormi @cormijs/preset @cormijs/vite @cormijs/react @vitejs/plugin-react@^5 react react-dom
pnpm add -D @types/react @types/react-dom typescript
```

在 package.json 中加上 `"type": "module"` 与脚本：

```json
{
  "type": "module",
  "scripts": {
    "dev": "cormi dev",
    "build": "cormi build",
    "start": "cormi start",
    "setup": "cormi setup"
  }
}
```

`cormi.yml` 列出应用、它的打包器与 UI 框架：

::: code-group

```yaml [cormi.yml]
- name: '@cormijs/preset'
  config:
    title: My App
- name: '@cormijs/vite'
- name: '@cormijs/react'
```

:::

写一个页面，React 的 API 从 `@cormijs/react/client` 导入：

::: code-group

```tsx [src/pages/index.tsx]
export default function Home() {
  return <h1>Hello, Cormi</h1>
}
```

:::

`tsconfig.json` 继承 Cormi 生成的配置，路径别名（`@/`、`@@/`）和资源类型就都有了：

::: code-group

```json [tsconfig.json]
{
  "extends": "./src/.cormi/tsconfig.json"
}
```

:::

`src/.cormi` 是生成目录，应加入 `.gitignore`。类型检查之前可以先运行 `cormi setup`，它只写生成文件，不启动服务。

三行也可以合成一行 `- name: '@cormijs/preset-react'`（依赖换成 `@cormijs/preset-react`，它自带 Vite、React 与 `@vitejs/plugin-react`）。用 Rsbuild 或 Vue 时换掉对应的一行和依赖，见 [打包器与 UI 框架](/guide/stack)。加上服务端，见 [服务端代码与接口](/guide/server) 与 [数据库](/guide/database)。

## 运行示例

示例在仓库中，依赖仓库里的包：

```sh
git clone https://github.com/cormijs/cormi.git
cd cormi
pnpm install
pnpm build          # 编译各个包
cd examples/basic
pnpm dev            # http://localhost:8000
```

`examples/` 下的每个示例都展示一组能力：

| 示例 | 内容 |
|---|---|
| `basic` | 约定式路由、布局、服务端 `loader` 与它的 `context`、SSR、接口、代理、本地插件、静态导出 |
| `with-api` | 纯后端：SQLite 数据库、表、增删改查的接口、中间件与请求状态、缓存 |
| `with-tailwind` | Tailwind CSS、legacy 构建、`crossorigin` |
| `with-antd` | Ant Design 主题与服务端样式抽取 |
| `with-model` | 模型、初始状态、mock、`cormi lint` |
| `with-request` | `request()` / `useRequest()`、请求拦截与全局错误处理 |
| `with-styles` | styled-components 与 UnoCSS |
| `with-data` | react-query、dva、valtio |
| `with-layout` | 配置式路由生成菜单的 antd 布局、统计 |
| `with-mpa` | 多页应用 |
| `mf-host` + `mf-remote` | 模块联邦 |
| `federation-host` + `federation-users` + `federation-orders` | 联邦应用：子包单独部署，底座汇集 |
| `qiankun-master` + `qiankun-slave` | qiankun 主应用与子应用 |
| `with-vue` | Vue：单文件组件的路由与 loader、运行时插件安装 Vue 插件 |

`basic`、`with-tailwind`、`with-vue` 与模块联邦的示例也在 Rsbuild 上运行，见 [打包器与 UI 框架](/guide/stack)。

## 接下来

- [页面与服务端](/guide/sides)：应用的两侧，以及它们相遇的地方
- [cormi.yml](/guide/config)：插件条目和 preset 的配置项
- [目录与约定](/guide/conventions)：哪些文件有特殊含义
- [路由与数据](/guide/routing)：页面、布局与 `loader`
- [插件的结构](/plugin/)：给应用写一个插件
