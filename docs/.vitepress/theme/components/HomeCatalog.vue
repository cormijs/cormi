<script setup lang="ts">
import { withBase } from 'vitepress'

const groups = [
  {
    title: '数据与状态',
    link: '/plugins/data',
    plugins: [
      ['model', 'src/models 中的 hook 即全局模型，useModel()'],
      ['initial-state', '运行时插件提供初始状态，useInitialState()'],
      ['request', '基于 fetch 的 request() 与 useRequest()'],
      ['react-query', '每个应用一个 QueryClient'],
      ['dva', 'dva-core 与 dva-loading，可选 immer'],
      ['valtio', 'defineStore()，dev 下接入 DevTools'],
    ],
  },
  {
    title: '界面与样式',
    link: '/plugins/ui',
    plugins: [
      ['antd', '主题、语言，服务端渲染时抽取样式'],
      ['layout', '由路由生成菜单和面包屑的布局'],
      ['tailwindcss', 'Tailwind CSS v4'],
      ['unocss', 'UnoCSS，没有配置文件时用预设'],
      ['styled-components', 'ThemeProvider 与 SSR 样式'],
    ],
  },
  {
    title: '构建与开发',
    link: '/plugins/build',
    plugins: [
      ['mock', 'mock/** 中的接口，优先于真实 API'],
      ['export-static', '构建后把路由预渲染为 HTML'],
      ['legacy', '为不支持模块脚本的浏览器构建'],
      ['mpa', '多页应用，每页一个 HTML'],
      ['analytics', 'GA4 与百度统计，导航自动上报'],
      ['lint', 'cormi lint，自带默认规则'],
    ],
  },
  {
    title: '微前端与联邦',
    link: '/plugins/micro',
    plugins: [
      ['federation', '子包单独部署，底座按 URL 汇集成一个应用'],
      ['mf', '模块联邦，基于 @module-federation/vite'],
      ['qiankun', 'qiankun 主应用与 Vite 构建的子应用'],
    ],
  },
]
</script>

<template>
  <section class="catalog">
    <header class="head">
      <h2>官方插件</h2>
      <p>每个都是普通的 cordis 插件：写进 <code>cormi.yml</code> 就启用，删掉或标记 <code>disabled</code> 就卸载。</p>
    </header>
    <div class="groups">
      <div v-for="group in groups" :key="group.title" class="group">
        <a class="group-title" :href="withBase(group.link)">{{ group.title }}<span aria-hidden="true"> →</span></a>
        <ul>
          <li v-for="[name, text] in group.plugins" :key="name">
            <code>plugin-{{ name }}</code>
            <span>{{ text }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.catalog {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px;
}

.head {
  max-width: 680px;
  margin-bottom: 28px;
}

.head h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 750;
  letter-spacing: -0.01em;
}

.head p {
  margin: 12px 0 0;
  color: var(--c-ink-2);
  font-size: 16px;
  line-height: 1.8;
}

.head code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  font-size: 0.9em;
}

.groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 40px 48px;
}

.group-title {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--c-ink);
  font-size: 15px;
  font-weight: 700;
}

.group-title span {
  color: var(--c-cord);
  transition: margin 0.15s;
}

.group-title:hover span {
  margin-left: 4px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--c-rule);
}

li {
  display: grid;
  grid-template-columns: 172px minmax(0, 1fr);
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--c-rule);
  font-size: 14px;
  line-height: 1.6;
}

li code {
  color: var(--c-ink);
  font-size: 13px;
}

li span {
  color: var(--c-ink-2);
}

@media (max-width: 860px) {
  .groups {
    grid-template-columns: minmax(0, 1fr);
  }

  li {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
}
</style>
