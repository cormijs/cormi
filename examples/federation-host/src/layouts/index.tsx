import { Link, Outlet, useCordis } from '@cormijs/react/client'
import './index.css'

// the menu lists the routes of every package, from their manifests: their code loads when one is visited
export default function Layout() {
  const { $router } = useCordis()
  const items = Object.values($router.routes).filter(route => route.meta?.name && !route.meta.hideInMenu)
  return (
    <div className="layout">
      <nav id="menu">
        <Link to="/">Home</Link>
        {items.map(route => <Link key={route.id} to={route.path!}>{route.meta!.name}</Link>)}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
