import icons from '@@/plugin-layout/icons'
import { Breadcrumb, Layout as AntdLayout, Menu, type MenuProps } from 'antd'
import { type Context, Link, Outlet, useCordis, useMatches } from 'cormi/client'
import { type ComponentType, createContext, createElement, useContext, useMemo, useState } from 'react'
import type { ClientConfig } from '../src/types.ts'
import { getBreadcrumb, getMenuItems, type MenuItem } from './menu.ts'

export { getBreadcrumb, getMenuItems, type MenuItem } from './menu.ts'

const ConfigContext = createContext<ClientConfig | null>(null)

export default (ctx: Context, config: ClientConfig) => {
  ctx.wrap(({ children }) => <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>)
}

function renderIcon(name?: string) {
  const icon = name && (icons as Record<string, ComponentType>)[name]
  return icon ? createElement(icon) : undefined
}

function toAntdItems(items: MenuItem[]): MenuProps['items'] {
  return items.map(item => item.children.length
    ? { key: item.key, icon: renderIcon(item.icon), label: item.name, children: toAntdItems(item.children) }
    : { key: item.key, icon: renderIcon(item.icon), label: <Link to={item.path}>{item.name}</Link> })
}

function flatten(items: MenuItem[]): MenuItem[] {
  return items.flatMap(item => [item, ...flatten(item.children)])
}

/** The layout route of the plugin: the menu, the breadcrumb and the page. */
export function Layout() {
  const config = useContext(ConfigContext)
  if (!config) throw new Error('<Layout> needs @cormi/plugin-layout in cormi.yml')
  const { $router } = useCordis()
  const matches = useMatches()
  const [collapsed, setCollapsed] = useState(false)
  const items = useMemo(() => getMenuItems($router.routes), [$router])
  const byKey = useMemo(() => new Map(flatten(items).map(item => [item.key, item])), [items])
  const matched = matches.map(match => byKey.get(match.id)).filter(Boolean) as MenuItem[]
  const keys = matched.map(item => item.key)
  const breadcrumb = getBreadcrumb($router.routes, matches.map(match => match.id))
  const dark = config.theme === 'dark'

  const menu = (
    <Menu
      theme={config.theme}
      mode={config.layout === 'top' ? 'horizontal' : 'inline'}
      items={toAntdItems(items)}
      selectedKeys={keys.slice(-1)}
      defaultOpenKeys={keys}
      style={config.layout === 'top' ? { flex: 1, minWidth: 0 } : undefined}
    />
  )
  const title = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: config.layout === 'top' ? 0 : 16, color: dark ? '#fff' : 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {config.logo && <img src={config.logo} alt="" height={28} />}
      {!collapsed && config.title}
    </div>
  )
  const content = (
    <AntdLayout.Content style={{ padding: 24 }}>
      {config.breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb style={{ marginBottom: 16 }} items={breadcrumb.map(item => ({ key: item.key, title: item.name }))} />
      )}
      <Outlet />
    </AntdLayout.Content>
  )
  const footer = config.footer && <AntdLayout.Footer style={{ textAlign: 'center' }}>{config.footer}</AntdLayout.Footer>

  if (config.layout === 'top') {
    return (
      <AntdLayout style={{ minHeight: '100vh' }}>
        <AntdLayout.Header style={{ display: 'flex', alignItems: 'center', gap: 24, background: dark ? undefined : '#fff' }}>
          {title}
          {menu}
        </AntdLayout.Header>
        {content}
        {footer}
      </AntdLayout>
    )
  }
  return (
    <AntdLayout style={{ minHeight: '100vh' }}>
      <AntdLayout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme={config.theme}>
        {title}
        {menu}
      </AntdLayout.Sider>
      <AntdLayout>
        {content}
        {footer}
      </AntdLayout>
    </AntdLayout>
  )
}
