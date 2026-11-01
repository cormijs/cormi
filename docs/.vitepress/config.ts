import { defineConfig } from 'vitepress'

const repo = 'https://github.com/Mahoo12138/cormijs'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Cormi',
  description: '以 Cordis 为插件宿主的 React 全栈框架：一份 cormi.yml，就是整个应用。',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#d7336d' }],
  ],
  markdown: {
    theme: { light: 'vitesse-light', dark: 'vitesse-dark' },
  },
  themeConfig: {
    logo: { src: '/logo.svg', alt: '' },
    siteTitle: 'cormi',
    nav: [
      { text: '指南', link: '/guide/', activeMatch: '^/guide/' },
      { text: '插件开发', link: '/plugin/', activeMatch: '^/plugin/' },
      { text: '官方插件', link: '/plugins/', activeMatch: '^/plugins/' },
      { text: '参考', link: '/reference/umi', activeMatch: '^/(reference/|architecture)' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '介绍', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
          ],
        },
        {
          text: '应用',
          items: [
            { text: 'cormi.yml', link: '/guide/config' },
            { text: '目录与约定', link: '/guide/conventions' },
            { text: '路由与数据', link: '/guide/routing' },
            { text: '服务端：API、代理与 SSR', link: '/guide/server' },
            { text: '构建与部署', link: '/guide/deploy' },
            { text: '命令行', link: '/guide/cli' },
            { text: '控制台与工作区', link: '/guide/console' },
          ],
        },
      ],
      '/plugin/': [
        {
          text: '插件开发',
          items: [
            { text: '插件的结构', link: '/plugin/' },
            { text: 'Node 端服务', link: '/plugin/services' },
            { text: '事件', link: '/plugin/events' },
            { text: '浏览器端', link: '/plugin/client' },
            { text: '扩展控制台', link: '/plugin/console' },
          ],
        },
      ],
      '/plugins/': [
        {
          text: '官方插件',
          items: [
            { text: '总览', link: '/plugins/' },
            { text: '数据与状态', link: '/plugins/data' },
            { text: '界面与样式', link: '/plugins/ui' },
            { text: '构建与开发', link: '/plugins/build' },
            { text: '微前端与联邦', link: '/plugins/micro' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '从 umi 迁移', link: '/reference/umi' },
            { text: '架构说明', link: '/architecture' },
            { text: '设计：可选的打包器与 UI 框架', link: '/reference/pluggable' },
          ],
        },
      ],
      '/architecture': [
        {
          text: '参考',
          items: [
            { text: '从 umi 迁移', link: '/reference/umi' },
            { text: '架构说明', link: '/architecture' },
            { text: '设计：可选的打包器与 UI 框架', link: '/reference/pluggable' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: '在 GitHub 上编辑此页',
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到相关结果',
            resetButtonTitle: '清除查询',
            displayDetails: '显示详情',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    lastUpdated: { text: '最后更新' },
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色',
    darkModeSwitchTitle: '切换到深色',
    sidebarMenuLabel: '目录',
    returnToTopLabel: '回到顶部',
    footer: {
      message: '以 MIT 许可发布 · 基于 Cordis 4、React 19 与 Vite 7',
    },
  },
})
