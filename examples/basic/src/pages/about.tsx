import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData } from '@cormijs/react/client'

/** Runs on the server only; it is removed from the client bundle. `context.ctx` has the services of the server. */
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  const { platform } = await import('node:os')
  return { platform: platform(), time: new Date().toISOString().slice(0, 10), mode: context.ctx.cormi.mode }
}

export default function About() {
  const data = useLoaderData<typeof loader>()
  return (
    <div>
      <h1>About</h1>
      <p id="loader">served by {data.platform} on {data.time}</p>
      <p id="mode">rendered in {data.mode} mode</p>
    </div>
  )
}
