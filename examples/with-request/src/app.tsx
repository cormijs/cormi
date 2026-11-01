import type {} from '@cormijs/plugin-request/client'
import type { Context } from '@cormijs/react/client'
import { useEffect, useState } from 'react'

const listeners = new Set<(message: string) => void>()

/** Shows the last failed request, for 3 seconds. */
function Toast() {
  const [message, setMessage] = useState<string>()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const listener = (message: string) => {
      setMessage(message)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(undefined), 3000)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      clearTimeout(timer)
    }
  }, [])
  if (!message) return null
  return <div id="toast" role="alert" style={{ position: 'fixed', top: 16, right: 16, padding: '8px 14px', background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{message}</div>
}

/** The runtime plugin of the app: it intercepts requests and reports their errors. */
export default (ctx: Context) => {
  ctx.on('request/fetch', async (url, init, config, next) => {
    init.headers.set('authorization', 'Bearer demo-token')
    return next()
  })

  ctx.on('request/error', (error) => {
    const message = (error.data as { message?: string } | undefined)?.message ?? error.message
    for (const listener of listeners) listener(message)
    // handled: useRequest() does not log it
    return true
  })

  ctx.wrap(({ children }) => (
    <>
      {children}
      <Toast />
    </>
  ))
}
