import React, { Fragment, type ReactNode } from 'react'
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, isRouteErrorResponse, type StaticHandlerContext, StaticRouterProvider } from 'react-router'
import { Root } from './app.tsx'
import type { Context } from './context.ts'
import { ServerInsertedHTMLContext } from './inserted.tsx'
import { REDIRECT_HEADER } from '@cormijs/runtime'

export interface RenderResult {
  status: number
  /** markup of the app */
  content: string
  /** markup inserted with `useServerInsertedHTML()` */
  head: string
  /** the hydration data, rendered after the mount element */
  body: string
}

export interface RequestHandler {
  /** Run the server `loader` of a route for the loader endpoint; `context` is the `context` of loaders. */
  loader(request: Request, routeId: string, context?: unknown): Promise<Response>
  /** Render a page; a `Response` is returned for redirects. */
  render(request: Request, context?: unknown): Promise<Response | RenderResult>
}

const ESCAPED: Record<string, string> = { '&': '\\u0026', '>': '\\u003e', '<': '\\u003c', '\u2028': '\\u2028', '\u2029': '\\u2029' }

/** Errors as react-router's client deserializes them. */
function serializeErrors(errors: StaticHandlerContext['errors']) {
  if (!errors) return null
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(errors)) {
    if (isRouteErrorResponse(value)) {
      result[key] = { ...value, __type: 'RouteErrorResponse' }
    } else if (value instanceof Error) {
      result[key] = { message: value.message, __type: 'Error', ...value.name !== 'Error' ? { __subType: value.name } : {} }
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * The hydration data is written outside of the React tree, so wrappers that
 * render elements around the router do not make the markup differ from the
 * client's.
 */
function renderHydrationData(context: StaticHandlerContext) {
  const data = { loaderData: context.loaderData, actionData: context.actionData, errors: serializeErrors(context.errors) }
  const json = JSON.stringify(JSON.stringify(data)).replace(/[&><\u2028\u2029]/g, char => ESCAPED[char])
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

/** Handle the requests of the app on the server, with react-router's static handler. */
export function createRequestHandler(ctx: Context): RequestHandler {
  const handler = createStaticHandler(ctx.$router.createRoutes('server'), { basename: ctx.$router.base })

  return {
    async loader(request, routeId, context) {
      try {
        const result = await handler.queryRoute(request, { routeId, requestContext: context })
        if (result instanceof Response) return toLoaderResponse(result)
        return Response.json(result ?? null)
      } catch (error) {
        if (error instanceof Response) return toLoaderResponse(error)
        if (isRouteErrorResponse(error)) {
          return Response.json(error.data ?? null, { status: error.status, statusText: error.statusText })
        }
        throw error
      }
    },

    async render(request, requestContext) {
      const context = await handler.query(request, { requestContext })
      if (context instanceof Response) return context
      const router = createStaticRouter(handler.dataRoutes, context)
      const inserted: (() => ReactNode)[] = []
      const stream = await renderToReadableStream(
        <ServerInsertedHTMLContext.Provider value={callback => inserted.push(callback)}>
          <Root ctx={ctx}>
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </Root>
        </ServerInsertedHTMLContext.Provider>,
        { onError: error => console.error(error) },
      )
      await stream.allReady
      const content = await new Response(stream).text()
      const head = renderToStaticMarkup(<>{inserted.map((callback, index) => <Fragment key={index}>{callback()}</Fragment>)}</>)
      return { status: context.statusCode, content, head, body: renderHydrationData(context) }
    },
  }
}
