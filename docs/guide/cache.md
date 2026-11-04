# 缓存

`ctx.cache` 是服务端的键值缓存：数据按表分开，每个键可以设置过期时间。缓存只有一个接口，实现可以替换。换一个实现，就是换掉 `cormi.yml` 中的一行，代码不变：

| 实现 | `cormi.yml` | 适用于 |
|---|---|---|
| 内存 | `@cormijs/cache` | 开发，或只有一个进程的应用；重启后清空 |
| Redis | `@cormijs/cache-redis` | 多个进程或多台机器共用；重启后保留 |
| 数据库 | `@cormijs/cache-database` | 不想多运行一个服务时，存在 `@cormijs/database` 的 `cormi_cache` 表中 |

```yaml
- name: '@cormijs/cache'
```

```yaml
- name: '@cormijs/cache-redis'
  config:
    url: !!js process.env.REDIS_URL     # redis://[[user]:password@]host[:port][/database]
    prefix: 'cormi:'                     # 键的前缀，默认 cormi:
```

```sh
pnpm add @cormijs/cache                          # 内存
pnpm add @cormijs/cache @cormijs/cache-redis     # Redis：@cormijs/cache 提供接口与类型
```

缓存属于服务端，只在应用提供服务时运行（`cormi dev`、`cormi start`）：构建不会连接 Redis。

## 使用

接口与插件注入 `cache` 后使用 `ctx.cache`：

::: code-group

```ts [server/api/captcha.ts]
import type { ApiContext } from '@cormijs/cormi'

declare module '@cormijs/cache' {
  interface Tables {
    captcha: string
  }
}

export const inject = ['cache']

export async function POST(request: Request, { ctx }: ApiContext) {
  const id = crypto.randomUUID()
  const code = Math.random().toString().slice(2, 8)
  await ctx.cache.set('captcha', id, code, 5 * 60 * 1000)   // 5 分钟后过期
  return { id }
}
```

:::

| 方法 | 作用 |
|---|---|
| `get(table, key)` | 键的值；不存在或已过期时为 `undefined` |
| `set(table, key, value, maxAge?)` | 设置键的值，`maxAge` 毫秒后过期；没有 `maxAge` 时一直保留。值为 `undefined` 或 `maxAge` 不大于 0 时删除这个键 |
| `delete(table, key)` | 删除键 |
| `clear(table)` | 删除一张表的所有键 |
| `keys(table)` | 一张表中未过期的键 |
| `increment(table, key, delta?, maxAge?)` | 把数字加上 `delta`（默认 1，不存在时从 0 开始），返回结果；`maxAge` 在键创建时生效 |
| `getOrSet(table, key, factory, maxAge?)` | 键的值；没有时调用 `factory`，把结果存 `maxAge` 毫秒后返回 |

`getOrSet` 适合缓存开销大的查询：

```ts
const count = await ctx.cache.getOrSet('stats', 'todos', () => ctx.database.eval('todo', row => $.count(row.id)), 5000)
```

`increment` 的过期时间从第一次递增算起，正好是一个计数窗口，例如每分钟的请求次数：

```ts
const hits = await ctx.cache.increment('rate', ip, 1, 60_000)
if (hits > 100) return new Response('Too Many Requests', { status: 429 })
```

## 类型

表的值的类型通过声明合并扩展 `Tables`，未声明的表的值是 `unknown`。和数据库一样，在 `server/env.d.ts` 中引用 `@cormijs/cache`，`ctx.cache` 就有了类型：

::: code-group

```ts [server/env.d.ts]
/// <reference types="@cormijs/database" />
/// <reference types="@cormijs/cache" />
```

:::

## 各实现的行为相同

- 值以 JSON 保存：读回的是 JSON 的值，例如 `Date` 读回为字符串，内存中的缓存也是如此。所以开发时用内存、生产环境用 Redis，读到的值没有差别。
- 过期的键读不到，也不出现在 `keys()` 中；它们随后被清除。
- Redis 的 `increment` 是原子的；数据库的 `increment` 先读后写，多个进程同时递增同一个键时可能少计。

三个实现运行同一组测试（`packages/cache/tests/contract.ts`），这些行为由测试保证。
