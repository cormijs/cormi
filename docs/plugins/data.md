# 数据与状态

## model

`src/models` 下默认导出一个 React hook 的模块就是一个模型。hook 的返回值由所有调用 `useModel(<文件名>)` 的组件共享。

```yaml
- name: '@cormijs/plugin-model'
```

::: code-group

```ts [src/models/counter.ts]
import { useCallback, useState } from 'react'

export default function useCounter() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => setCount(count => count + 1), [])
  return { count, increment }
}
```

:::

```tsx
import { useModel } from '@cormijs/plugin-model/client'

export default function Counter() {
  const { count, increment } = useModel('counter')
  // 带选择器时，只有选中的值变化才重新渲染
  const doubled = useModel('counter', model => model.count * 2)
  return <button onClick={increment}>{count} / {doubled}</button>
}
```

模型的类型自动生成，`useModel('counter')` 的返回值有完整类型。默认导出不是函数的模块（如 dva 模型）会被跳过，所以它可以与 plugin-dva 共用目录。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `dir` | `src/models` | 模型目录 |

## initial-state

应用的初始状态（通常是当前用户）。应用的浏览器插件监听 `initialState/load` 提供它：

```yaml
- name: '@cormijs/plugin-initial-state'
```

::: code-group

```ts [src/app.ts]
import type { Context } from 'cormi/client'
import type {} from '@cormijs/plugin-initial-state/client'

declare module '@cormijs/plugin-initial-state/client' {
  interface InitialState {
    name: string
    role: string
  }
}

export default (ctx: Context) => {
  ctx.on('initialState/load', async () => {
    const response = await fetch('/api/me')
    if (!response.ok) throw new Error(`failed to load the current user: ${response.status}`)
    return response.json()
  })
}
```

:::

```tsx
import { useInitialState } from '@cormijs/plugin-initial-state/client'

export default function Profile() {
  const { initialState, loading, error, refresh, setInitialState } = useInitialState()
  if (loading) return <p>加载中…</p>
  if (error) return <button onClick={refresh}>重试</button>
  return <p>{initialState?.name}</p>
}
```

`initialState/load` 是 serial 事件：第一个返回值不为 `undefined` 的监听器决定初始状态。应用挂载时加载一次，`refresh()` 重新加载。

## request

基于 fetch 的请求库：`request()` 发请求，`useRequest()`（ahooks）管理请求状态。

```yaml
- name: '@cormijs/plugin-request'
  config:
    baseURL: /api
    timeout: 3000
    dataField: data
    headers:
      x-app: cormi
```

| 配置 | 说明 |
|---|---|
| `baseURL` | 相对 URL 的前缀 |
| `timeout` | 超时毫秒数，超时后中止请求 |
| `headers` | 每个请求都带的请求头 |
| `credentials` | `omit`、`same-origin` 或 `include` |
| `dataField` | `useRequest()` 返回响应体中的这个字段，如 `data` |

```tsx
import { request, useRequest } from '@cormijs/plugin-request/client'

const { data, loading, error, run } = useRequest(() => request('/users', { params: { page } }), {
  refreshDeps: [page],
})

await request('/users', { method: 'POST', data: { name: 'Alice' } })
```

`request(url, options)` 的选项在 `RequestInit` 之上增加了 `params`（查询参数）、`data`（不是 `BodyInit` 时以 JSON 发送）、`baseURL`、`timeout`、`responseType`、`validateStatus` 与 `skipErrorHandler`。失败时抛出 `RequestError`，带有 `response` 与响应体 `data`。

拦截和全局错误处理通过事件完成：

::: code-group

```tsx [src/app.tsx]
import type { Context } from 'cormi/client'
import type {} from '@cormijs/plugin-request/client'

export default (ctx: Context) => {
  // waterfall：修改请求，或不调用 next() 直接返回一个 Response
  ctx.on('request/fetch', async (url, init, config, next) => {
    init.headers.set('authorization', 'Bearer demo-token')
    return next()
  })

  // bail：返回 true 表示已处理，useRequest() 不再记录这个错误
  ctx.on('request/error', (error) => {
    toast((error.data as { message?: string } | undefined)?.message ?? error.message)
    return true
  })
}
```

:::

## react-query

为每个渲染的应用创建一个 `QueryClient`（服务端渲染时每个请求一个），dev 下在应用 hydrate 之后显示 devtools。

```yaml
- name: '@cormijs/plugin-react-query'
  config:
    defaultOptions:
      queries:
        staleTime: 60000
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `defaultOptions` | `{}` | `QueryClient` 的 `defaultOptions` |
| `devtools` | `true` | dev 下显示 devtools |

应用需要依赖 `@tanstack/react-query`，在页面中直接使用 `useQuery()` 等。`QueryClient` 创建时触发 `reactQuery/client(client)`。

## dva

dva-core 与 dva-loading。`src/models` 下导出 dva 模型对象的模块是模型，命名空间取文件名。

```yaml
- name: '@cormijs/plugin-dva'
  config:
    immer: true
```

::: code-group

```ts [src/models/count.ts]
export default {
  state: 0,
  reducers: {
    add: (state: number) => state + 1,
  },
  effects: {
    *addLater(_: unknown, { call, put }: any) {
      yield call(delay, 300)
      yield put({ type: 'add' })
    },
  },
}
```

:::

```tsx
import { useDispatch, useSelector } from '@cormijs/plugin-dva/client'

const count = useSelector((state: any) => state.count)
const adding = useSelector((state: any) => state.loading.effects['count/addLater'])
const dispatch = useDispatch()
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `dir` | `src/models` | 模型目录 |
| `loading` | `true` | 在 `state.loading` 中跟踪 effect |
| `immer` | `false` | 用 immer 草稿写 reducer |

`@cormijs/plugin-dva/client` 还导出 `connect`、`useStore` 与 `getDvaApp()`；dva 实例创建后触发 `dva/create(app)`。

## valtio

重新导出 valtio 与 `valtio/utils`，并提供 `defineStore()`：dev 下自动接入 Redux DevTools。

```yaml
- name: '@cormijs/plugin-valtio'
```

::: code-group

```ts [src/stores/settings.ts]
import { defineStore } from '@cormijs/plugin-valtio/client'

export const settings = defineStore('settings', { compact: false })
```

:::

```tsx
import { useSnapshot } from '@cormijs/plugin-valtio/client'
import { settings } from '../stores/settings'

const { compact } = useSnapshot(settings)
settings.compact = true
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `devtools` | `true` | dev 下接入 Redux DevTools |
