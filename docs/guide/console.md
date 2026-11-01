# 控制台与工作区

`cormi dev` 运行时，应用的开发服务器在 `/__cormi/` 提供一个控制台。它本身就是一个 Cormi 应用：运行在浏览器端的 cordis Context 里，页面是浏览器插件，数据通过 WebSocket 从开发进程推送过来。

控制台自带 Vite 与 React，挂在应用的 HTTP 服务上，与应用的打包器和 UI 框架无关：Rsbuild 应用、Vue 应用里的控制台与 Vite + React 应用里的完全相同。

```
dev server :8000
├─ /             应用
├─ /api/*        应用的 API
└─ /__cormi/     控制台
```

控制台只在 dev 模式下挂载，构建产物和 `cormi preview` 中都没有它。不需要时，在 preset 配置中关闭：

```yaml
- name: '@cormijs/preset'
  config:
    console: false
```

## 页面

| 页面 | 内容 |
|---|---|
| 概览 | 应用名称、开发服务器地址、打包器与 UI 框架、已加载的插件、路由与服务的数量，最近的警告与错误，各依赖的版本 |
| 插件 | `cormi.yml` 中的插件与它们的状态。启用、停用、移除、添加插件，用表单编辑配置；查看每个插件在 ctx 上注册了什么、依赖和提供了哪些服务 |
| 应用 | 路由表、浏览器插件、全局导入、生成文件，以及打包器解析出的插件。点击文件在编辑器中打开 |
| 服务 | ctx 上的服务、提供者与依赖它的插件 |
| 日志 | 开发进程的实时日志，可按级别和内容筛选 |
| 工作区 | `plugins/` 下的插件包；新建插件，添加到 `cormi.yml` |
| 市场 | 搜索 npm 上的 Cormi 插件，标出它们是否适用于当前应用，用应用的包管理器安装 |

### 插件

控制台对插件的修改都写回 `cormi.yml`，效果与手动编辑文件相同：只有被修改的插件会重载。

- 配置表单由插件的 `Config`（Schema）生成：字符串、数字、开关、选项、列表、键值对与嵌套对象各有对应的控件，其他结构以 JSON 编辑。`cormi.yml` 中用 `!!js` 写成的表达式只显示、不编辑，保存时原样保留。
- “注册”列出插件及其子插件在 ctx 上注册的东西，例如 `ctx.app.entry("…")`、`ctx.bundler.plugin()`。停用插件，这些注册会一起撤回。
- 停用 `@cormijs/preset`（或 `@cormijs/preset-react`）会卸载应用的服务，控制台也随之断开；控制台会提示确认。

### 市场

市场列出带有 `cormi-plugin` 关键字的 npm 包，数据来自 [Cormi registry](https://github.com/cormijs/registry)：它每天从 npm 同步一次，读取插件的兼容性声明，用 `cormi plugin check` 检查它们，并记下下载量——检查过且声明一致的插件标为“已验证”，Cormi 项目发布的标为“官方”。索引无法访问时（或 preset 的 `console.market` 为空），市场直接搜索 npm。安装使用应用自己的包管理器（根据 lock 文件判断 pnpm、yarn、bun 或 npm），输出写入日志；安装后即可添加到 `cormi.yml`。registry 默认与包管理器相同（`npm_config_registry`，例如 `.npmrc` 中配置的镜像），也可以在 preset 的 `console.registry` 中指定。

每个插件旁边标出它支持的打包器与 UI 框架（`Vite · Rsbuild`、`React`；`通用` 表示不限），来自插件的 [兼容性声明](/plugin/#声明兼容性)：

- 与当前应用不兼容的插件默认隐藏，显示时置灰并写明原因，例如“只支持 Vue，当前应用的 UI 框架是 React”。仍然可以安装，按钮会先说明后果：插件会停在等待依赖，或者加载失败。
- “查找兼容的版本”读取插件的各个版本；旧版兼容时，可以直接安装那个版本。
- 没有声明的插件标为“未声明兼容性”；从 peer 依赖推断出的，标签带虚线边框。
- 打包器或 UI 框架本身（例如 `@cormijs/rsbuild`）旁边说明换上它会怎样：当前由哪个插件提供、需要先停用，以及哪些已启用的插件不支持它。插件页中停用的这类插件也有同样的说明。

插件页与工作区页同样标出每个插件的声明；不兼容的插件，等待依赖的原因会写成“只支持 React，当前应用的 UI 框架是 Vue”。

## 工作区

一个应用可以在 `plugins/` 下开发自己的插件包，和 koishi 模板项目的工作区一样：

```
my-app/
├─ cormi.yml
├─ plugins/
│  └─ hello/
│     ├─ package.json      { "name": "cormi-plugin-hello", ... }
│     ├─ src/index.ts      Node 端
│     ├─ client/index.tsx  浏览器端
│     └─ console/index.tsx 控制台页面
└─ src/
```

工作区里的包按包名加载，直接运行源码，不需要构建，也不需要用包管理器安装：

```yaml
- name: cormi-plugin-hello
  config:
    greeting: Hi
```

- **Node 端**：Cormi 在加载插件树之前注册一个模块解析钩子，把工作区包名解析到它的源码（`exports` 中的 `source` 条件优先）。dev 模式下修改源码，只有这个插件会重载。
- **浏览器端**：`ctx.app.entry('cormi-plugin-hello/client')` 由应用的打包器解析到 `plugins/hello/client/index.tsx`，修改后热更新；控制台页面 `cormi-plugin-hello/console` 由控制台的 Vite 同样解析。
- **类型**：生成的 `src/.cormi/tsconfig.json` 为工作区包加上 `paths`，应用中导入它们时类型完整。
- 工作区包自己用到的依赖安装在应用里即可，解析会沿目录向上找到它们。

新建一个插件包：

```sh
cormi g plugin hello              # Node 端与浏览器端
cormi g plugin hello --console    # 再加一个控制台页面
cormi g plugin hello --no-client  # 只有 Node 端
```

也可以在控制台的“工作区”页面新建，并直接添加到 `cormi.yml`。dev 模式下，新增或删除 `plugins/*/package.json` 会立即生效。

工作区包就是普通的 npm 包：它的 `package.json` 已经写好 `exports`（`source` 指向源码，`default` 指向构建产物 `lib/`），准备发布时编译 `src/` 到 `lib/` 即可。
