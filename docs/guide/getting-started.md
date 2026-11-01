# 快速开始

::: warning 候选版本
Cormi 正处于 0.1 的候选版本（`0.1.0-rc`），以 npm 的 `next` 标签发布，API 在正式版之前还可能调整。
:::

## 环境要求

- Node.js 22.12 或更高
- pnpm 10（npm、yarn 也可以）

## 创建一个应用

```sh
mkdir my-app && cd my-app
pnpm init
pnpm add @cormijs/cormi@next @cormijs/preset@next @cormijs/vite@next @cormijs/react@next @vitejs/plugin-react react react-dom
pnpm add -D @types/react @types/react-dom typescript
```

在 package.json 中加上 `"type": "module"` 与脚本：

```json
{
  "type": "module",
  "scripts": {
    "dev": "cormi dev",
    "build": "cormi build",
    "preview": "cormi preview",
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

然后运行：

```sh
pnpm dev              # http://localhost:8000，控制台在 /__cormi/
```

`src/.cormi` 是生成目录，应加入 `.gitignore`。类型检查之前可以先运行 `cormi setup`，它只写生成文件，不启动服务。

三行也可以合成一行 `- name: '@cormijs/preset-react'`（依赖换成 `@cormijs/preset-react`，它自带 Vite、React 与 `@vitejs/plugin-react`）。用 Rsbuild 或 Vue 时换掉对应的一行和依赖，见 [打包器与 UI 框架](/guide/stack)。

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
| `basic` | 约定式路由、布局、服务端 `loader`、SSR、API 路由、代理、本地插件、静态导出 |
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

- [cormi.yml](/guide/config)：插件条目和 preset 的配置项
- [目录与约定](/guide/conventions)：哪些文件有特殊含义
- [路由与数据](/guide/routing)：页面、布局与 `loader`
- [插件的结构](/plugin/)：给应用写一个插件
