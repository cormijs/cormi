export interface Order {
  id: number
  title: string
  customer: number
}

export const orders: Order[] = [
  { id: 1, title: 'Keyboard', customer: 2 },
  { id: 2, title: 'Monitor', customer: 3 },
]
