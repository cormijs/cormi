# 事件

事件是 Cormi 的扩展点。umi 里 `api.modifyXxx`、`api.onXxx` 的用途，在这里由事件承担。

```ts
ctx.on('build/after', async ({ outDir }) => {
  await writeFile(join(outDir, 'version.txt'), version)
})
```

`ctx.on()` 是 effect：插件卸载时监听随之移除。

## 分发方式

每个事件都写明它的分发方式，决定了监听器如何被调用、返回值有什么意义：

| 方式 | 调用 | 返回值 |
|---|---|---|
| `emit` | 同步调用所有监听器 | 忽略 |
| `parallel` | 并行调用所有监听器，等待全部完成 | 忽略 |
| `serial` | 依次调用，等待每一个 | 第一个不为 `undefined` 的返回值 |
| `bail` | 同步依次调用 | 第一个不为 `undefined` 的返回值，之后的监听器不再调用 |
| `waterfall` | 环绕式中间件：最后一个参数是 `next`，调用它进入下一个监听器 | 由监听器决定 |

## Node 端

| 事件 | 方式 | 时机 |
|---|---|---|
| `router/update(routes)` | emit | 路由表重新计算且发生变化之后 |
| `app/generate()` | emit | `src/.cormi` 写入之后 |
| `build/before()` | parallel | Vite 构建开始之前 |
| `build/after(result)` | parallel | 客户端与服务端 bundle 写入之后；`result` 含 `outDir`、`assets`、`inputs`、`server` |
| `workspace/update(packages)` | emit | 工作区的插件包增加或减少之后 |

## 浏览器端

| 事件 | 方式 | 时机 |
|---|---|---|
| `router/change(location, action)` | emit | 位置变化，包括初始位置 |
| `app/bootstrap()` | bail | 入口即将挂载应用；返回 `true` 表示由该插件接管挂载 |
| `app/mount()` | emit | 应用渲染进页面之后 |
| `app/props(props)` | emit | 宿主（如 qiankun 主应用）更新了传入的 props |

## 插件的事件

官方插件也通过事件开放扩展点：

| 事件 | 方式 | 插件 | 用途 |
|---|---|---|---|
| `request/fetch(url, init, config, next)` | waterfall | request | 拦截请求，可修改请求或替换响应 |
| `request/error(error, config)` | bail | request | 全局错误处理，返回 `true` 表示已处理 |
| `initialState/load()` | serial | initial-state | 提供初始状态 |
| `dva/create(app)` | emit | dva | dva 实例创建之后，可以注册模型、插件 |
| `reactQuery/client(client)` | emit | react-query | `QueryClient` 创建之后 |
| `federation/load(name, ctx)` | emit | federation | 一个子包加载完毕 |

例如给所有请求加上令牌：

::: code-group

```ts [src/app.tsx]
import type { Context } from 'cormi/client'
import type {} from '@cormi/plugin-request/client'

export default (ctx: Context) => {
  ctx.on('request/fetch', async (url, init, config, next) => {
    init.headers.set('authorization', `Bearer ${localStorage.getItem('token')}`)
    return next()
  })
}
```

:::

## 声明自己的事件

事件通过声明合并（declaration merging）声明，名字采用 `命名空间/动作` 的形式，并在注释里写明分发方式：

```ts
declare module 'cordis' {
  interface Events {
    /**
     * The search index is about to be written.
     * @mode waterfall
     */
    'search/index'(documents: Document[], next: () => Promise<Document[]>): Promise<Document[]>
  }
}

// 触发
const documents = await ctx.waterfall('search/index', collected, async () => collected)
```

| 触发方法 | 对应方式 |
|---|---|
| `ctx.emit(name, ...args)` | emit |
| `ctx.parallel(name, ...args)` | parallel |
| `ctx.serial(name, ...args)` | serial |
| `ctx.bail(name, ...args)` | bail |
| `ctx.waterfall(name, ...args, next)` | waterfall |
