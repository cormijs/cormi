import { useDispatch, useSelector } from '@cormi/plugin-dva/client'
import { useSnapshot } from '@cormi/plugin-valtio/client'
import { useQuery } from '@tanstack/react-query'
import { settings } from '../stores/settings'

interface Todo {
  id: number
  text: string
}

export default function HomePage() {
  const todos = useQuery({ queryKey: ['todos'], queryFn: () => fetch('/api/todos').then(res => res.json() as Promise<Todo[]>) })
  const count = useSelector((state: any) => state.count as number)
  const adding = useSelector((state: any) => !!state.loading.effects['count/addLater'])
  const dispatch = useDispatch()
  const { compact } = useSnapshot(settings)

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', fontFamily: 'system-ui, sans-serif', lineHeight: compact ? 1.2 : 1.8 }}>
      <h1>react-query, dva and valtio</h1>
      <h3>react-query</h3>
      <ul id="todos">
        {todos.data?.map(todo => <li key={todo.id}>{todo.text}</li>) ?? <li>loading…</li>}
      </ul>
      <h3>dva</h3>
      <p>
        <span id="count">count: {count}</span>{' '}
        <button id="add" onClick={() => dispatch({ type: 'count/add' })}>add</button>{' '}
        <button id="add-later" onClick={() => dispatch({ type: 'count/addLater' })}>{adding ? 'adding…' : 'add later'}</button>
      </p>
      <h3>valtio</h3>
      <label>
        <input id="compact" type="checkbox" checked={compact} onChange={event => settings.compact = event.target.checked} /> compact
      </label>
      <span id="mode"> {compact ? 'compact' : 'comfortable'}</span>
    </div>
  )
}
