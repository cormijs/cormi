import type { RouteInfo } from '../../src/builtin.ts'
import { useQuery } from '../hooks.ts'
import { useData } from '../index.tsx'
import { CodeLine, Empty, FileLink, Section, Tag } from '../ui.tsx'
import type { OverviewData } from './overview.tsx'

export interface AppData {
  routes: RouteInfo[]
  entries: { file: string; config?: unknown }[]
  imports: string[]
  files: string[]
  servers: string[]
}

/** The full path of a route: paths are relative to their parents. */
function fullPath(route: RouteInfo, byId: Map<string, RouteInfo>): string {
  const path = route.path ?? ''
  if (path.startsWith('/')) return path
  const parent = route.parentId && byId.get(route.parentId)
  const base = parent ? fullPath(parent, byId) : '/'
  return (base.replace(/\/$/, '') + '/' + path).replace(/\/+$/, '') || '/'
}

export default function AppPage() {
  const app = useData<AppData>('app')
  const overview = useData<OverviewData>('overview')
  const bundler = useQuery<string[]>('bundler/plugins')
  if (!app) return <div className="cc-page"><Empty>正在读取应用…</Empty></div>
  const byId = new Map(app.routes.map(route => [route.id, route]))
  const pages = app.routes.filter(route => !route.isLayout)
  const layouts = app.routes.filter(route => route.isLayout)

  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>应用</h1>
        <p>ctx.router、ctx.app 与 ctx.bundler 此刻的内容：插件注册的一切汇总于此。点击文件在编辑器中打开。</p>
      </header>

      <Section title={`路由 ${pages.length}`}>
        <table className="cc-table">
          <thead>
            <tr><th>路径</th><th>文件</th><th>数据</th><th>布局</th></tr>
          </thead>
          <tbody>
            {pages.map((route) => {
              const path = fullPath(route, byId)
              const layout = route.parentId && byId.get(route.parentId)
              return (
                <tr key={route.id}>
                  <td>
                    {path.includes(':') || path.includes('*')
                      ? <code>{path}</code>
                      : <a href={`${overview?.url ?? ''}${path}`} target="_blank" rel="noreferrer"><code>{path}</code></a>}
                    {route.meta?.name && <span className="cc-muted"> {route.meta.name}</span>}
                  </td>
                  <td>{route.file ? <FileLink file={route.file} cwd={overview?.cwd} /> : <span className="cc-muted">—</span>}</td>
                  <td>
                    {route.exports?.includes('loader') && <Tag tone="cord">loader</Tag>}
                    {route.exports?.includes('clientLoader') && <Tag tone="leaf">clientLoader</Tag>}
                  </td>
                  <td>{layout && layout.isLayout ? <code className="cc-muted">{layout.id}</code> : null}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {layouts.length > 0 && (
          <p className="cc-muted">
            布局：{layouts.map(route => <code key={route.id} className="cc-inline">{route.id}</code>)}
          </p>
        )}
      </Section>

      <Section title={`浏览器插件 ${app.entries.length}`}>
        <p className="cc-muted">由 ctx.app.entry() 注册，按顺序挂载到浏览器端的 Context。</p>
        <ul className="cc-codelines">
          {app.entries.map((entry, index) => (
            <CodeLine key={index}>
              {entry.file}
              {entry.config !== undefined && <span className="cc-muted"> {JSON.stringify(entry.config)}</span>}
            </CodeLine>
          ))}
        </ul>
      </Section>

      <div className="cc-columns">
        <Section title={`全局导入 ${app.imports.length}`}>
          {app.imports.length
            ? <ul className="cc-codelines">{app.imports.map(source => <CodeLine key={source}>{source}</CodeLine>)}</ul>
            : <Empty>没有插件注册全局导入。</Empty>}
        </Section>
        <Section title={`生成文件 ${app.files.length}`}>
          <ul className="cc-files">
            {app.files.map(file => <li key={file}><FileLink file={file} cwd={overview?.cwd} /></li>)}
          </ul>
        </Section>
      </div>

      <Section title={`打包器插件 ${bundler.data?.length ?? ''}`} aside={<button type="button" className="cc-link" onClick={bundler.reload}>刷新</button>}>
        {bundler.error && <p className="cc-row-error">{bundler.error}</p>}
        {bundler.data && <ul className="cc-pills">{bundler.data.map((name, index) => <li key={index}><code>{name}</code></li>)}</ul>}
      </Section>
    </div>
  )
}
