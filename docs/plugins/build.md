# 构建与开发

## mock

`mock/**` 下的模块定义 mock 接口。它们优先于应用的 API 路由，修改后下一个请求即生效。

```yaml
- name: '@cormijs/plugin-mock'
  config:
    delay: 200
```

::: code-group

```ts [mock/user.ts]
import { defineMock } from '@cormijs/plugin-mock'

export default defineMock({
  'GET /api/me': { name: 'Cormi', role: 'admin' },
  'POST /api/todos/:id/toggle': (request, { params }) => ({ id: Number(params.id), toggled: true }),
})
```

:::

键是 `方法 路径`，值是直接返回的数据，或一个接收 `Request` 的处理器（返回 `Response` 或以 JSON 发送的值）。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `dir` | `mock` | mock 模块的目录 |
| `delay` | `0` | 每个响应的延迟毫秒数 |
| `production` | `false` | 在生产环境（`cormi start`）下也启用，例如演示站点；mock 文件随 `cormi build` 编译 |

`cormi g mock users` 创建 `mock/users.ts`。

## export-static

构建之后，用服务端 bundle 把静态路由（以及 `extraRoutePaths`）预渲染为 HTML，供静态托管。页面在浏览器中照常 hydrate。

```yaml
- name: '@cormijs/plugin-export-static'
  config:
    extraRoutePaths: [/users/1, /users/2]
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `extraRoutePaths` | `[]` | 静态路由之外需要渲染的路径，例如动态路由的具体实例 |
| `htmlSuffix` | `false` | 把 `/about` 写成 `about.html`，而不是 `about/index.html` |
| `ignorePreRenderError` | `false` | 跳过渲染失败的页面，而不是让构建失败 |

重定向的路径会被跳过。预渲染运行页面的 `loader`，所以页面内容是构建那一刻的数据。

## legacy

用 `@vitejs/plugin-legacy` 额外构建一份 legacy bundle，并把 `nomodule` 等标签写进应用的文档：不支持模块脚本的浏览器加载它。

```yaml
- name: '@cormijs/plugin-legacy'
  config:
    targets: ['defaults', 'not IE 11']
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `targets` | `defaults` | legacy bundle 的 browserslist 查询 |
| `modernPolyfills` | `false` | 为现代 bundle 也注入 polyfill |

只影响 `cormi build`；dev 模式下不生效。

## mpa

多页应用：`src/pages/<name>/index.tsx` 各自成为 `<name>.html`，页面之间是普通链接，不带客户端路由。应用的浏览器插件在每个页面上同样生效。

```yaml
- name: '@cormijs/plugin-mpa'
```

```
src/pages/
├─ index/index.tsx    → index.html
└─ about/
   ├─ index.tsx       → about.html
   └─ config.json     { "title": "关于" }，这一页的标题
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `dir` | `src/pages` | 页面目录 |

## analytics

Google Analytics 4 与百度统计。客户端导航通过 `router/change` 自动上报页面浏览。

```yaml
- name: '@cormijs/plugin-analytics'
  config:
    ga: G-XXXXXXXXXX
    baidu: 0123456789abcdef
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `ga` | — | GA4 的衡量 ID |
| `baidu` | — | 百度统计的站点 ID |
| `dev` | `false` | dev 模式下也上报 |

## lint

注册 `cormi lint` 命令。使用应用自己的 `eslint.config.*`；没有时使用内置的 TypeScript 与 React hooks 规则。

```yaml
- name: '@cormijs/plugin-lint'
```

```sh
cormi lint                # 检查默认的文件
cormi lint src/pages      # 检查指定的文件或目录
cormi lint --fix          # 自动修复
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `files` | `['src', 'mock', 'plugin.ts']` | 不指定文件时检查的范围 |
