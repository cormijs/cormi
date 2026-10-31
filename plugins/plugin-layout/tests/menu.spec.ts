import { describe, expect, it } from 'vitest'
import { getBreadcrumb, getMenuItems } from '../client/menu.ts'

describe('getMenuItems()', () => {
  it('builds the menu through layouts, without hidden and dynamic routes', () => {
    const items = getMenuItems({
      'layout': { id: 'layout', path: '/', isLayout: true },
      'index': { id: 'index', path: '/', parentId: 'layout', meta: { name: 'Dashboard', icon: 'DashboardOutlined' } },
      'users': { id: 'users', path: '/users', parentId: 'layout', meta: { name: 'Users' } },
      'users/list': { id: 'users/list', path: '/users', parentId: 'users', meta: { name: 'List' } },
      'users/detail': { id: 'users/detail', path: '/users/:id', parentId: 'users' },
      'users/hidden': { id: 'users/hidden', path: 'hidden', parentId: 'users', meta: { hideInMenu: true } },
      'order-list': { id: 'order-list', path: 'order-list', parentId: 'layout' },
    })
    expect(items).toEqual([
      { key: 'index', path: '/', name: 'Dashboard', icon: 'DashboardOutlined', children: [] },
      { key: 'users', path: '/users', name: 'Users', icon: undefined, children: [{ key: 'users/list', path: '/users', name: 'List', icon: undefined, children: [] }] },
      { key: 'order-list', path: '/order-list', name: 'Order list', icon: undefined, children: [] },
    ])
  })

  it('names the matched routes for the breadcrumb, hidden ones included', () => {
    const routes = {
      layout: { id: 'layout', path: '/', isLayout: true },
      users: { id: 'users', path: '/users', parentId: 'layout', meta: { name: 'Users' } },
      detail: { id: 'detail', path: '/users/:id', parentId: 'users', meta: { name: 'Detail', hideInMenu: true } },
    }
    expect(getBreadcrumb(routes, ['layout', 'users', 'detail']).map(item => item.name)).toEqual(['Users', 'Detail'])
  })
})
