import { useCallback, useState } from 'react'

export default function useCounter() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => setCount(count => count + 1), [])
  const decrement = useCallback(() => setCount(count => count - 1), [])
  const reset = useCallback(() => setCount(0), [])
  return { count, increment, decrement, reset }
}
