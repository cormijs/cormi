import { Link, Outlet } from '@cormijs/react/client'

export default function Layout() {
  return (
    <>
      <nav style={{ display: 'flex', gap: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/login">Sign in</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  )
}
