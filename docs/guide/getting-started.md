# 快速开始

::: warning Cormi 仍在 0.x
Cormi 还没有发布到 npm。现在使用它，需要克隆仓库，在仓库的 workspace 里创建应用；发布之后，这里的步骤会更新为从 npm 安装。
:::

## 环境要求

- Node.js 22.12 或更高
- pnpm 10

## 运行示例

```sh
git clone https://github.com/Mahoo12138/cormijs.git
cd cormijs
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

## 创建一个应用

在仓库的 `examples/` 下新建一个目录（它属于 pnpm workspace，可以直接依赖仓库里的包）：

::: code-group

```json [package.json]
{
  "name": "my-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "cormi dev",
    "build": "cormi build",
    "preview": "cormi preview",
    "setup": "cormi setup"
  },
  "dependencies": {
    "@cormi/preset": "workspace:*",
    "@cormi/react": "workspace:*",
    "@cormi/vite": "workspace:*",
    "cormi": "workspace:*",
    "react": "^19.3.1",
    "react-dom": "^19.3.1"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0"
  }
}
```

:::

`cormi.yml` 列出应用、它的打包器与 UI 框架：

::: code-group

```yaml [cormi.yml]
- name: '@cormi/preset'
  config:
    title: My App
- name: '@cormi/vite'
- name: '@cormi/react'
```

:::

三行也可以合成一行 `- name: '@cormi/preset-react'`，配置写在一起，效果相同。

写一个页面，React 的 API 从 `@cormi/react/client` 导入：

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

然后在仓库根目录执行 `pnpm install`，回到应用目录运行：

```sh
pnpm dev
```

`src/.cormi` 是生成目录，应加入 `.gitignore`。类型检查之前可以先运行 `cormi setup`，它只写生成文件，不启动服务。

## 接下来

- [cormi.yml](/guide/config)：插件条目和 preset 的配置项
- [目录与约定](/guide/conventions)：哪些文件有特殊含义
- [路由与数据](/guide/routing)：页面、布局与 `loader`
- [插件的结构](/plugin/)：给应用写一个插件
