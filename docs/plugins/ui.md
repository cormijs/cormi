# 界面与样式

## antd

Ant Design：`ConfigProvider` 的主题与语言、antd 的 `<App>`，服务端渲染时抽取样式写进文档。

```yaml
- name: '@cormi/plugin-antd'
  config:
    locale: zh_CN
    theme:
      token:
        colorPrimary: '#d7336d'
        borderRadius: 8
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `theme` | `{}` | `ConfigProvider` 的主题（design token） |
| `dark` | `false` | 使用暗色算法 |
| `compact` | `false` | 使用紧凑算法 |
| `locale` | — | `antd/locale` 中的语言，如 `zh_CN`，只打包用到的那一个 |
| `app` | `true` | 用 antd 的 `<App>` 包裹应用，`App.useApp()` 可用 |

应用需要依赖 `antd` 与 `@ant-design/cssinjs`：服务端渲染时，样式由应用自己解析到的 cssinjs 收集。缺少后者时插件会给出警告，服务端渲染的页面将不含 antd 的样式。

## layout

基于 antd 的应用布局：由路由生成侧边或顶部菜单与面包屑。

```yaml
- name: '@cormi/plugin-antd'
- name: '@cormi/plugin-layout'
  config:
    title: Cormi Admin
    logo: /logo.svg
    footer: Built with Cormi
- name: '@cormi/preset-react'
  config:
    routes:
      - path: /
        component: index
        name: 仪表盘
        icon: DashboardOutlined
      - path: /users
        name: 用户
        icon: TeamOutlined
        routes:
          - path: /users
            component: users/index
            name: 列表
          - path: /users/:id
            component: users/detail
            name: 详情
            hideInMenu: true
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `title` | — | 标题 |
| `logo` | — | logo 的 URL |
| `layout` | `side` | `side` 或 `top` |
| `theme` | `dark` | 菜单主题，`dark` 或 `light` |
| `breadcrumb` | `true` | 显示面包屑 |
| `footer` | — | 页脚文字 |

菜单来自路由的 `meta`：`name` 是菜单项文字，`icon` 是 `@ant-design/icons` 的图标名（只打包用到的图标），`hideInMenu` 把路由从菜单中隐藏。设置 `layout: false` 的路由不使用这个布局，例如登录页。

`@cormi/plugin-layout/client` 导出 `Layout` 组件与 `getMenuItems()`、`getBreadcrumb()`，可以自己组合布局。

## tailwindcss

Tailwind CSS v4，通过它的 Vite 插件处理。

```yaml
- name: '@cormi/plugin-tailwindcss'
```

不配置时，插件生成一个样式表并在应用启动前导入：它导入 tailwindcss（从插件自身解析，应用不必安装），并扫描 `src/` 中用到的类名。需要主题等配置时，写自己的样式表（此时应用需要依赖 `tailwindcss`）：

::: code-group

```css [src/tailwind.css]
@import "tailwindcss";

@theme {
  --color-cord: #d7336d;
}
```

:::

```yaml
- name: '@cormi/plugin-tailwindcss'
  config:
    css: src/tailwind.css
```

| 配置 | 说明 |
|---|---|
| `css` | 自己的样式表，相对于应用根目录 |

## unocss

UnoCSS。应用有 `uno.config.*` 时使用它；没有时使用预设。

```yaml
- name: '@cormi/plugin-unocss'
  config:
    preset: wind4
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `preset` | `wind4` | 没有 `uno.config.*` 时的预设：`wind4`、`wind3` 或 `mini` |

## styled-components

`ThemeProvider` 与服务端渲染的样式抽取。

```yaml
- name: '@cormi/plugin-styled-components'
  config:
    theme:
      primary: '#d7336d'
```

```tsx
import styled from 'styled-components'

const Button = styled.button`
  background: ${props => props.theme.primary};
`
```

| 配置 | 默认值 | 说明 |
|---|---|---|
| `theme` | `{}` | `ThemeProvider` 的主题 |

应用需要依赖 `styled-components`。
