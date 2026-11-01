# @cormijs/plugin-federation

[![npm](https://img.shields.io/npm/v/@cormijs/plugin-federation/next?style=flat-square)](https://www.npmjs.com/package/@cormijs/plugin-federation)

Federated apps for Cormi: packages built and deployed apart, linked by URL into one app with shared singletons

```sh
pnpm add @cormijs/plugin-federation
```

```yaml
# cormi.yml：这个包含有 `host`、`package` 几个插件
- name: '@cormijs/plugin-federation/host'
- name: '@cormijs/plugin-federation/package'
```

支持的打包器：Vite；支持的 UI 框架：React。

这是 [Cormi](https://github.com/cormijs/cormi) 的一部分：以 Cordis 为插件宿主的前端全栈框架。文档见 [docs](https://github.com/cormijs/cormi/tree/main/docs)。
