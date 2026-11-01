import { Link } from '@cormi/react/client'
import type { PluginInfo, ServiceInfo } from '../../src/builtin.ts'
import { useData } from '../index.tsx'
import { Empty, Tag } from '../ui.tsx'

export default function ServicesPage() {
  const services = useData<ServiceInfo[]>('services')
  const plugins = useData<PluginInfo[]>('plugins') ?? []
  const idOf = (name: string) => plugins.find(plugin => plugin.name === name)?.id

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>服务</h1>
        <p>ctx 上的服务，谁提供了它，又有哪些插件依赖它。提供者卸载时，依赖它的插件会转入 pending。</p>
      </header>
      {services
        ? (
            <table className="cc-table">
              <thead>
                <tr><th>服务</th><th>提供者</th><th>依赖它的插件</th></tr>
              </thead>
              <tbody>
                {services.map(service => (
                  <tr key={service.name}>
                    <td><code>ctx.{service.name}</code></td>
                    <td>
                      {idOf(service.provider)
                        ? <Link to={`/plugins?id=${idOf(service.provider)}`}><code>{service.provider}</code></Link>
                        : <code className="cc-muted">{service.provider}</code>}
                    </td>
                    <td>{service.dependents.length ? service.dependents.map((name, index) => <Tag key={index}>{name}</Tag>) : <span className="cc-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        : <Empty>正在读取服务…</Empty>}
    </div>
  )
}
