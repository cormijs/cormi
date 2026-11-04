# 会话、鉴权与常用中间件

这五个插件都是服务端的中间件，按固定的顺序包裹请求，写进 `cormi.yml` 即启用：

```yaml
- name: '@cormijs/cache'               # 会话存在缓存里：内存、Redis 或数据库
- name: '@cormijs/plugin-session'
- name: '@cormijs/plugin-auth'
- name: '@cormijs/plugin-security'
- name: '@cormijs/plugin-cors'
  config:
    origin: [https://app.example.com]
    credentials: true
- name: '@cormijs/plugin-rate-limit'
  config:
    path: /api/login
    max: 5
```

| 插件 | 作用 | `order` | 需要 |
|---|---|---|---|
| `@cormijs/plugin-security` | 安全相关的响应头 | -400 | — |
| `@cormijs/plugin-cors` | 跨域请求：预检与响应头 | -300 | — |
| `@cormijs/plugin-rate-limit` | 每个客户端在一个时间窗口内的请求数 | -200 | `cache` |
| `@cormijs/plugin-session` | cookie 会话，`state.session` | -100 | `cache` |
| `@cormijs/plugin-auth` | 登录用户，`state.user`，要求登录的接口 | -90 | `session` |

`order` 小的在外层（见 [中间件](/guide/middleware)）：安全头加在包括 429、401 在内的每个响应上；预检请求不计入限流、不读取会话；应用自己的中间件（默认 0）在最里层，已经能读到 `state.user`。每个插件都可以用 `order` 配置调整位置。

完整的例子是仓库中的 `examples/with-auth`：服务端渲染的页面、登录表单、只有管理员能看的页面与接口。

## 会话

`state.session` 是这个请求的会话数据。中间件、接口与页面的 `loader` 读写同一个对象，响应之后，变化的数据存入 `ctx.cache`；浏览器的 cookie 中只有会话的 id。

```ts
declare module '@cormijs/plugin-session' {
  interface SessionData {
    cart: number[]
  }
}

export const inject = ['session']

export async function POST(request: Request, { state }: ApiContext) {
  const { id } = await request.json()
  state.session.cart = [...state.session.cart ?? [], id]
  return state.session.cart
}
```

- 会话为空时不设置 cookie，所以没有用到会话的访问者不会产生存储。
- `ctx.session.regenerate(state)` 给会话换一个新 id（数据保留），用户登录时调用，防止会话固定攻击；`ctx.session.destroy(state)` 结束会话。
- 会话存在 `ctx.cache` 里，所以要先有缓存。多个进程运行同一个应用时，用 `@cormijs/cache-redis` 或 `@cormijs/cache-database`，会话才能共享。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `name` | `cormi.sid` | cookie 的名字 |
| `maxAge` | 7 天 | 没有请求多久之后会话过期，毫秒 |
| `rolling` | `true` | 每个请求都延长会话；`false` 时只有数据变化才延长 |
| `secure` | `auto` | cookie 只在 HTTPS 上发送；`auto` 按请求判断，代理之后看 `x-forwarded-proto` |
| `sameSite` | `lax` | 其他站点发起的 POST 不带 cookie，防止 CSRF |
| `domain` | — | cookie 的域 |

cookie 总是 `HttpOnly`：页面的脚本读不到会话 id。

## 登录

`@cormijs/plugin-auth` 把登录的用户存在会话里。用户存在哪里、怎样核对，由应用决定：

```ts
// server/api/login.ts
export const inject = ['auth']

export async function POST(request: Request, { ctx, state }: ApiContext) {
  const { name, password } = await request.json()
  const user = await ctx.database.get('user', { name }).then(rows => rows[0])
  if (!user || !await ctx.auth.verify(password, user.password)) {
    return Response.json({ error: 'wrong name or password' }, { status: 401 })
  }
  ctx.auth.login(state, { id: user.id, name: user.name, role: user.role })
  return state.user
}
```

