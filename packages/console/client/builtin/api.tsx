import { useSearchParams } from '@cormijs/react/client'
import { useState } from 'react'
import type { ApiInfo } from '../../src/builtin.ts'
import { useData } from '../index.tsx'
import { Empty, FileLink, Lamp, Section, Tag } from '../ui.tsx'
import type { OverviewData } from './overview.tsx'

type ApiRouteStatus = ApiInfo['routes'][number]

const STATE: Record<ApiRouteStatus['status'], { lamp: string; text: string }> = {
  ready: { lamp: 'active', text: '可用' },
  waiting: { lamp: 'pending', text: '等待服务' },
  failed: { lamp: 'failed', text: '加载失败' },
}

export default function ApiPage() {
  const api = useData<ApiInfo>('api')
  const [params, setParams] = useSearchParams()
  const selected = api?.routes.find(route => route.path === params.get('path')) ?? api?.routes[0]

  return (
    <div className="cc-page cc-page-split">
      <div className="cc-split-list">
        <header className="cc-page-head">
          <h1>接口</h1>
          <p>server/api 中的接口：它们的方法、等待的服务与要求的登录。选择一个接口，可以直接发请求试用。</p>
        </header>
        {!api && <Empty>正在读取接口…</Empty>}
        {api && !api.routes.length && <Empty>还没有接口。运行 <code>cormi g api hello</code>，在 server/api 中创建一个。</Empty>}
        {api && api.routes.length > 0 && (
          <ul className="cc-entries" aria-label="server/api">
            {api.routes.map(route => (
              <li key={route.path} className="cc-entry" data-selected={route === selected || undefined}>
                <button type="button" className="cc-entry-main" onClick={() => setParams({ path: route.path }, { replace: true })} aria-current={route === selected || undefined}>
                  <Lamp state={STATE[route.status].lamp} title={STATE[route.status].text} />
                  <code>{route.path}</code>
                  <span className="cc-muted">{route.methods.join(' ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {api && api.plugins.length > 0 && (
          <Section title={`插件注册的路由 ${api.plugins.length}`}>
            <table className="cc-table">
              <thead>
                <tr><th>方法</th><th>路径</th><th>插件</th></tr>
              </thead>
              <tbody>
                {api.plugins.map((route, index) => (
                  <tr key={index}>
                    <td><Tag>{route.method === 'ALL' ? '*' : route.method}</Tag></td>
                    <td><code>{route.path}</code></td>
                    <td>{route.plugin ? <code className="cc-muted">{route.plugin}</code> : <span className="cc-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
      <div className="cc-split-detail">
        {selected ? <RouteDetail key={selected.path} route={selected} /> : <Empty>选择一个接口查看它的详情。</Empty>}
      </div>
    </div>
  )
}

function RouteDetail(props: { route: ApiRouteStatus }) {
  const { route } = props
  const overview = useData<OverviewData>('overview')
  return (
    <article className="cc-detail">
      <header className="cc-detail-head">
        <div className="cc-detail-title">
          <Lamp state={STATE[route.status].lamp} />
          <h2><code>{route.path}</code></h2>
          <Tag tone={route.status === 'ready' ? 'leaf' : route.status === 'failed' ? 'cord' : 'amber'}>{STATE[route.status].text}</Tag>
        </div>
        <p><FileLink file={route.file} cwd={overview?.cwd} /></p>
        {route.error && <p className="cc-row-error">{route.error}</p>}
        {route.waits?.length ? <p className="cc-muted">在提供这些服务的插件就绪之前，接口返回 503：{route.waits.map(name => <Tag key={name} tone="amber">{name}</Tag>)}</p> : null}
      </header>
      <dl className="cc-kv">
        <div>
          <dt>方法</dt>
          <dd>{route.methods.length ? route.methods.map(method => <Tag key={method}>{method === '*' ? '* (default)' : method}</Tag>) : <span className="cc-muted">—</span>}</dd>
        </div>
        <div>
          <dt>依赖的服务（inject）</dt>
          <dd>{route.inject.length ? route.inject.map(name => <Tag key={name}>{name}</Tag>) : <span className="cc-muted">无</span>}</dd>
        </div>
        <div>
          <dt>登录（auth）</dt>
          <dd>{route.auth === 'user' ? <Tag tone="cord">需要登录</Tag> : route.auth === 'check' ? <Tag tone="cord">检查用户</Tag> : <span className="cc-muted">不需要</span>}</dd>
        </div>
      </dl>
      {route.status !== 'failed' && <TryRequest route={route} />}
    </article>
  )
}

interface Result {
  status: number
  statusText: string
  time: number
  headers: [string, string][]
  body: string
}

/** A request to a route from the console: it has the cookies of the app, so routes that require a user work after signing in. */
function TryRequest(props: { route: ApiRouteStatus }) {
  const { route } = props
  const methods = route.methods.filter(method => method !== '*').length ? route.methods.filter(method => method !== '*') : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  const [method, setMethod] = useState(methods[0] === 'HEAD' && methods.includes('GET') ? 'GET' : methods[0])
  // a path to fill in: `:id` and `*path` are left for the user
  const [path, setPath] = useState(route.path)
  const [body, setBody] = useState('')
  const [result, setResult] = useState<Result>()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method)

  async function send() {
    setPending(true)
    setError('')
    const start = performance.now()
    try {
      // the console is served by the app: the same origin, with the cookies of the app
      const response = await fetch(path, {
        method,
        body: hasBody && body ? body : undefined,
        headers: hasBody && body ? { 'content-type': 'application/json' } : undefined,
      })
      const text = await response.text()
      let pretty = text
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2)
      } catch {}
      setResult({ status: response.status, statusText: response.statusText, time: Math.round(performance.now() - start), headers: [...response.headers], body: pretty })
    } catch (error) {
      setError(String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Section title="试一试">
      <form className="cc-form" onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}>
        <div className="cc-toolbar">
          <div className="cc-segments" role="radiogroup" aria-label="方法">
            {methods.map(item => (
              <button key={item} type="button" role="radio" aria-checked={item === method} className="cc-segment" onClick={() => setMethod(item)}>{item}</button>
            ))}
          </div>
          <input className="cc-input" style={{ flex: 1 }} value={path} aria-label="路径" onChange={event => setPath(event.target.value)} />
          <button type="submit" className="cc-button cc-button-primary" disabled={pending}>发送</button>
        </div>
        {hasBody && <textarea className="cc-textarea" rows={5} value={body} placeholder='请求体，如 {"title": "hello"}' aria-label="请求体" onChange={event => setBody(event.target.value)} />}
      </form>
      {error && <p className="cc-row-error">{error}</p>}
      {result && (
        <div className="cc-response" data-testid="response">
          <p>
            <Tag tone={result.status < 300 ? 'leaf' : result.status < 500 ? 'amber' : 'cord'}>{result.status} {result.statusText}</Tag>
            <span className="cc-muted"> {result.time} ms</span>
          </p>
          <details>
            <summary className="cc-muted">响应头 {result.headers.length}</summary>
            <table className="cc-table">
              <tbody>{result.headers.map(([key, value]) => <tr key={key}><td><code>{key}</code></td><td><code>{value}</code></td></tr>)}</tbody>
            </table>
          </details>
          {result.body && <pre className="cc-json">{result.body}</pre>}
        </div>
      )}
    </Section>
  )
}
