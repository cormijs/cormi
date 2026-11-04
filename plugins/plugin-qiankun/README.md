# @cormijs/plugin-qiankun

[![npm](https://img.shields.io/npm/v/@cormijs/plugin-qiankun/next?style=flat-square)](https://www.npmjs.com/package/@cormijs/plugin-qiankun)

qiankun micro frontends for Cormi apps: the master (MicroApp) and Vite-built micro apps

```sh
pnpm add @cormijs/plugin-qiankun
```

```yaml
# cormi.yml：这个包含有 `master`、`slave` 几个插件
- name: '@cormijs/plugin-qiankun/master'
- name: '@cormijs/plugin-qiankun/slave'
```

支持的打包器：不限；支持的 UI 框架：React。其中 `@cormijs/plugin-qiankun/slave`：Vite。

这是 [Cormi](https://github.com/cormijs/cormi) 的一部分：以 Cordis 为插件宿主的全栈框架。文档见 [docs](https://github.com/cormijs/cormi/tree/main/docs)。
