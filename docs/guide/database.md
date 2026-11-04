# 数据库

数据库由 [minato](https://github.com/cordiverse/minato) 提供——koishi 使用的、cordis 原生的类型化 ORM。`@cormijs/database` 提供 `ctx.model`（表结构与迁移）与 `ctx.database`（查询），驱动是 minato 的驱动包，写进 `cormi.yml` 即可：

```yaml
- name: '@cormijs/database'
- name: '@minatojs/driver-sqlite'
  config:
    path: data/app.db
```

```sh
pnpm add @cormijs/database minato @minatojs/driver-sqlite
```

| 数据库 | 驱动 | 配置 |
|---|---|---|
| SQLite | `@minatojs/driver-sqlite` | `path`：数据库文件，相对于应用根目录；目录需要已经存在 |
| PostgreSQL | `@minatojs/driver-postgres` | `host`、`port`、`user`、`password`、`database` |
| MySQL | `@minatojs/driver-mysql` | `host`、`port`、`user`、`password`、`database` |
| MongoDB | `@minatojs/driver-mongo` | `host`、`port`、`database`，或 `uri` |
| 内存 | `@minatojs/driver-memory` | 无：数据在重启后消失，适合测试 |

换一个数据库就是换掉驱动这一行，表结构与查询的代码不变。密码这类机密不要写进 `cormi.yml`，从环境变量读取（`.env` 会被自动加载）：

```yaml
- name: '@minatojs/driver-postgres'
  config:
    host: localhost
    user: postgres
    password: !!js process.env.DATABASE_PASSWORD
    database: app
```

数据库只在应用提供服务时运行：`cormi build` 与生成器不会连接它。

## 表

表在 `server/models/*.ts` 中声明，每个文件是一个注入 `model` 的插件；表的类型通过声明合并加入 `Tables`：

::: code-group

```ts [server/models/todo.ts]
import type { Context } from '@cormijs/cormi'

export interface Todo {
  id: number
  title: string
  done: boolean
  createdAt: Date
}

declare module '@cormijs/database' {
  interface Tables {
    todo: Todo
  }
}

export const inject = ['model']

export function apply(ctx: Context) {
  ctx.model.extend('todo', {
    id: 'unsigned',
    title: 'string',
    done: 'boolean',
    createdAt: 'timestamp',
  }, { autoInc: true })
}
```

:::

应用启动时，驱动按声明创建表、补上新增的字段。`cormi g model todo` 生成这样一个文件，并在 `server/env.d.ts` 中引用数据库的类型。

## 查询

接口与插件注入 `database` 后使用 `ctx.database`：

```ts
export const inject = ['database']

export async function GET(request: Request, { ctx }: ApiContext) {
  return ctx.database.get('todo', { done: false }, { sort: { id: 'asc' }, limit: 20 })
}
```

| 方法 | 作用 |
|---|---|
| `get(table, query, cursor?)` | 查询，`cursor` 有 `fields`、`sort`、`limit`、`offset` |
| `create(table, data)` | 插入一行，返回它（含自增主键） |
| `set(table, query, update)` | 更新，返回 `{ matched, modified }` |
| `upsert(table, rows)` | 插入或更新 |
| `remove(table, query)` | 删除，返回 `{ removed }` |
| `select(table).execute()` | 聚合、连接等复杂查询 |

查询条件、表达式（`$`）与关联的写法见 minato 的文档；`@cormijs/database` 重新导出了 minato 的全部 API：

```ts
import { $ } from '@cormijs/database'

const count = await ctx.database.eval('todo', row => $.count(row.id), { done: true })
```

## 在页面中读取

服务端渲染或客户端导航时，页面的 `loader` 在服务端运行，可以通过 `context.ctx` 直接查询，不必经过接口：

```tsx
import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData } from '@cormijs/react/client'

export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  return context.ctx.database.get('todo', {})
}
```

修改数据仍然通过接口完成。页面只导入表的类型（`import type { Todo } from '../../server/models/todo'`），见 [页面与服务端](/guide/sides#两侧只在三处相遇)。
