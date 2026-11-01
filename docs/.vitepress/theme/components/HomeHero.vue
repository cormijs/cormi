<script setup lang="ts">
import { withBase } from 'vitepress'
import CordDiagram from './CordDiagram.vue'
</script>

<template>
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow"><span class="eyebrow-lamp" />以 Cordis 为插件宿主的前端全栈框架</p>
      <h1 class="headline">一份 <span class="file">cormi.yml</span>，<br>就是整个应用。</h1>
      <p class="lede">
        路由、HTML、打包配置、服务端和浏览器运行时，都由插件在 <code>ctx</code> 上注册。修改一个插件的配置，只有它会重载；卸载一个插件，它注册过的一切随之撤回。
      </p>
      <div class="actions">
        <a class="action primary" :href="withBase('/guide/getting-started')">快速开始</a>
        <a class="action" :href="withBase('/guide/')">为什么基于 Cordis</a>
      </div>
    </div>
    <CordDiagram />
    <p class="caption">
      这是 dev 模式下修改 <code>cormi.yml</code> 时发生的事：停用一个条目，loader 写入 <code>disabled: true</code> 并卸载该插件。停用 <code>@cormijs/vite</code> 试试：依赖 <code>ctx.vite</code> 的 React 渲染器与 Tailwind 转入 pending，直到打包器回来——换一个打包器，也只是换掉这一行。
    </p>
  </section>
</template>

<style scoped>
.hero {
  max-width: 1152px;
  margin: 0 auto;
  padding: 72px 24px 24px;
}

.hero-text {
  max-width: 760px;
  margin-bottom: 48px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 22px;
  color: var(--c-ink-2);
  font-size: 14px;
}

.eyebrow-lamp {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-leaf);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-leaf) 18%, transparent);
}

.headline {
  margin: 0;
  font-size: clamp(40px, 6.4vw, 76px);
  font-weight: 750;
  line-height: 1.12;
  letter-spacing: -0.015em;
  color: var(--c-ink);
}

.file {
  color: var(--c-cord-text);
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variation-settings: 'MONO' 1, 'CASL' 1;
}

.lede {
  max-width: 620px;
  margin: 26px 0 0;
  color: var(--c-ink-2);
  font-size: 17px;
  line-height: 1.8;
}

.lede code,
.caption code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--c-ink);
  font-size: 0.9em;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 30px;
}

.action {
  display: inline-flex;
  align-items: center;
  height: 42px;
  padding: 0 20px;
  border: 1px solid var(--c-rule);
  border-radius: 21px;
  color: var(--c-ink);
  font-size: 15px;
  font-weight: 600;
  transition: border-color 0.15s, background 0.15s;
}

.action:hover {
  border-color: var(--c-ink-3);
}

.action.primary {
  border-color: var(--vp-button-brand-bg);
  background: var(--vp-button-brand-bg);
  color: #fff;
}

.action.primary:hover {
  background: var(--vp-button-brand-hover-bg);
}

.caption {
  max-width: 760px;
  margin: 16px 2px 0;
  color: var(--c-ink-3);
  font-size: 13.5px;
  line-height: 1.7;
}

@media (max-width: 640px) {
  .hero {
    padding-top: 40px;
  }

  .hero-text {
    margin-bottom: 32px;
  }

  .lede {
    font-size: 16px;
  }
}
</style>
