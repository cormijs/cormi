import { useLoaderData } from '@cormi/react/client'

/** Runs on the server only; it is removed from the client bundle. */
export async function loader() {
  const { platform } = await import('node:os')
  return { platform: platform(), time: new Date().toISOString().slice(0, 10) }
}

export default function About() {
  const data = useLoaderData<typeof loader>()
  return (
    <div>
      <h1>About</h1>
      <p id="loader">served by {data.platform} on {data.time}</p>
    </div>
  )
}
