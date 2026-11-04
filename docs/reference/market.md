# 设计：插件市场与兼容性

> 状态：四个阶段均已实施；索引服务是 [cormijs/registry](https://github.com/cormijs/registry)。本页记录决策与理由。

目标：用户在控制台的市场里在线安装插件之前，就能知道它支持哪些打包器、哪些 UI 框架，以及是否适用于当前的应用；装上之后，不兼容的原因也说得清楚。

## 为什么需要声明

兼容性在运行时已经成立：只适用于 React 的插件 `inject: ['react']`，在 Vue 应用里停在 pending；`ctx.bundler.plugin({ vite })` 缺少当前打包器的一项时，插件加载失败。但市场要在**安装之前**、从 npm 上、不运行代码地知道这些。

现有的 package.json 不够用。只适用于 React 的插件都以 `@cormijs/react` 为 peer 依赖，可以推断；打包器的支持却写在代码里（`ctx.bundler.plugin({ vite, rsbuild })` 的键），package.json 里看不出来——unocss、styled-components 只支持 Vite，tailwindcss、mf 两者都支持，它们的 package.json 都没有提到。所以需要显式的声明，以及让声明不说谎的机制。

## 已定的决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 声明的形状 | package.json 的 `cormi` 字段，专门的 `bundler`、`renderer` 两个键；其他服务用 koishi 式的 `service` | 打包器与 UI 框架是互斥的选择，一个应用各有且只有一个，插件支持其中的子集；其他服务是可叠加的，koishi 的 required / optional / implements 正合适 |
| 声明的值 | `ctx.bundler.name`、`ctx.renderer.name` | 与运行中的应用报告的身份相同，匹配不需要对照表；第三方打包器（`name: 'webpack'`）自然加入 |
| 不兼容时安装 | 警告但允许 | 用户可能正准备切换技术栈；后果（pending 或加载失败）说清楚即可 |
| 市场的数据来源 | 字段为准，关键词由工具生成 | npm 的搜索接口返回关键词、不返回自定义字段：关键词让一次搜索请求就能显示徽章与筛选，详情与安装时再读精确版本的字段；作者不手写关键词 |
| 声明与代码一致 | `cormi plugin check` 在组合矩阵中实际加载插件，推断并写回声明 | 运行时以代码为准，声明是给市场看的；由工具从代码得出声明，而不是靠作者记得更新 |

## 声明

```json
{
  "name": "@cormijs/plugin-tailwindcss",
  "keywords": ["cormi-plugin", "bundler:vite", "bundler:rsbuild"],
  "peerDependencies": { "cormi": "^0.2.0" },
  "cormi": {
    "description": { "zh-CN": "Tailwind CSS v4", "en": "Tailwind CSS v4" },
    "bundler": ["vite", "rsbuild"]
  }
}
```

```ts
interface Manifest {
  /** 市场显示的描述，可以按语言给出；缺省时用 package.json 的 description */
  description?: string | Dict<string>
  category?: string
  /** 预览版，市场默认不列出 */
  preview?: boolean
  hidden?: boolean
  /** 支持的打包器：ctx.bundler.name；省略表示不限 */
  bundler?: string[]
  /** 支持的 UI 框架：ctx.renderer.name；省略表示不限 */
  renderer?: string[]
  service?: {
    /** 必需的服务，缺少时插件停在 pending */
    required?: string[]
    optional?: string[]
    /** 提供的服务 */
    implements?: string[]
  }
  /** 一个包导出多个插件时，按导出路径覆盖：`"./slave": { "bundler": ["vite"] }` */
  exports?: Dict<Omit<Manifest, 'exports'>>
}
```

| 写法 | 含义 |
|---|---|
| 省略 `bundler` / `renderer` | 不限：大多数插件什么都不用写 |
| `["vite", "rsbuild"]` | 只支持这些 |
| `[]` | 无效，按未声明处理，`cormi plugin check` 报错 |
| `exports["./slave"]` | `@cormijs/plugin-qiankun/slave` 这一个插件的声明，逐个键覆盖包级的（没写的键沿用包级的） |
| `peerDependencies.cormi` | 支持的 Cormi 版本，市场与应用的版本比较 |

打包器与 UI 框架的实现也声明自己：`@cormijs/rsbuild` 写 `"bundler": ["rsbuild"], "service": { "implements": ["bundler", "rsbuild"] }`，`@cormijs/vue` 写 `"renderer": ["vue"]` 与 `["renderer", "vue"]`。规则是：实现了 `bundler`（或 `renderer`）、且这一维度只列出一个名称的包，提供的就是那个打包器（`providedStack()`）；匹配时这一维度不判断——装上它是替换，而不是不兼容。市场因此可以把“此插件需要 Rsbuild”接上“安装 `@cormijs/rsbuild`”，并在换上它之前列出受影响的插件，与 koishi 市场对缺失服务列出“可由下列插件实现”相同。

## 关键词

关键词是字段的镜像，由 `cormi plugin check --write` 生成，约定与 koishi 相同：

| 关键词 | 对应 |
|---|---|
| `cormi-plugin` | 出现在市场中（已有） |
| `bundler:vite`、`renderer:react` | `bundler`、`renderer` 的每一项 |
| `required:x`、`optional:x`、`impl:x` | `service` 的各项 |
| `market:hidden`、`market:preview` | `hidden`、`preview` |

`conclude(pkg)`（`@cormijs/core`）把 package.json 规范化为 `Manifest`：字段中有的维度以字段为准，没有的从关键词补上；两者都没有时，从 peer 依赖推断（`@cormijs/react` → `renderer: ['react']`，`@cormijs/vite` → `bundler: ['vite']`……），并标为推断。市场、控制台与将来的索引服务共用这一个函数。

## 匹配

```ts
checkCompat(manifest, stack: { bundler?: string; renderer?: string; cormi?: string }): {
  status: 'ok' | 'incompatible' | 'unknown'
  reasons: { dimension: 'bundler' | 'renderer' | 'cormi'; supported: string[]; current: string }[]
  inferred: boolean
}
```

- 声明了某个维度、当前值不在其中：不兼容，原因写明“只支持 Vite，当前应用使用 Rsbuild”。
- 应用自己缺少这一维度（还没有打包器）：不据此判断。
- 没有任何声明、也推断不出：未知。

## 控制台

| 位置 | 行为 |
|---|---|
| 市场列表 | 徽章（`Vite · Rsbuild`、`React`）；不兼容的卡片置灰并写明原因；“只看与当前应用兼容的”筛选，默认开启；徽章与筛选只用搜索结果中的关键词 |
| 插件详情 | 读取最新版的 `cormi` 字段，列出支持的组合、需要的服务（以及可以提供它们的插件）；最新版不兼容而旧版兼容时，提供“安装 1.4.2（支持 Vue）” |
| 安装 | 不兼容：按钮变为“仍要安装”，说明后果——插件会停在 pending，或加载失败；未知：照常安装，提示未声明 |
| 插件页 | pending 的原因用声明解释：“此插件只支持 React，当前应用使用 Vue”，而不只是“等待服务 react” |
| 切换技术栈 | 把 `@cormijs/vite` 换成 `@cormijs/rsbuild`、把 `@cormijs/react` 换成 `@cormijs/vue` 之前，列出已启用插件中不支持目标的那些——同一份声明反向使用 |
| 工作区 | 本地插件包同样显示声明与检查结果 |

## 让声明不说谎：`cormi plugin check`

在插件包的目录运行。对本机已安装的每个组合（打包器 × UI 框架），以 setup 模式启动一个最小的应用——`@cormijs/preset`、打包器、UI 框架与这个插件（默认配置）——看插件的 fiber 最终处于什么状态：

| 状态 | 结论 |
|---|---|
| active | 支持这个组合 |
| pending，缺少 `react` / `vue` / `vite` / `rsbuild` | 不支持对应的 UI 框架或打包器 |
| failed：`the plugin supports vite, not rsbuild` | 不支持这个打包器 |

```
$ cormi plugin check
            react      vue
vite        ✓          pending: react
rsbuild     ✗ rsbuild  ✗ rsbuild

推断    bundler: [vite]  renderer: [react]
声明    bundler: —       renderer: [react]    不一致：运行 cormi plugin check --write
```

- 每个打包器还会调用一次 `resolveConfig()`，让 `ctx.bundler.plugin()` 中各打包器的工厂函数真正运行，缺少可选 peer 依赖之类的错误也能发现。
- 一个包导出多个插件时（`exports` 中的入口），逐个检查，写回 `cormi.exports`。
- setup 模式不打包，整个矩阵几秒内完成。官方插件在 CI 中运行它；`--write` 写回 `bundler`、`renderer` 与派生的关键词。
- 没有安装的组合跳过并提示：检查只证明“这些组合可以”，不会把没测过的组合写成不支持。

## 索引服务

[cormijs/registry](https://github.com/cormijs/registry) 每天同步一次：抓取 `keywords:cormi-plugin` 的最新版本，用 `conclude()` 规范化，在沙箱中运行 `cormi plugin check` 得出“已验证”，加上下载量，生成 `index.json`。控制台读取它，npm 搜索作为后备。

没有关键词、却能在 Cormi 应用中使用的 cordis 生态的包，由 registry 收录并给出清单（`external: true`），例如 minato 的驱动：`category: database`，需要 `model` 服务，提供 `database`，适用于任何打包器与 UI 框架。它们的清单不是包自己的声明，所以不做检查。

## 官方插件的声明

| 插件 | bundler | renderer |
|---|---|---|
| tailwindcss、mf | vite、rsbuild | — |
| unocss | vite | — |
| styled-components | vite | react |
| legacy | vite | — |
| federation（host、package）、qiankun/slave | vite | react |
| qiankun/master、antd、layout、model、initial-state、request、react-query、dva、valtio、mpa | — | react |
| mock、analytics、export-static、lint | — | — |

只靠 peer 依赖推断时，unocss、styled-components 会被误判为支持任何打包器；`cormi plugin check` 会得出它们只支持 Vite。

## 实施阶段

1. **声明与匹配**（已完成）：`Manifest`、`conclude()`、`forExport()`、`checkCompat()`、`manifestKeywords()` 进入 `@cormijs/core`；官方插件、打包器与 UI 框架的包写上声明；`cormi g plugin` 的模板带上 `cormi` 字段。
2. **控制台**（已完成）：市场的徽章、筛选（默认只看兼容的）、“仍要安装”与查找兼容的版本；插件页与工作区页的声明与不兼容原因；换上打包器或 UI 框架之前列出受影响的插件。registry 默认与包管理器相同（`npm_config_registry`）；e2e 用一个本地的假 registry 检查市场。
3. **`cormi plugin check`**（已完成）：组合来自插件包的开发依赖中提供打包器或 UI 框架的包；栈本身加载失败的组合标为跳过；打包器的支持取自插件注册的 `ctx.bundler.plugin()` 映射的键（否则一个支持 vite 与 rsbuild 的插件在两者都通过时会被误写成“不限”），UI 框架取自 `inject`；浏览器模块（插件注册的入口与 `client`、`console`）不检查——它们与 Node 插件形状相同；必填的配置写在 `cormi.check`。官方插件都以 `@cormijs/preset` 与四个实现为开发依赖，`pnpm check:plugins` 检查全部官方插件。
4. **索引服务**（已完成）：[cormijs/registry](https://github.com/cormijs/registry) 的 GitHub Action 每天运行一次：搜索 npm 上的 `keywords:cormi-plugin`，读取各包最新版的 `cormi` 字段（`conclude()`），在装好四种实现的沙箱中运行 `cormi plugin check --json` 得出“已验证”，取上个月的下载量，把 `index.json` 推到 `dist` 分支，由 jsDelivr 提供。控制台的 `console.market` 默认指向它，读不到时搜索 npm。
