import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, redirect, useLoaderData } from '@cormijs/react/client'

/** Admins only: the others sign in first. */
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  const { user } = context.state
  if (user?.role !== 'admin') throw redirect('/login')
  // the API route checks the same; here, the page renders on the server with the user
  return { name: user.name }
}

export default function Admin() {
  const { name } = useLoaderData<typeof loader>()
  return <h1 id="admin">Admin of {name}</h1>
}
