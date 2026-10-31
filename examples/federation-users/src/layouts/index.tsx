import { Outlet } from 'cormi/client'

// the frame of the package when it runs by itself; the host has its own
export default function Layout() {
  return (
    <div id="standalone">
      <header>users (standalone)</header>
      <Outlet />
    </div>
  )
}
