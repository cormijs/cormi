import { Link } from '@cormi/react/client'
import type { PluginInfo, ServiceInfo } from '../../src/builtin.ts'
import { formatTime, useLogs } from '../hooks.ts'
import { useData } from '../index.tsx'
import { Empty, Lamp, Section } from '../ui.tsx'
import type { AppData } from './app.tsx'

export interface OverviewData {
  name: string
  cwd: string
  mode: string
  url?: string
  versions: Record<string, string | undefined>
}

export default function Overview() {
  const overview = useData<OverviewData>('overview')
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const app = useData<AppData>('app')
  const services = useData<ServiceInfo[]>('services') ?? []
  const problems = useLogs().filter(record => record.type === 'error' || record.type === 'warn').slice(-6).reverse()
  const active = plugins.filter(plugin => plugin.state === 'active').length
  const waiting = plugins.filter(plugin => plugin.state === 'pending' || plugin.state === 'failed')

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>{overview?.name ?? '…'}</h1>
        <p>
          {overview?.mode === 'dev' ? '开发服务器运行中' : overview?.mode}
          {overview?.url && <> · <a href={`${overview.url}/`} target="_blank" rel="noreferrer">{overview.url}</a></>}
          {overview && <> · <code>{overview.cwd}</code></>}
        </p>
      </header>

      <div className="cc-stats">
        <Link to="/plugins" className="cc-stat">
          <span className="cc-stat-value">{active}<small>/{plugins.length}</small></span>
          <span className="cc-stat-label">插件已加载</span>
        </Link>
        <Link to="/app" className="cc-stat">
          <span className="cc-stat-value">{app?.routes.length ?? '…'}</span>
          <span className="cc-stat-label">路由</span>
        </Link>
        <Link to="/services" className="cc-stat">
          <span className="cc-stat-value">{services.length}</span>
          <span className="cc-stat-label">服务</span>
        </Link>
        <Link to="/app" className="cc-stat">
          <span className="cc-stat-value">{app?.entries.length ?? '…'}</span>
          <span className="cc-stat-label">浏览器插件</span>
        </Link>
      </div>

      {waiting.length > 0 && (
        <Section title="需要处理的插件">
          <ul className="cc-rows">
            {waiting.map(plugin => (
              <li key={plugin.id}>
                <Lamp state={plugin.state} />
                <Link to={`/plugins?id=${plugin.id}`}><code>{plugin.name}</code></Link>
                <span className="cc-muted">{plugin.state === 'failed' ? '加载失败，查看日志' : `等待服务：${plugin.inject.join('、') || '—'}`}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="最近的警告与错误" aside={<Link to="/logs" className="cc-link">全部日志</Link>}>
        {problems.length
          ? (
              <ul className="cc-log-list">
                {problems.map(record => (
                  <li key={record.sn} className="cc-log" data-type={record.type}>
                    <time>{formatTime(record.ts)}</time>
                    <span className="cc-log-name">{record.name}</span>
                    <pre>{record.text}</pre>
                  </li>
                ))}
              </ul>
            )
          : <Empty>没有警告或错误。</Empty>}
      </Section>

      <Section title="版本">
        <dl className="cc-kv">
          {Object.entries(overview?.versions ?? {}).filter(([, version]) => version).map(([name, version]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd><code>{version}</code></dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  )
}
