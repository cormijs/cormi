import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData, useRevalidator } from '@cormijs/react/client'

/** The user of the session: the middlewares of the server put it in the state of the request. */
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  return { user: context.state.user ?? null }
}

export default function Home() {
  const { user } = useLoaderData<typeof loader>()
  const { revalidate } = useRevalidator()

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    await revalidate()
  }

  if (!user) return <p id="user">Not signed in</p>
  return (
    <>
      <p id="user">Signed in as {user.name} ({user.role})</p>
      <button onClick={logout}>Sign out</button>
    </>
  )
}
