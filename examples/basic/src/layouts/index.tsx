import { Link, Outlet, useCordis } from 'cormi/client'
import './index.css'

export default function Layout() {
  const ctx = useCordis()
  return (
    <div className="layout">
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about" prefetch="intent">About</Link>
        <Link to="/users">Users</Link>
        <span className="count">{Object.keys(ctx.$router.routes).length} routes</span>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
