import { RemoteComponent } from '@cormijs/plugin-federation/client'
import { useCordis } from '@cormijs/react/client'

export default function Home() {
  const { $federation } = useCordis()
  return (
    <section>
      <h1 id="title">Federation host</h1>
      <p id="packages">packages: {[...$federation.packages.keys()].join(', ')}</p>
      {/* a component of the orders package, which loads the package */}
      <RemoteComponent id="orders/CartBadge" fallback={<span id="cart">loading the cart…</span>} />
    </section>
  )
}
