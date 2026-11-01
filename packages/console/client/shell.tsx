import { NavLink, Outlet, useCordis } from '@cormijs/react/client'
import { useData, useStatus } from './index.tsx'
import { icons } from './icons.tsx'

const STATUS_TEXT = { connecting: '连接中', open: '已连接', closed: '重新连接中' }
const STATUS_LAMP = { connecting: 'pending', open: 'active', closed: 'failed' }

/** The frame of the console: the menu of its pages, and the page. */
export function Shell() {
  const { $router } = useCordis()
  const status = useStatus()
  const overview = useData<{ name: string; url?: string }>('overview')
  const pages = Object.values($router.routes)
    .filter(route => route.parentId === 'console' && route.meta?.name)
    .sort((a, b) => (a.meta!.order ?? 100) - (b.meta!.order ?? 100))

  return (
    <div className="cc-shell">
      <aside className="cc-side">
        <div className="cc-brand">
          <span className="cc-wordmark">cormi</span>
          <span className="cc-brand-label">console</span>
        </div>
        {overview && <div className="cc-app-name" title={overview.name}>{overview.name}</div>}
        <nav className="cc-nav">
          {pages.map(route => (
            <NavLink key={route.id} to={route.path!} end={route.path === '/'} className="cc-nav-item">
              {route.meta!.icon ?? <span className="cc-icon cc-icon-dot" aria-hidden="true" />}
              <span>{route.meta!.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cc-side-foot">
          <a className="cc-nav-item" href={overview?.url ? `${overview.url}/` : '/'} target="_blank" rel="noreferrer">
            {icons.external}
            <span>打开应用</span>
          </a>
          <div className="cc-status" role="status">
            <span className="cc-lamp" data-state={STATUS_LAMP[status]} />
            {STATUS_TEXT[status]}
          </div>
        </div>
      </aside>
      <main className="cc-main">
        <Outlet />
      </main>
    </div>
  )
}
