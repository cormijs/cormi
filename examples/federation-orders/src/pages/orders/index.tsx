import { Link } from '@cormijs/react/client'
import { useModel } from '@cormijs/plugin-model/client'
import { orders } from '../../data'

export default function OrdersPage() {
  const { add } = useModel('cart')
  return (
    <section>
      <h1 id="title">Orders</h1>
      <ul id="orders">
        {orders.map(order => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`}>{order.title}</Link>
            <button id={`add-${order.id}`} onClick={() => add(order.id)}>add to cart</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
