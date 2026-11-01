import { Layout, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from '@cormijs/react/client'

const items = [
  { key: '/', label: 'Dashboard' },
  { key: '/about', label: 'About' },
]

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span style={{ color: '#fff', fontWeight: 600 }}>Cormi × Ant Design</span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1 }}
        />
      </Layout.Header>
      <Layout.Content style={{ padding: 32, maxWidth: 1080, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
