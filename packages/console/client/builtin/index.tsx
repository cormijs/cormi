import type { Context } from '@cormi/client'
import type { LogRecord } from '../../src/builtin.ts'
import { logs } from '../hooks.ts'
import { icons } from '../icons.tsx'
import AppPage from './app.tsx'
import LogsPage from './logs.tsx'
import MarketPage from './market.tsx'
import Overview from './overview.tsx'
import PluginsPage from './plugins.tsx'
import ServicesPage from './services.tsx'
import WorkspacePage from './workspace.tsx'

/** The built-in pages of the console. */
export default (ctx: Context) => {
  ctx.$console.page({ path: '/', name: '概览', icon: icons.overview, order: 0, component: Overview })
  ctx.$console.page({ path: '/plugins', name: '插件', icon: icons.plugins, order: 10, component: PluginsPage })
  ctx.$console.page({ path: '/app', name: '应用', icon: icons.app, order: 20, component: AppPage })
  ctx.$console.page({ path: '/services', name: '服务', icon: icons.services, order: 30, component: ServicesPage })
  ctx.$console.page({ path: '/logs', name: '日志', icon: icons.logs, order: 40, component: LogsPage })
  ctx.$console.page({ path: '/workspace', name: '工作区', icon: icons.workspace, order: 50, component: WorkspacePage })
  ctx.$console.page({ path: '/market', name: '市场', icon: icons.market, order: 60, component: MarketPage })

  // the logs the server sends on connection replace the store; later ones are appended
  ctx.effect(() => ctx.$console.subscribe('logs', () => logs.reset(ctx.$console.get<LogRecord[]>('logs') ?? [])))
  ctx.$console.listen<LogRecord>('logs/append', record => logs.append(record))
}
