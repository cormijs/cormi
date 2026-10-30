import { request, useRequest } from '@cormi/plugin-request/client'
import { useState } from 'react'

interface Page {
  list: { id: number; name: string }[]
  total: number
}

export default function HomePage() {
  const [page, setPage] = useState(1)
  // `dataField: data` in cormi.yml: the data is the `data` field of the body
  const users = useRequest<Page, []>(() => request('/api/users', { params: { page } }), { refreshDeps: [page] })
  const headers = useRequest<{ app: string; authorization: string }, []>(() => request('/api/headers'))
  const broken = useRequest(() => request('/api/broken'), { manual: true })
  const pages = Math.ceil((users.data?.total ?? 0) / 5)

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Cormi + request</h1>
      <p id="headers">
        headers seen by the server: x-app={headers.data?.app ?? '…'}, authorization={headers.data?.authorization ?? '…'}
      </p>
      <ul id="users">
        {users.loading && !users.data ? <li>loading…</li> : users.data?.list.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button disabled={page <= 1} onClick={() => setPage(page => page - 1)}>previous</button>
        <span id="page">{page} / {pages || '…'}</span>
        <button disabled={page >= pages} onClick={() => setPage(page => page + 1)}>next</button>
      </div>
      <p>
        <button id="broken" onClick={() => broken.run()}>request a broken API</button>
        {broken.error && <span id="error"> {broken.error.message}</span>}
      </p>
    </div>
  )
}