| API | 作用 |
|---|---|
| `ctx.auth.login(state, user)` | 登录：会话换新 id，`user` 以 JSON 存入会话 |
| `ctx.auth.logout(state)` | 登出：会话结束 |
| `state.user` | 这个请求的用户，中间件、接口与 `loader` 都能读到 |
| `ctx.auth.hash(password)` | 密码的散列（scrypt，随机盐），存入数据库 |
| `ctx.auth.verify(password, hash)` | 核对密码，时间恒定 |

`state.user` 的类型通过声明合并扩展。会话里只放每个请求都要用的信息（id、名字、角色）；需要最新的数据时，按 id 查询数据库。

```ts
declare module '@cormijs/plugin-auth' {
  interface User {
    id: number
    name: string
    role: 'admin' | 'member'
  }
}
```

### 要求登录的接口

接口模块导出 `auth`：

```ts
export const auth = true                                   // 没有登录：401
export const auth = (user: User) => user.role === 'admin'  // 没有登录：401；不是管理员：403
```

导出了 `auth` 的接口会等待 `auth` 服务：没有加载 `@cormijs/plugin-auth` 时，它返回 503，而不是对所有人开放。

### 页面

页面的 `loader` 在服务端运行，读取 `context.state.user`；没有权限时抛出 `redirect()`：

```tsx
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  const { user } = context.state
  if (user?.role !== 'admin') throw redirect('/login')
  return { name: user.name }
}
```

服务端渲染时，页面直接带着用户的信息；客户端导航时，`loader` 端点的请求同样带着会话的 cookie。登录、登出之后，用 `navigate()` 或 `revalidate()` 让 `loader` 重新运行。

## 安全响应头

`@cormijs/plugin-security` 给每个响应加上这些头（响应自己设置了的不覆盖）：

| 配置 | 默认值 | 响应头 |
|---|---|---|
| `noSniff` | `true` | `X-Content-Type-Options: nosniff` |
| `frameOptions` | `SAMEORIGIN` | `X-Frame-Options`，`false` 不设置 |
| `referrerPolicy` | `strict-origin-when-cross-origin` | `Referrer-Policy` |
| `crossOriginOpenerPolicy` | `same-origin` | `Cross-Origin-Opener-Policy` |
| `hsts` | 180 天，含子域名 | `Strict-Transport-Security`，只在生产环境（`cormi start`） |
| `contentSecurityPolicy` | 不设置 | `Content-Security-Policy` |
| `headers` | `{}` | 其他响应头 |

## 跨域

`@cormijs/plugin-cors` 处理 `path`（默认 `/api`）之下的跨域请求：回答预检，给响应加上 `Access-Control-*` 头。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `origin` | `*` | 允许的来源列表，或 `*` |
| `credentials` | `false` | 是否允许携带 cookie；需要列出来源，不能是 `*` |
| `methods` | GET、HEAD、PUT、PATCH、POST、DELETE | 允许的方法 |
| `allowHeaders` | 预检请求的那些 | 允许的请求头 |
| `exposeHeaders` | `[]` | 页面可以读取的响应头 |
| `maxAge` | 600 | 预检结果的缓存时间，秒 |

`cormi dev` 下，Vite 的开发服务器会先回答来自 localhost 的预检请求；生产环境中由这个插件回答。

## 限流

`@cormijs/plugin-rate-limit` 限制每个客户端在一个时间窗口内的请求数，计数存在 `ctx.cache`（用 Redis 时多个进程共享计数）。超过之后返回 429 与 `Retry-After`，直到下一个窗口；每个响应都带有 `RateLimit-Limit`、`RateLimit-Remaining`、`RateLimit-Reset`。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `max` | 100 | 一个窗口内的请求数 |
| `window` | 60000 | 窗口的长度，毫秒 |
| `path` | `/api` | 这个路径之下的请求 |
| `methods` | 全部 | 计数的方法 |
| `trustProxy` | `false` | 应用在代理之后时，客户端是 `x-forwarded-for` 的第一个地址 |

在 `cormi.yml` 中写多个条目，就能给不同的路径不同的限制：

```yaml
- name: '@cormijs/plugin-rate-limit'          # 整个 API
- name: '@cormijs/plugin-rate-limit'          # 登录更严格
  config:
    path: /api/login
    max: 5
```
