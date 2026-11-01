import type { RouteData } from '@cormi/react/client'

export interface MenuItem {
  /** route id */
  key: string
  path: string
  name: string
  icon?: string
  children: MenuItem[]
}

function joinPath(parent: string, path?: string) {
  if (!path) return parent
  if (path.startsWith('/')) return path
  return `${parent.replace(/\/$/, '')}/${path}`
}

/** `order-list` -> `Order list`; the root is `Home`. */
function humanize(segment?: string) {
  if (!segment) return 'Home'
  return segment[0].toUpperCase() + segment.slice(1).replace(/[-_]+/g, ' ')
}

/**
 * The menu of the routes: layouts are transparent; routes with parameters and
 * routes with `meta.hideInMenu` are left out.
 */
export function getMenuItems(routes: Record<string, RouteData>): MenuItem[] {
  const children = new Map<string | undefined, RouteData[]>()
  for (const route of Object.values(routes)) {
    const siblings = children.get(route.parentId) ?? []
    siblings.push(route)
    children.set(route.parentId, siblings)
  }
  const build = (parentId: string | undefined, parentPath: string): MenuItem[] => (children.get(parentId) ?? []).flatMap((route) => {
    const path = joinPath(parentPath, route.path)
    if (route.isLayout) return build(route.id, path)
    if (route.meta?.hideInMenu || /[:*]/.test(route.path ?? '')) return []
    return [{
      key: route.id,
      path,
      name: route.meta?.name ?? humanize(path.split('/').filter(Boolean).pop()),
      icon: route.meta?.icon,
      children: build(route.id, path),
    }]
  })
  return build(undefined, '/')
}

/** Names of the matched routes, layouts left out; hidden routes included. */
export function getBreadcrumb(routes: Record<string, RouteData>, ids: string[]) {
  return ids.map(id => routes[id]).filter(route => route && !route.isLayout).map(route => ({
    key: route.id,
    name: route.meta?.name ?? humanize(route.path?.split('/').filter(Boolean).pop()),
  }))
}
