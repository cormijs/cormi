import { useInitialState } from '@cormi/plugin-initial-state/client'

export default function HomePage() {
  const { initialState, loading, error, refresh } = useInitialState()
  return (
    <div>
      <h1>Cormi + models</h1>
      <p>
        <code>src/models/*.ts</code> are shared hooks read with <code>useModel()</code>; the initial state is
        provided by <code>src/app.ts</code> through the <code>initialState/load</code> event, and{' '}
        <code>/api/me</code> is mocked in <code>mock/user.ts</code>.
      </p>
      <p id="user">
        {loading ? 'loading…' : error ? `error: ${String(error)}` : `signed in as ${initialState?.name} (${initialState?.role})`}
      </p>
      <button onClick={() => refresh()}>reload</button>
    </div>
  )
}
