# 命令行

```
cormi <command> [options]
```

| 命令 | 作用 |
|---|---|
| `cormi dev` | 启动开发服务器：HTTP 服务、Vite 开发中间件、文件监听、[控制台](/guide/console)；`cormi.yml` 与本地插件热重载 |
| `cormi build` | 构建客户端（以及服务端）bundle，然后退出 |
| `cormi preview` | 运行构建产物 |
| `cormi setup` | 只写入 `src/.cormi` 下的生成文件，然后退出 |
| `cormi generate <type> <name>` | 由生成器创建文件，别名 `g` |
| `cormi config [name]` | 列出插件树，或打印匹配插件解析后的配置 |
| `cormi help` | 列出所有命令，包括插件注册的命令 |

| 选项 | 作用 |
|---|---|
| `--port <port>` | dev 与 preview 服务器的端口，优先于 `cormi.yml` |
| `--host <host>` | dev 与 preview 服务器的主机，优先于 `cormi.yml` |
| `-v`、`--version` | 显示版本 |
| `-h`、`--help` | 显示帮助 |

## dev

`cormi dev` 由一个守护进程运行实际的开发进程，与 koishi 的方式相同。`cormi.yml` 的条目与本地插件的源码变化时逐个重载插件，不重启进程；需要整体重启时，守护进程会拉起新的开发进程。

## generate

```sh
cormi g page users/detail     # src/pages/users/detail.tsx 及其 CSS module
cormi g component UserCard    # src/components/UserCard/index.tsx
cormi g api users             # src/api/users.ts
cormi g mock users            # mock/users.ts，需要 @cormi/plugin-mock
cormi g plugin hello          # 工作区插件包 plugins/hello/（--console、--no-client）
```

生成器不会覆盖已存在的文件。运行 `cormi g` 不带参数，会列出当前可用的生成器。

## config

```sh
cormi config
# @cormi/preset-react                  active    xyz123
# @cormi/plugin-antd                   active    abc456
# @cormi/plugin-mock                   disabled  def789

cormi config antd
# # @cormi/plugin-antd (active)
# {
#   "theme": {},
#   "dark": false,
#   "compact": false,
#   "app": true
# }
```

## 插件注册的命令

`dev`、`build`、`preview`、`setup` 之外的命令都由插件注册，执行时以 `setup` 模式加载插件树，然后运行。例如 `@cormi/plugin-lint` 提供了 `cormi lint`：

```sh
cormi lint            # 检查 src、mock、plugin.ts
cormi lint --fix
```

插件注册命令与生成器的方式见 [Node 端服务](/plugin/services#ctx-cli)。
