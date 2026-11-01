import { NavLink, Outlet } from '@cormijs/react/client'

export default function Layout() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <strong>master</strong>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/app1">App 1</NavLink>
        <NavLink to="/app1/about">App 1 · About</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
