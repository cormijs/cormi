import { useModel } from '@cormijs/plugin-model/client'

// exposed to the host and the other packages: `<RemoteComponent id="orders/CartBadge" />`
export default function CartBadge() {
  const count = useModel('cart', cart => cart.items.length)
  return <span id="cart">cart: {count}</span>
}
