---
layout: page
title: Cormi
titleTemplate: 以 Cordis 为插件宿主的前端全栈框架
---

<div class="cm-home">

<HomeHero />

<section class="cm-section">
<header class="cm-head">
<h2>写插件，就是写注册</h2>
<p>声明依赖，在 <code>ctx</code> 上注册，清理交给 cordis。应用自己的代码和官方插件用的是同一套写法。</p>
</header>
<div class="cm-annotated">
<div class="cm-code vp-doc">
<div class="cm-filename"><code>plugin.ts</code><span>Node 端，写进 cormi.yml：<code>- name: ./plugin.ts</code></span></div>

```ts
import { type Context, Schema } from '@cormijs/cormi'

export const name = 'generator-meta'
export const inject = ['html'] // [!code highlight]

export const Config = Schema.object({ // [!code highlight]
  generator: Schema.string().default('cormi'),
})

export function apply(ctx: Context, config: { generator: string }) {
  ctx.html.head({ // [!code highlight]
    tag: 'meta',
    attrs: { name: 'generator', content: config.generator },
  })
}
```

<div class="cm-filename"><code>src/app.tsx</code><span>浏览器端，按约定自动挂载</span></div>

```tsx
import type { Context } from '@cormijs/react/client'
import { StrictMode } from 'react'

export default (ctx: Context) => {
  ctx.on('router/change', (location) => { // [!code highlight]
    document.title = `Cormi · ${location.pathname}`
  })
  ctx.wrap(({ children }) => <StrictMode>{children}</StrictMode>) // [!code highlight]
}
```

</div>
<dl class="cm-notes">
<dt><code>inject</code></dt>
<dd>依赖靠声明。<code>ctx.html</code> 就绪之前插件不会加载，加载顺序由依赖决定，不分阶段。</dd>
<dt><code>Config</code></dt>
<dd><code>cormi.yml</code> 中的配置先经 Schema 校验、填充默认值。改动配置只会重载这一个插件。</dd>
<dt><code>ctx.html.head()</code></dt>
<dd>每次注册都是调用方插件的一个 effect。插件卸载时，这个 meta 标签随之移除，不用写清理代码。</dd>
<dt><code>ctx.on()</code> · <code>ctx.wrap()</code></dt>
<dd>浏览器端同样是 cordis Context：事件监听和根组件包装器也会随插件一起卸载。</dd>
</dl>
</div>
</section>

<div class="cm-section">
<HomeSides />
</div>

<div class="cm-section">
<HomeCatalog />
</div>

<section class="cm-section">
<header class="cm-head">
<h2>来自 umi？</h2>
<p>能力基本对得上，形态不同：umi 的插件 API 在 Cormi 里是服务上的注册方法和类型化事件。</p>
</header>
<div class="cm-table vp-doc">

| umi | Cormi |
|---|---|
| `api.addHTMLMetas` / `addHTMLScripts` | `ctx.html.head(tag)` / `ctx.html.body(tag)` |
| `api.addRuntimePlugin` | `ctx.app.entry(module, config)`，浏览器端用 `ctx.wrap()` 与事件 |
| `api.modifyRoutes` / `addLayouts` | `ctx.router.patch(fn)` / `ctx.router.layout(file)` |
| `api.modifyViteConfig` | `ctx.vite.configure(fn)` / `ctx.vite.plugin(plugin)` |
| `api.onBuildComplete` | `ctx.on('build/after', fn)` |
| `api.restartServer()` | 不需要：注册一变化，产物就重新计算 |

<p class="cm-more"><a href="/cormi/reference/umi">完整对照与覆盖情况</a></p>

</div>
</section>

<section class="cm-section cm-start">
<header class="cm-head">
<h2>跑起来</h2>
<p>Cormi 还在 0.x，尚未发布到 npm。现在体验它，最快的方式是运行仓库里的示例。</p>
</header>
<ol class="cm-steps">
<li>
<h3>克隆并构建</h3>
<div class="vp-doc">

```sh
git clone https://github.com/cormijs/cormi.git
cd cormi && pnpm install && pnpm build
```

</div>
</li>
<li>
<h3>启动一个示例</h3>
<div class="vp-doc">

```sh
cd examples/basic
pnpm dev
```

</div>
</li>
<li>
<h3>改一行配置</h3>
<p>dev server 运行时，把 <code>cormi.yml</code> 里 <code>./plugin.ts</code> 的 <code>generator</code> 改成别的值。日志里只有这个插件重载，页面的 meta 标签随之更新。</p>
</li>
</ol>
<p class="cm-more"><a href="/cormi/guide/getting-started">阅读快速开始</a></p>
</section>

</div>
