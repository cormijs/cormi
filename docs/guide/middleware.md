# 中间件与代理

`cormi dev`、`cormi start` 运行一个 HTTP 服务（`@cordisjs/plugin-server`）。一个请求依次经过：

1. 应用的中间件（`ctx.middleware`），按 `order` 从外到内；
2. 插件注册的处理：mock、代理、静态资源；
3. 路由：接口（`server/api`）、`loader` 端点、插件注册的路由；
4. 页面：GET 请求的回退，开启 SSR 时在服务端渲染。

## 中间件

中间件基于 fetch：收到 `Request`，返回 `Response`。`next()` 是之后的一切——内层的中间件、路由与页面；中间件可以修改它的响应，也可以不调用它而直接返回：

::: code-group

```ts [server/index.ts]
import type { Context } from '@cormijs/cormi'

export const inject = ['middleware']

export function apply(ctx: Context) {
  ctx.middleware.use(async (request, { state }, next) => {
    const start = performance.now()
    const response = await next()
    response.headers.set('server-timing', `app;dur=${(performance.now() - start).toFixed(1)}`)
    return response
  }, { path: '/api' })
}
```

:::

| 选项 | 默认值 | 说明 |
|---|---|---|
| `order` | `0` | 小的在外层：先看到请求、后看到响应 |
| `path` | `/` | 只处理这个路径之下的请求 |

`ctx.middleware.use()` 是调用方插件的 effect：插件卸载（或热重载）时，中间件随之移除。中间件包裹的是整个应用，所以前端应用同样可以使用，例如统一添加响应头。

## 请求状态

每个请求有一个 `state` 对象，中间件、接口与页面的 `loader` 读写的是同一个对象。会话、登录用户这类信息由中间件写入，之后的处理直接读取。`state` 的类型由声明合并扩展：

```ts
declare module '@cormijs/cormi' {
  interface State {
    requestId: string
  }
}

ctx.middleware.use(async (request, { state }, next) => {
  state.requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  return next()
})
```

```ts
// server/api/health.ts
export function GET(request: Request, { state }: ApiContext) {
  return { requestId: state.requestId }
}
```

## 代理

preset 的 `proxy` 把请求转发到其他服务器，常用于前端应用对接单独部署的后端：

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

代理在 dev 与 start 下生效，排在 mock 之后。请求通过 `fetch()` 转发并以流的形式返回，不支持 WebSocket。

## ctx.server

需要更底层的控制时，插件可以直接使用 `ctx.server` 注册路由与 connect 风格的中间件，见 [Node 端服务](/plugin/services#ctx-server)。
