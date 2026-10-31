import { useCordis } from 'cormi/client'
import { type ComponentType, lazy, type ReactNode, Suspense } from 'react'
import type { Federation } from './host.tsx'

export type { Federation, Manifest, Package, PackageEntry } from './host.tsx'

/** Developers point the app at their local packages: a list of entries (URLs or `{ url, eager }`) in this key of `localStorage`. */
export const OVERRIDE_KEY = 'cormi:packages'

const components = new WeakMap<object, Map<string, ComponentType<any>>>()

export type RemoteComponentProps<P> = P & {
  /** the module: `<package>/<expose>`, e.g. `orders/OrderCard` */
  id: string
  /** rendered while the module loads, and when the app has no packages (e.g. on the server) */
  fallback?: ReactNode
}

/**
 * A component exposed by a package, loaded when it renders. Its package is
 * loaded first, so the component finds the package's runtime plugins.
 */
export function RemoteComponent<P extends object = Record<string, any>>({ id, fallback = null, ...props }: RemoteComponentProps<P>) {
  const federation = useCordis().get('$federation') as Federation | undefined
  if (!federation) return <>{fallback}</>
  let cache = components.get(federation)
  if (!cache) components.set(federation, cache = new Map())
  let Component = cache.get(id)
  if (!Component) {
    Component = lazy(async () => {
      const module = await federation.import(id)
      return { default: module.default ?? module }
    })
    cache.set(id, Component)
  }
  return <Suspense fallback={fallback}><Component {...props} /></Suspense>
}
