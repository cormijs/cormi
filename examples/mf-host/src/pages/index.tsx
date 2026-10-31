import { lazy, Suspense } from 'react'

// a module of the remote app, loaded at runtime
const Greeting = lazy(() => import('remote/Greeting'))

export default function HostHome() {
  return (
    <div>
      <h1 id="host-title">mf host</h1>
      <Suspense fallback={<p>loading the remote…</p>}>
        <Greeting name="host" />
      </Suspense>
    </div>
  )
}
