import { useModel } from '@cormi/plugin-model/client'
import { type FormEvent, useState } from 'react'

export default function TodosPage() {
  const { todos, add, toggle, remove } = useModel('todos')
  const [text, setText] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    add(text.trim())
    setText('')
  }

  return (
    <div>
      <h2>Todos</h2>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={text} onChange={event => setText(event.target.value)} placeholder="Add a todo" style={{ flex: 1 }} />
        <button type="submit">Add</button>
      </form>
      <ul id="todos" style={{ listStyle: 'none', padding: 0 }}>
        {todos.map(todo => (
          <li key={todo.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
            <input type="checkbox" checked={todo.done} onChange={() => toggle(todo.id)} />
            <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.text}</span>
            <button onClick={() => remove(todo.id)}>delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
