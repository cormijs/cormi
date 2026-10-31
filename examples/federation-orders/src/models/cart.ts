import { useCallback, useState } from 'react'

export default function useCart() {
  const [items, setItems] = useState<number[]>([])
  const add = useCallback((id: number) => setItems(items => [...items, id]), [])
  return { items, add }
}
