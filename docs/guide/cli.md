# 命令行

```
cormi <command> [options]
```

| 命令 | 作用 |
|---|---|
| `cormi dev` | 启动开发服务器：HTTP 服务、打包器的开发中间件、服务端代码、文件监听、[控制台](/guide/console)；`cormi.yml`、本地插件与 `server/` 热重载 |
| `cormi build` | 构建页面的 bundle（客户端，以及服务端入口），然后退出；没有页面的后端无需构建 |
| `cormi start` | 在生产环境运行应用：构建好的页面与服务端代码 |
| `cormi preview` | 与 `start` 相同，用于在本地试用构建产物 |
| `cormi setup` | 只写入 `src/.cormi` 下的生成文件，然后退出 |
| `cormi generate <type> <name>` | 由生成器创建文件，别名 `g` |
| `cormi config [name]` | 列出插件树，或打印匹配插件解析后的配置 |
| `cormi plugin check [--write] [--json]` | 在插件包中运行：用每个打包器与 UI 框架加载插件，推断它支持什么，与 package.json 的声明比较（见 [声明兼容性](/plugin/#声明兼容性)） |
| `cormi help` | 列出所有命令，包括插件注册的命令 |

| 选项 | 作用 |
|---|---|
| `--config <file>` | 用另一份插件树代替 `cormi.yml` |
| `--port <port>` | dev、start 与 preview 服务器的端口，优先于 `cormi.yml` |
| `--host <host>` | dev、start 与 preview 服务器的主机，优先于 `cormi.yml` |
| `-v`、`--version` | 显示版本 |
| `-h`、`--help` | 显示帮助 |

## dev

`cormi dev` 由一个守护进程运行实际的开发进程，与 koishi 的方式相同。`cormi.yml` 的条目与本地插件的源码变化时逐个重载插件，不重启进程；`server/` 中的文件变化时，服务端代码整体重新加载；需要整体重启时，守护进程会拉起新的开发进程。

## build 与 start

`cormi build` 只构建页面，不运行服务端代码，也不连接数据库，所以可以在没有数据库的环境中构建。`cormi start` 运行服务端代码与构建好的页面；服务端代码直接运行源码，不需要构建。见 [构建与部署](/guide/deploy)。

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

`dev`、`build`、`start`、`preview`、`setup` 之外的命令都由插件注册，执行时以 `setup` 模式加载插件树，然后运行。例如 `@cormijs/plugin-lint` 提供了 `cormi lint`：

```sh
cormi lint            # 检查 src、mock、plugin.ts
cormi lint --fix
```

插件注册命令与生成器的方式见 [Node 端服务](/plugin/services#ctx-cli)。
