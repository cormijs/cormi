import { REDIRECT_HEADER } from '@cormijs/runtime'
import { shallowReactive } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Context } from './context.ts'
import { createVueApp } from './render.ts'
import type { LoaderData } from './router.ts'

export interface RenderResult {
  status: number
  /** markup of the app */
  content: string
  head: string
  /** the hydration data, rendered after the mount element */
  body: string
}

export interface RequestHandler {
  /** Run the server `loader` of a route for the loader endpoint. */
  loader(request: Request, routeId: string): Promise<Response>
  /** Render a page; a `Response` is returned for redirects. */
  render(request: Request): Promise<Response | RenderResult>
}

const ESCAPED: Record<string, string> = { '&': '\\u0026', '>': '\\u003e', '<': '\\u003c', '\u2028': '\\u2028', '\u2029': '\\u2029' }

function renderHydrationData(loaderData: LoaderData) {
  const json = JSON.stringify(JSON.stringify({ loaderData })).replace(/[&><\u2028\u2029]/g, char => ESCAPED[char])
  return `<script>window.__staticRouterHydrationData = JSON.parse(${json});</script>`
}

function toLoaderResponse(response: Response) {
  // `fetch` follows redirects transparently, so they are passed in a header
  if (response.status >= 300 && response.status < 400) {
    return new Response(null, {
      status: 204,
      headers: { [REDIRECT_HEADER]: response.headers.get('location') ?? '/' },
    })
  }
  return response
}

/** Handle the requests of the app on the server: pages rendered with `vue/server-renderer`, and loaders. */
export function createRequestHandler(ctx: Context): RequestHandler {
  const { $router } = ctx
  const base = $router.base.replace(/\/$/, '')
  // the path below the basename
  const toPath = (url: URL) => (url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname) + url.search
  // matches the routes of loader requests
  let resolver: Router | undefined

  return {
    async loader(request, routeId) {
      const route = $router.routes[routeId]
      if (!route?.hasLoader) return new Response(`route ${routeId} has no loader`, { status: 404 })
      resolver ??= createRouter({ history: createMemoryHistory(), routes: $router.createRoutes() })
      const params = resolver.resolve(toPath(new URL(request.url))).params as Record<string, string | string[]>
      try {
        const result = await (await $router.load(routeId)).loader!({ request, params })
        return result instanceof Response ? toLoaderResponse(result) : Response.json(result ?? null)
      } catch (error) {
        if (error instanceof Response) return toLoaderResponse(error)
        throw error
      }
    },

    async render(request) {
      const url = new URL(request.url)
      const data = shallowReactive<LoaderData>({})
      let location: string | undefined
      const router = $router.createRouter({
        env: 'server',
        history: createMemoryHistory($router.base),
        data,
        origin: url.origin,
        onRedirect: (target) => {
          location = target
        },
      })
      const app = createVueApp(ctx, data, true)
      app.use(router)
      await router.push(toPath(url))
      await router.isReady()
      if (location) return new Response(null, { status: 302, headers: { location: /^[a-z]+:/i.test(location) ? location : base + location } })
      const status = router.currentRoute.value.matched.length ? 200 : 404
      const content = await renderToString(app)
      return { status, content, head: '', body: renderHydrationData(data) }
    },
  }
}
