import { type ClientLoaderFunctionArgs, Link, useCordis, useLoaderData } from '@cormi/react/client'
import { orders } from '../../data'

// packages run in the browser of the host: their routes load data with client loaders
export async function clientLoader({ params }: ClientLoaderFunctionArgs) {
  const order = orders.find(order => order.id === Number(params.id))
  if (!order) throw new Response('order not found', { status: 404 })
  return order
}

export default function OrderPage() {
  const order = useLoaderData<typeof clientLoader>()
  // the users package provides `ctx.users` when the app has it
  const users = useCordis().get('users')
  return (
    <section>
      <h1 id="order">{order.title}</h1>
      <p id="customer">customer: {users?.get(order.customer)?.name ?? `#${order.customer}`}</p>
      <Link to="/orders">all orders</Link>
    </section>
  )
}
