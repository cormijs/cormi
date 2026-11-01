import { useModel } from '@cormijs/plugin-model/client'
import { NavLink, Outlet } from '@cormijs/react/client'

export default function Layout() {
  // a selector: the layout only re-renders when the number of open todos changes
  const open = useModel('todos', model => model.todos.filter(todo => !todo.done).length)
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ display: 'flex', gap: 20, padding: '16px 0', borderBottom: '1px solid #eee' }}>
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/counter">Counter</NavLink>
        <NavLink to="/todos">Todos <span id="open">({open})</span></NavLink>
      </nav>
      <main style={{ padding: '24px 0' }}>
        <Outlet />
      </main>
    </div>
  )
}
