import { NavLink, Outlet } from '@cormijs/react/client'

const link = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex gap-6 border-b border-gray-200 bg-white px-6 py-3 text-sm font-medium">
        <NavLink to="/" end className={link}>Home</NavLink>
        <NavLink to="/about" className={link}>About</NavLink>
      </nav>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  )
}
