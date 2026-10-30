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
})
