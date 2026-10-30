import { type Context, useCordis } from 'cormi/client'
import type { MicroApp as QiankunMicroApp } from 'qiankun'
import { createContext, type CSSProperties, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import type { MasterClientConfig } from '../src/types.ts'

const ConfigContext = createContext<MasterClientConfig | null>(null)

// qiankun touches `window` when imported, so it is only imported in the browser
const loadQiankun = () => import('qiankun')

export default (ctx: Context, config: MasterClientConfig) => {
  ctx.wrap(({ children }) => <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>)
  if (config.prefetch && config.apps.length) {
    ctx.on('app/mount', () => {
      void loadQiankun().then(({ prefetchApps }) => prefetchApps(config.apps.map(({ name, entry }) => ({ name, entry }))))
    })
  }
}

function joinPath(...parts: string[]) {
  return ('/' + parts.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1')
}

function shallowEqual(a: Record<string, any>, b: Record<string, any>) {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.is(a[key], b[key]))
}

export interface MicroAppProps {
  /** name of the micro app, one of the `apps` of the plugin */
  name: string
  /** where the micro app's router runs, relative to the master's basename */
  base?: string
  className?: string
  style?: CSSProperties
  /** rendered while the micro app loads */
  loading?: ReactNode
  /** rendered when the micro app fails to load or mount */
  fallback?: (error: unknown) => ReactNode
  /** other props are passed to the micro app */
  [key: string]: any
}

/** Load and mount a micro app; it is unmounted with the component. */
export function MicroApp({ name, base = '/', className, style, loading, fallback, ...props }: MicroAppProps) {
  const config = useContext(ConfigContext)
  if (!config) throw new Error('<MicroApp> needs @cormi/plugin-qiankun/master in cormi.yml')
  const { $router } = useCordis()
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<QiankunMicroApp>(undefined)
  const [state, setState] = useState<{ status: 'loading' | 'mounted' | 'failed'; error?: unknown }>({ status: 'loading' })
  const app = config.apps.find(app => app.name === name)
  const appProps = { ...app?.props, ...props, base: joinPath($router.basename, base) }
  const latestProps = useRef(appProps)

  useEffect(() => {
    if (!app) {
      setState({ status: 'failed', error: new Error(`micro app ${name} is not in the apps of @cormi/plugin-qiankun/master`) })
      return
    }
    let disposed = false
    let microApp: QiankunMicroApp | undefined
    setState({ status: 'loading' })
    loadQiankun()
      .then(({ loadMicroApp }) => {
        if (disposed) return
        microApp = instance.current = loadMicroApp(
          { name, entry: app.entry, container: container.current!, props: latestProps.current },
          { sandbox: config.sandbox },
        )
        return microApp.mountPromise.then(() => {
          if (!disposed) setState({ status: 'mounted' })
        })
      })
      .catch((error) => {
        if (disposed) return
        console.error(error)
        setState({ status: 'failed', error })
      })
    return () => {
      disposed = true
      instance.current = undefined
      microApp?.mountPromise.then(() => microApp!.unmount(), () => {})
    }
  }, [name, app?.entry, appProps.base])

  // later props reach the mounted micro app through its `update` lifecycle
  useEffect(() => {
    if (shallowEqual(latestProps.current, appProps)) return
    latestProps.current = appProps
    if (state.status === 'mounted') void instance.current?.update?.(appProps)
  })

  return (
    <div className={className} style={style} data-micro-app={name}>
      {state.status === 'loading' && loading}
      {state.status === 'failed' && (fallback ? fallback(state.error) : <div role="alert">failed to load {name}: {String(state.error)}</div>)}
      <div ref={container} />
    </div>
  )
}
