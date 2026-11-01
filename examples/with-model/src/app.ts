import type { Context } from '@cormi/react/client'
import type {} from '@cormi/plugin-initial-state/client'

declare module '@cormi/plugin-initial-state/client' {
  interface InitialState {
    name: string
    role: string
  }
}

/** The runtime plugin of the app: it provides the initial state. */
export default (ctx: Context) => {
  ctx.on('initialState/load', async () => {
    const response = await fetch('/api/me')
    if (!response.ok) throw new Error(`failed to load the current user: ${response.status}`)
    return response.json()
  })
}
