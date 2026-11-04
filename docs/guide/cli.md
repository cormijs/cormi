# 命令行

```
cormi <command> [options]
```

| 命令 | 作用 |
|---|---|
| `cormi dev` | 启动开发服务器：HTTP 服务、打包器的开发中间件、服务端代码、文件监听、[控制台](/guide/console)；`cormi.yml`、本地插件与 `server/` 热重载 |
| `cormi build` | 构建页面的 bundle（客户端，以及服务端入口），并把应用自己的 Node 代码编译到 `dist/node`，然后退出 |
| `cormi start` | 在生产环境运行构建产物，别名 `preview` |
| `cormi setup` | 只写入 `src/.cormi` 下的生成文件，然后退出 |
| `cormi generate <type> <name>` | 由生成器创建文件，别名 `g` |
| `cormi config [name]` | 列出插件树，或打印匹配插件解析后的配置 |
| `cormi plugin check [--write] [--json]` | 在插件包中运行：用每个打包器与 UI 框架加载插件，推断它支持什么，与 package.json 的声明比较（见 [声明兼容性](/plugin/#声明兼容性)） |
| `cormi help` | 列出所有命令，包括插件注册的命令 |

| 选项 | 作用 |
|---|---|
| `--config <file>` | 用另一份插件树代替 `cormi.yml` |
| `--port <port>` | dev 与 start 服务器的端口，优先于 `cormi.yml` |
| `--host <host>` | dev 与 start 服务器的主机，优先于 `cormi.yml` |
| `-v`、`--version` | 显示版本 |
| `-h`、`--help` | 显示帮助 |

## dev

`cormi dev` 由一个守护进程运行实际的开发进程，与 koishi 的方式相同。`cormi.yml` 的条目与本地插件的源码变化时逐个重载插件，不重启进程；`server/` 中的文件变化时，服务端代码整体重新加载；需要整体重启时，守护进程会拉起新的开发进程。

## build 与 start

`cormi dev` 运行源码；生产环境运行编译后的代码：

- `cormi build` 构建页面，并编译应用自己的 Node 代码——`server/`、`cormi.yml` 中的本地插件（`./plugin.ts`）与工作区插件包——到 `dist/node`。它不运行这些代码，也不连接数据库，所以可以在没有数据库的环境中构建。
- `cormi start` 以 `start` 模式（`NODE_ENV=production`）运行构建产物：插件树加载 `dist/node` 中编译后的模块，而不是源码；不需要 TypeScript，也不需要部署源码。端口被占用时直接报错，而不是顺延。

见 [构建与部署](/guide/deploy)。

## generate

```sh
cormi g page users/detail     # src/pages/users/detail.tsx 及其 CSS module
cormi g component UserCard    # src/components/UserCard/index.tsx
cormi g api users             # server/api/users.ts
cormi g model todo            # server/models/todo.ts，需要 @cormijs/database
cormi g mock users            # mock/users.ts，需要 @cormijs/plugin-mock
cormi g plugin hello          # 工作区插件包 plugins/hello/（--console、--no-client）
```

生成器不会覆盖已存在的文件。运行 `cormi g` 不带参数，会列出当前可用的生成器。

## config

```sh
cormi config
# @cormijs/preset-react                  active    xyz123
# @cormijs/plugin-antd                   active    abc456
# @cormijs/plugin-mock                   disabled  def789

cormi config antd
# # @cormijs/plugin-antd (active)
# {
#   "theme": {},
#   "dark": false,
#   "compact": false,
#   "app": true
# }
```

## 插件注册的命令

`dev`、`build`、`start`、`setup` 之外的命令都由插件注册，执行时以 `setup` 模式加载插件树，然后运行。例如 `@cormijs/plugin-lint` 提供了 `cormi lint`：

```sh
cormi lint            # 检查 src、mock、plugin.ts
cormi lint --fix
```

插件注册命令与生成器的方式见 [Node 端服务](/plugin/services#ctx-cli)。
