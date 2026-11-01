# 服务端：API、代理与 SSR

`cormi dev` 和 `cormi preview` 都会启动一个 HTTP 服务（`@cordisjs/plugin-server`）。插件注册的路由（API、mock、代理……）和静态资源先处理请求，页面是最后的回退。

## API 路由

`src/api` 下的每个模块是一个 API 路由：

| 文件 | 路径 |
|---|---|
| `src/api/users/index.ts` | `/api/users` |
| `src/api/users/[id].ts` | `/api/users/:id` |
| `src/api/files/[...path].ts` | `/api/files/*path` |

模块按 HTTP 方法导出处理器（`GET`、`POST`……），或导出一个处理所有方法的 `default`。处理器接收标准的 `Request`，返回 `Response`；返回其他值时，以 JSON 发送：

::: code-group

```ts [src/api/users/[id].ts]
import type { ApiHandler } from 'cormi'
import { users } from './index.ts'

export const GET: ApiHandler = (request, { params }) => {
  const user = users.find(user => String(user.id) === params.id)
  if (!user) return Response.json({ error: 'not found' }, { status: 404 })
  return user
}
```

:::

- 参数更少的路由优先匹配：`/api/users/me` 先于 `/api/users/:id`。
- 模块没有导出请求方法对应的处理器时，返回 405。
- API 模块会被打包进服务端入口，所以 `cormi preview` 运行构建产物时同样可用。

开发阶段需要假数据时，用 [`@cormijs/plugin-mock`](/plugins/build#mock)，它的路由优先于真实的 API。

## 代理

`proxy` 把请求转发到其他服务器，在 dev 与 preview 下生效（排在 mock 之后）：

```yaml
- name: '@cormijs/preset'
  config:
    proxy:
      /api:
        target: http://localhost:3000
        changeOrigin: true
        pathRewrite:
          ^/api: ''
        headers:
          x-from: cormi
```

| 选项 | 说明 |
|---|---|
| `target` | 转发的目标服务器 |
| `changeOrigin` | 发送目标服务器的 host；原来的 host 保留在 `x-forwarded-host` |
| `pathRewrite` | 改写路径，键是正则 |
| `headers` | 附加到转发请求的请求头 |

请求通过 `fetch()` 转发并以流的形式返回，不支持 WebSocket。

## 服务端渲染

```yaml
- name: '@cormijs/preset'
  config:
    ssr: true
```

开启后，页面请求由服务端入口（`src/.cormi/server.tsx`）渲染：匹配的路由先运行 `loader`，再把应用渲染为 HTML，数据随页面发送，浏览器端 hydrate。

- 服务端也会挂载应用的浏览器插件（`ctx.app.entry()` 注册的模块与 `src/app.tsx`），所以插件中只能在浏览器运行的代码要放进事件或 effect 里，或判断 `typeof window`。
- 访问 `window`、`document` 的组件代码同样要放进 `useEffect`。
- CSS-in-JS 库通过 `useServerInsertedHTML()` 把样式插入 `<head>`；`@cormijs/plugin-antd` 与 `@cormijs/plugin-styled-components` 已经这样做了。
- 服务端渲染的状态码来自路由：未匹配的路径返回 404。

不开启 SSR 时，服务器为所有页面请求返回同一个文档，由浏览器渲染；首屏路由加载期间显示 `src/loading.tsx`。
