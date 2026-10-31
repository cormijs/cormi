# 目录与约定

一个 Cormi 应用的目录：

```
my-app/
├─ cormi.yml            插件树
├─ plugin.ts            应用自己的 Node 插件（可选，写进 cormi.yml）
├─ plugins/             工作区插件包，按包名加载源码（见“控制台与工作区”）
├─ mock/                mock 接口（@cormi/plugin-mock）
├─ public/              原样提供的文件
└─ src/
   ├─ pages/            约定式路由
   ├─ layouts/index.tsx 全局布局
   ├─ api/              API 路由
   ├─ models/           模型（@cormi/plugin-model、@cormi/plugin-dva）
   ├─ app.tsx           应用自己的浏览器插件
   ├─ global.css        全局样式
   └─ .cormi/           生成文件，不要编辑
```

## 文件约定

这些约定由 preset 中的 `Conventions` 插件处理。每条约定都是一次注册：文件存在时生效，删除文件即撤回，dev 模式下无需重启。

| 文件 | 作用 |
|---|---|
| `src/app.(ts\|tsx)` | 应用自己的浏览器插件，默认导出 `(ctx) => {}` |
| `src/global.(css\|less\|scss…)` | 在应用启动前导入 |
| `src/global.(ts\|tsx)` | 在应用启动前执行；服务端渲染时也会执行 |
| `src/overrides.(css\|less\|scss…)` | 导入时给每条选择器加上 `body` 前缀，用来覆盖其他样式 |
| `src/loading.(tsx\|jsx)` | 纯客户端渲染时，首屏路由加载期间显示的组件 |
| `public/favicon.(ico\|png\|svg)` | 未配置 `favicons` 时作为页面图标 |
| `src/layouts/index.tsx` | 包裹所有路由的布局，见 [布局](/guide/routing#布局) |
| `src/pages/**` | 约定式路由，见 [路由与数据](/guide/routing) |
| `src/api/**` | API 路由，见 [API 路由](/guide/server#api-路由) |

## 路径别名

| 别名 | 指向 |
|---|---|
| `@/` | `src/` |
| `@@/` | `src/.cormi/`，插件生成的模块，如 `@@/plugin-model/models` |

应用的 `tsconfig.json` 继承 `src/.cormi/tsconfig.json`，别名的类型随之生效。

## 生成文件

`src/.cormi` 由 `ctx.app` 维护：插件通过 `ctx.app.file()` 注册生成文件，注册变化时重新写入，不再需要的文件会被删除。

| 文件 | 用途 |
|---|---|
| `routes.ts` | 路由清单与懒加载的路由模块 |
| `entry.tsx` | 浏览器入口：创建客户端 Context，挂载浏览器插件，渲染或 hydrate |
| `server.tsx` | 服务端入口，仅在开启 SSR、存在服务端 `loader` 或插件注册了服务端模块时生成 |
| `tsconfig.json`、`typings.d.ts` | 路径别名与资源模块的类型 |
| `plugin-*/…` | 各插件生成的模块 |

`cormi setup` 只写这些文件然后退出，适合在类型检查或 CI 之前运行。
