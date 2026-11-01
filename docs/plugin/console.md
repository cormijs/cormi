# 扩展控制台

插件可以给 [控制台](/guide/console) 加页面。和应用一样，控制台的页面是浏览器插件：Node 端用包名注册它，再提供它需要的数据和方法。

::: code-group

```ts [src/index.ts]
import type { Context } from '@cormijs/cormi'

export const name = 'cache'

export function apply(ctx: Context) {
  const cache = new Map<string, unknown>()

  // ctx.console 只在 dev 模式下存在
  ctx.inject(['console'], (ctx) => {
    // 浏览器端的页面，按包名注册
    ctx.console.entry('cormi-plugin-cache/console')

    // 推送给页面的数据：客户端连接时发送，refresh() 后再次发送
    const entries = ctx.console.data('cache', () => [...cache.keys()])

    // 页面可以调用的方法
    ctx.console.method('cache/clear', () => {
      cache.clear()
      entries.refresh()
    })
  })
}
```

:::

::: code-group

```tsx [console/index.tsx]
import type { Context } from '@cormijs/cormi/client'
import { useConsole, useData } from '@cormijs/cormi/console'

function CachePage() {
  const keys = useData<string[]>('cache') ?? []
  const console = useConsole()
  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>缓存</h1>
      </header>
      <ul>{keys.map(key => <li key={key}>{key}</li>)}</ul>
      <button className="cc-button" onClick={() => console.call('cache/clear')}>清空缓存</button>
    </div>
  )
}

export default (ctx: Context) => {
  ctx.$console.page({ path: '/cache', name: '缓存', component: CachePage })
}
```

:::

`package.json` 的 `exports` 中加上 `"./console": "./console/index.tsx"`。用 `cormi g plugin <name> --console` 创建的插件包已经带有这些代码。

## Node 端：ctx.console

| 方法 | 说明 |
|---|---|
| `entry(module, config?)` | 在控制台中挂载一个浏览器插件。与 `ctx.app.entry()` 相同，传入包名，`config` 序列化为 JSON |
| `data(name, get)` | 提供数据。客户端连接时收到当前值；调用返回值的 `refresh()` 后再次推送，同一时刻的多次刷新合并为一次 |
| `method(name, handler)` | 注册一个可被页面调用的方法，返回值发送回页面，抛出的错误以消息形式返回 |
| `broadcast(name, payload)` | 向所有页面发送一个事件 |

三者都是 effect：插件卸载时，它的页面、数据与方法随之移除。

## 浏览器端：ctx.$console

| 成员 | 说明 |
|---|---|
| `page({ path, name, icon?, order?, component })` | 添加一个页面：控制台框架下的一个路由，和菜单中的一项 |
| `call(name, ...args)` | 调用服务器上的方法，返回 Promise |
| `listen(name, listener)` | 监听服务器广播的事件 |
| `get(name)` | 读取一项数据的当前值 |

控制台页面总是 React 组件——控制台自带 React，即使应用用的是 Vue。React 钩子从 `@cormijs/cormi/console` 导入：

| 钩子 | 说明 |
|---|---|
| `useData(name)` | 一项数据的值，数据推送时组件重新渲染；到达之前为 `undefined` |
| `useConsole()` | 控制台服务，用于 `call()` |
| `useStatus()` | 与服务器的连接状态：`connecting`、`open` 或 `closed` |

页面可以使用控制台的样式类（`cc-page`、`cc-page-head`、`cc-button`、`cc-table`……），与内置页面保持一致；`@cormijs/cormi/console` 也导出 `Section`、`Tag`、`Lamp`、`Empty`、`CodeLine` 几个组件。

开发服务器重启时，控制台会自动重新连接，并重新收到所有数据。
