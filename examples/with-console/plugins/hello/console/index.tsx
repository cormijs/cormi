import type { Context } from 'cormi/client'
import { useData } from 'cormi/console'

function HelloPage() {
  const hello = useData<{ greeting: string; loadedAt: string }>('hello')
  return (
    <div className="cc-page">
      <header className="cc-page-head">
        <h1>Hello</h1>
        <p>A page that cormi-plugin-hello adds to the console, with data the plugin provides.</p>
      </header>
      <p id="hello-greeting">{hello?.greeting ?? '…'}</p>
      <p className="cc-muted">loaded at {hello?.loadedAt}</p>
    </div>
  )
}

export default (ctx: Context) => {
  ctx.$console.page({ path: '/hello', name: 'Hello', order: 90, component: HelloPage })
}
