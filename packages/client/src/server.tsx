import React, { Fragment, type ReactNode } from 'react'
import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server'
import { createStaticHandler, createStaticRouter, isRouteErrorResponse, StaticRouterProvider } from 'react-router'
import { Root } from './app.tsx'
import type { Context } from './context.ts'
import { ServerInsertedHTMLContext } from './inserted.tsx'
import { REDIRECT_HEADER } from './constants.ts'

export interface RenderResult {
  status: number
  /** markup of the app, including the hydration data */
  content: string
  /** markup inserted with `useServerInsertedHTML()` */
  head: string
}

export interface RequestHandler {
  /** Run the server `loader` of a route for the loader endpoint. */
  loader(request: Request, routeId: string): Promise<Response>
  /** Render a page; a `Response` is returned for redirects. */
  render(request: Request): Promise<Response | RenderResult>
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
    async loader(request, routeId) {
      try {
        const result = await handler.queryRoute(request, { routeId })
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

    async render(request) {
      const context = await handler.query(request)
      if (context instanceof Response) return context
      const router = createStaticRouter(handler.dataRoutes, context)
      const inserted: (() => ReactNode)[] = []
      const stream = await renderToReadableStream(
        <ServerInsertedHTMLContext.Provider value={callback => inserted.push(callback)}>
          <Root ctx={ctx}>
            <StaticRouterProvider router={router} context={context} />
          </Root>
        </ServerInsertedHTMLContext.Provider>,
        { onError: error => console.error(error) },
      )
      await stream.allReady
      const content = await new Response(stream).text()
      const head = renderToStaticMarkup(<>{inserted.map((callback, index) => <Fragment key={index}>{callback()}</Fragment>)}</>)
      return { status: context.statusCode, content, head }
    },
  }
}
