import { Outlet } from 'cormi/client'
import CartBadge from '../components/CartBadge'

// the frame of the package when it runs by itself; the host has its own
export default function Layout() {
  return (
    <div id="standalone">
      <header>orders (standalone) <CartBadge /></header>
      <Outlet />
    </div>
  )
}
