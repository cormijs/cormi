import type { Route } from 'cormi'
import { describe, expect, it } from 'vitest'
import { getShared, toContainerName, toManifestRoutes } from '../src/shared.ts'

describe('toManifestRoutes()', () => {
  const routes: Record<string, Route> = {
    '@@/global-layout': { id: '@@/global-layout', path: '/', absPath: '/', isLayout: true },
    'orders/index': { id: 'orders/index', path: 'orders', absPath: '/orders', parentId: '@@/global-layout', meta: { name: 'Orders' } },
    'orders/layout': { id: 'orders/layout', path: 'admin', absPath: '/admin', parentId: '@@/global-layout', isLayout: true },
    'orders/$id': { id: 'orders/$id', path: ':id', absPath: '/admin/:id', parentId: 'orders/layout', exports: ['default', 'clientLoader'] },
    'orders/old': { id: 'orders/old', path: 'old', parentId: '@@/global-layout', exports: ['default', 'loader'], hideInMenu: true },
    '404': { id: '404', path: '*', absPath: '/*' },
  }

  it('leaves out the frame of the package, and gives top routes absolute paths', () => {
    const loaders: string[] = []
    expect(toManifestRoutes(routes, 'orders', route => loaders.push(route.id))).toEqual([
      { id: 'orders/orders/index', path: '/orders', meta: { name: 'Orders' } },
      { id: 'orders/orders/layout', path: '/admin', isLayout: true },
      { id: 'orders/orders/$id', path: ':id', parentId: 'orders/orders/layout', hasClientLoader: true },
      { id: 'orders/orders/old', path: '/old', meta: { hideInMenu: true } },
    ])
    expect(loaders).toEqual(['orders/old'])
  })
})

describe('shared modules', () => {
  it('names containers after packages', () => {
    expect(toContainerName('@acme/orders-web')).toBe('acme_orders_web')
  })

  it('shares the framework as singletons', () => {
    expect(getShared(['antd'])).toMatchObject({
      'react': { singleton: true },
      'react-router': { singleton: true },
      'cormi/client': { singleton: true },
      'antd': { singleton: true },
    })
  })
})
