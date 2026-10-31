import { createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Context } from '../src/index.ts'

const routes = {
  layout: { id: 'layout', path: '/' },
  index: { id: 'index', path: '/', parentId: 'layout' },
  about: { id: 'about', path: 'about', parentId: 'layout', hasLoader: true },
  users: { id: 'users', path: 'users', parentId: 'layout', hasLoader: true, hasClientLoader: true },
}

const routeModules = {
  layout: async () => ({}),
  index: async () => ({ default: () => null }),
  about: async () => ({ default: () => null, loader: () => 'from server' }),
  users: async () => ({ default: () => null, loader: () => 'users', clientLoader: async ({ serverLoader }: any) => ['client', await serverLoader()] }),
}

describe('Context', () => {
  it('provides $app and $router on the root context, and ctx.wrap()', async () => {
    const ctx = new Context({ routes, routeModules })
    const Wrapper = ({ children }: any) => children
    const fiber = ctx.plugin((ctx: Context) => {
      ctx.wrap(Wrapper)
    })
    await fiber
    expect(ctx.$app.getWrappers()).toEqual([Wrapper])
    await fiber.dispose()
    expect(ctx.$app.getWrappers()).toEqual([])
  })

  it('orders wrappers by order, then by registration', () => {
    const ctx = new Context({ routes, routeModules })
    const a = () => null
    const b = () => null
    const c = () => null
    ctx.wrap(a)
    ctx.wrap(b, 10)
    ctx.wrap(c)
    expect(ctx.$app.getWrappers()).toEqual([a, c, b])
  })

  it('creates nested route objects with server loaders on the server', async () => {
    const ctx = new Context({ routes, routeModules })
    const [layout] = ctx.$router.createRoutes('server')
    expect(layout.id).toBe('layout')
    expect(layout.children!.map(route => route.id)).toEqual(['index', 'about', 'users'])
    const about = layout.children![1]
    expect(await (about.loader as any)({ request: new Request('http://localhost/about'), params: {} })).toBe('from server')
    expect(layout.children![0].loader).toBeUndefined()
  })

  it('fetches server loaders on the client, and passes them to clientLoader', async () => {
    const ctx = new Context({ routes, routeModules, base: '/app/' })
    const requests: string[] = []
    globalThis.fetch = (async (url: string) => {
      requests.push(url)
      return Response.json('from endpoint')
    }) as any
    const [layout] = ctx.$router.createRoutes('client')
    const [, about, users] = layout.children!
    const args = (path: string) => ({ request: new Request(`http://localhost${path}`), params: {} })
    expect(await (about.loader as any)(args('/app/about'))).toBe('from endpoint')
    expect(await (users.loader as any)(args('/app/users?page=2'))).toEqual(['client', 'from endpoint'])
    expect(requests).toEqual([
      '/app/__cormi/loader?route=about&url=%2Fapp%2Fabout',
      '/app/__cormi/loader?route=users&url=%2Fapp%2Fusers%3Fpage%3D2',
    ])
  })

  it('adds routes at runtime, below their parent, until the plugin is disposed', async () => {
    const ctx = new Context({ routes: { ...routes }, routeModules: { ...routeModules } })
    const added = [
      { id: 'pkg/orders', path: '/orders', parentId: 'layout' },
      { id: 'pkg/order', path: ':id', parentId: 'pkg/orders' },
    ]
    const fiber = ctx.plugin((ctx: Context) => {
      ctx.$router.add(added, { 'pkg/order': async () => ({ default: () => null }) })
    })
    await fiber
    expect(ctx.$router.routes['pkg/order'].parentId).toBe('pkg/orders')
    const [layout] = ctx.$router.createRoutes('client')
    expect(layout.children!.map(route => route.id)).toEqual(['index', 'about', 'users', 'pkg/orders'])
    expect(layout.children![3].children!.map(route => route.id)).toEqual(['pkg/order'])
    await fiber.dispose()
    expect(ctx.$router.routes['pkg/orders']).toBeUndefined()
    expect(ctx.$router.options.routeModules['pkg/order']).toBeUndefined()
  })

  it('patches the rendered router, and removes the routes from it', async () => {
    const ctx = new Context({ routes: { ...routes }, routeModules: { ...routeModules } })
    const router = createMemoryRouter(ctx.$router.createRoutes('client'), { initialEntries: ['/'] })
    ctx.$router.router = router
    router.initialize()
    const leaf = () => router.state.matches.at(-1)?.route.id

    const fiber = ctx.plugin((ctx: Context) => {
      ctx.$router.add([{ id: 'pkg/orders', path: '/orders', parentId: 'layout' }], { 'pkg/orders': async () => ({ default: () => null }) })
    })
    await fiber
    await router.navigate('/orders')
    expect(leaf()).toBe('pkg/orders')

    await fiber.dispose()
    expect(router.manifest['pkg/orders']).toBeUndefined()
    await router.navigate('/orders')
    expect(router.state.errors).toBeTruthy()

    // the same routes can be added again
    await ctx.plugin((ctx: Context) => {
      ctx.$router.add([{ id: 'pkg/orders', path: '/orders', parentId: 'layout' }], { 'pkg/orders': async () => ({ default: () => null }) })
    })
    await router.navigate('/orders')
    expect(leaf()).toBe('pkg/orders')
    router.dispose()
  })
})
