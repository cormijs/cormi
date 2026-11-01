import { useInQiankun } from '@cormijs/plugin-qiankun/slave/client'
import { NavLink, Outlet } from '@cormijs/react/client'

export default function Layout() {
  const inQiankun = useInQiankun()
  return (
    <section id="slave" style={{ border: '2px dashed #a855f7', borderRadius: 8, padding: 16 }}>
      <nav style={{ display: 'flex', gap: 16 }}>
        <strong>micro app</strong>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/about">About</NavLink>
        <span id="where" style={{ marginLeft: 'auto', color: '#7e22ce' }}>{inQiankun ? 'inside the master' : 'by itself'}</span>
      </nav>
      <Outlet />
    </section>
  )
}
