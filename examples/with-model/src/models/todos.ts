import { useCallback, useState } from 'react'

export interface Todo {
  id: number
  text: string
  done: boolean
}

export default function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Try Cormi', done: true },
    { id: 2, text: 'Write a model', done: false },
  ])
  const add = useCallback((text: string) => {
    setTodos(todos => [...todos, { id: Date.now(), text, done: false }])
  }, [])
  const toggle = useCallback((id: number) => {
    setTodos(todos => todos.map(todo => todo.id === id ? { ...todo, done: !todo.done } : todo))
  }, [])
  const remove = useCallback((id: number) => {
    setTodos(todos => todos.filter(todo => todo.id !== id))
  }, [])
  return { todos, add, toggle, remove }
}
