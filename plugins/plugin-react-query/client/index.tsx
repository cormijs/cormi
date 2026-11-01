import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Context } from '@cormi/react/client'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ClientConfig } from '../src/types.ts'

declare module 'cordis' {
  interface Events {
    /**
     * A QueryClient was created for a rendered app (one per server-rendered request).
     * @mode emit
     * @param client the new client
     */
    'reactQuery/client'(client: QueryClient): void
  }
}

const Devtools = lazy(() => import('@tanstack/react-query-devtools').then(module => ({ default: module.ReactQueryDevtools })))

export default (ctx: Context, config: ClientConfig) => {
  ctx.wrap(({ children }) => {
    const [client] = useState(() => {
      const client = new QueryClient({ defaultOptions: config.defaultOptions })
      ctx.emit('reactQuery/client', client)
      return client
    })
    // the devtools render after hydration, so the server's markup matches
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    return (
      <QueryClientProvider client={client}>
        {children}
        {config.devtools && mounted && (
          <Suspense>
            <Devtools />
          </Suspense>
        )}
      </QueryClientProvider>
    )
  })
}
