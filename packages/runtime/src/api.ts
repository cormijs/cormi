/**
 * End-to-end typed RPC and fetch client for `server/api` routes.
 *
 * `src/.cormi/api.d.ts` augments `ApiRoutes` with the modules of `server/api`.
 * Both path calls (`api.get('/api/todos')`, `api.patch('/api/todos/:id', ...)`)
 * and Hono-style property chains (`api.todos.$get()`, `api.todos[':id'].$patch(...)`)
 * infer the methods, parameters, request bodies and response types from the
 * server route modules without bundling any server code into the browser.
 */

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'

type ErrorStatus = 400 | 401 | 402 | 403 | 404 | 405 | 406 | 408 | 409 | 410 | 412 | 413 | 415 | 422 | 429 | 500 | 501 | 502 | 503 | 504

/** A `Response` carrying the compile-time type of its JSON body and status code. */
export interface TypedResponse<T = unknown, S extends number = number> extends Response {
  readonly _data?: T
  readonly _status?: S
  json(): Promise<T>
}

/** A `Request` carrying the compile-time type of its JSON body. */
export interface ApiRequest<B = any> extends Request {
  readonly _body?: B
  json(): Promise<B>
}

declare global {
  interface ResponseConstructor {
    json<T, S extends number = 200>(data: T, init?: (ResponseInit & { status?: S }) | ResponseInit): TypedResponse<T, S>
  }
}

type UnwrapReturn<R> =
  R extends TypedResponse<infer T, infer S>
    ? S extends ErrorStatus ? never : T
    : R extends Response
      ? void
      : R

/** The success response payload type of an API route handler. */
export type InferHandlerOutput<Fn> = Fn extends (...args: any[]) => infer R
  ? [UnwrapReturn<Awaited<R>>] extends [never]
    ? (Awaited<R> extends TypedResponse<infer T, any> ? T : void)
    : UnwrapReturn<Awaited<R>>
  : never

/** The request body type of an API route handler, when typed via `ApiRequest<B>` or `ApiContext<P, B>`. */
export type InferHandlerInput<Fn> = Fn extends (request: infer Req, context: infer Ctx, ...rest: any[]) => any
  ? Req extends { readonly _body?: infer B }
    ? unknown extends B ? (Ctx extends { readonly _body?: infer CB } ? CB : any) : B
    : Ctx extends { readonly _body?: infer CB } ? CB : any
  : any

/** Extract URL parameter names from a route path (`/api/todos/:id` -> `{ id: string | number }`). */
export type ExtractRouteParams<P extends string> =
  P extends `${string}/*${infer Rest}`
    ? { [K in Rest]: string | string[] }
    : P extends `${string}/:${infer Param}/${infer Tail}`
      ? { [K in Param]: string | number } & ExtractRouteParams<`/${Tail}`>
      : P extends `${string}/:${infer Param}`
        ? { [K in Param]: string | number }
        : {}

/** Contract of a `server/api` module for a route path. */
export interface ApiRouteContract<M = any, P extends string = string> {
  path: P
  params: ExtractRouteParams<P>
  methods: {
    [K in HttpMethod as K extends keyof M
      ? M[K] extends (...args: any[]) => any ? K : never
      : 'default' extends keyof M
        ? M['default'] extends (...args: any[]) => any ? K : never
        : never]: K extends keyof M
      ? {
          input: InferHandlerInput<M[K]>
          output: InferHandlerOutput<M[K]>
        }
      : 'default' extends keyof M
        ? {
            input: InferHandlerInput<M['default']>
            output: InferHandlerOutput<M['default']>
          }
        : never
  }
}

/**
 * Registry of the app's API routes, augmented by `src/.cormi/api.d.ts`:
 *
 * ```ts
 * declare module '@cormijs/cormi/client' {
 *   interface ApiRoutes {
 *     '/api/todos': ApiRouteContract<typeof import('../../server/api/todos/index.ts'), '/api/todos'>
 *   }
 * }
 * ```
 */
export interface ApiRoutes {}

/** Convert a route pattern (`/api/todos/:id`) into a template literal pattern (`/api/todos/${string | number}`). */
export type RouteTemplate<P extends string> =
  P extends `${infer Head}/*${string}`
    ? `${Head}/${string}`
    : P extends `${infer Head}/:${string}/${infer Tail}`
      ? `${Head}/${string | number}/${RouteTemplate<`/${Tail}` extends `/${infer R}` ? R : Tail>}`
      : P extends `${infer Head}/:${string}`
        ? `${Head}/${string | number}`
        : P

/** All paths accepted for routes supporting `M` (exact route patterns and interpolated template strings). */
export type PathsForMethod<M extends HttpMethod> = keyof ApiRoutes extends never
  ? string
  : {
      [P in keyof ApiRoutes & string]: M extends keyof ApiRoutes[P]['methods']
        ? P | RouteTemplate<P>
        : never
    }[keyof ApiRoutes & string]

/** Resolve a concrete or pattern path back to its key in `ApiRoutes`. */
export type MatchRouteKey<P extends string, M extends HttpMethod = HttpMethod> =
  P extends keyof ApiRoutes
    ? P
    : {
        [K in keyof ApiRoutes & string]: M extends keyof ApiRoutes[K]['methods']
          ? P extends RouteTemplate<K> ? K : never
          : never
      }[keyof ApiRoutes & string]

export type InferRouteOutput<P extends string, M extends HttpMethod> =
  keyof ApiRoutes extends never
    ? any
    : MatchRouteKey<P, M> extends infer K extends keyof ApiRoutes
      ? [K] extends [never]
        ? any
        : M extends keyof ApiRoutes[K]['methods']
          ? ApiRoutes[K]['methods'][M] extends { output: infer O } ? O : any
          : any
      : any

export type InferRouteInput<P extends string, M extends HttpMethod> =
  keyof ApiRoutes extends never
    ? any
    : MatchRouteKey<P, M> extends infer K extends keyof ApiRoutes
      ? [K] extends [never]
        ? any
        : M extends keyof ApiRoutes[K]['methods']
          ? ApiRoutes[K]['methods'][M] extends { input: infer I } ? I : any
          : any
      : any

export interface ApiRequestOptions<P extends string = string> extends Omit<RequestInit, 'body' | 'method'> {
  method?: HttpMethod | Lowercase<HttpMethod>
  /** URL path parameters (for patterns like `/api/todos/:id`) */
  params?: keyof ExtractRouteParams<P> extends never ? Record<string, string | number | string[]> : ExtractRouteParams<P>
  /** URL path parameters (Hono RPC alias of `params`) */
  param?: keyof ExtractRouteParams<P> extends never ? Record<string, string | number | string[]> : ExtractRouteParams<P>
  /** URL query parameters */
  query?: Record<string, string | number | boolean | null | undefined>
  /** JSON body (Hono RPC style) */
  json?: unknown
  /** Request body (serialized as JSON unless it is a `BodyInit`) */
  body?: unknown
}

export interface RpcCallOptions<C, M extends HttpMethod> extends Omit<RequestInit, 'body' | 'method'> {
  param?: C extends { params: infer P } ? P : Record<string, string | number>
  params?: C extends { params: infer P } ? P : Record<string, string | number>
  query?: Record<string, string | number | boolean | null | undefined>
  json?: C extends { methods: Record<M, { input: infer I }> } ? I : unknown
}

type ChildSegments<Routes, Prefix extends string> = {
  [K in keyof Routes & string]: K extends `${Prefix}/${infer Rest}`
    ? Rest extends `${infer Seg}/${string}` ? Seg : Rest
    : never
}[keyof Routes & string]

type EndpointMethods<C> =
  & (C extends { methods: { GET: { output: infer O } } }
    ? {
        $get(options?: RpcCallOptions<C, 'GET'>): Promise<TypedResponse<O>>
        get(options?: RpcCallOptions<C, 'GET'>): Promise<O>
      }
    : {})
  & (C extends { methods: { POST: { input: infer I; output: infer O } } }
    ? {
        $post(options?: RpcCallOptions<C, 'POST'>): Promise<TypedResponse<O>>
        post(body?: I, options?: RpcCallOptions<C, 'POST'>): Promise<O>
      }
    : {})
  & (C extends { methods: { PUT: { input: infer I; output: infer O } } }
    ? {
        $put(options?: RpcCallOptions<C, 'PUT'>): Promise<TypedResponse<O>>
        put(body?: I, options?: RpcCallOptions<C, 'PUT'>): Promise<O>
      }
    : {})
  & (C extends { methods: { PATCH: { input: infer I; output: infer O } } }
    ? {
        $patch(options?: RpcCallOptions<C, 'PATCH'>): Promise<TypedResponse<O>>
        patch(body?: I, options?: RpcCallOptions<C, 'PATCH'>): Promise<O>
      }
    : {})
  & (C extends { methods: { DELETE: { output: infer O } } }
    ? {
        $delete(options?: RpcCallOptions<C, 'DELETE'>): Promise<TypedResponse<O>>
        delete(options?: RpcCallOptions<C, 'DELETE'>): Promise<O>
      }
    : {})

export type ApiNode<Routes, Prefix extends string> =
  & (Prefix extends keyof Routes ? EndpointMethods<Routes[Prefix]> : {})
  & {
    [Seg in ChildSegments<Routes, Prefix>]: ApiNode<Routes, `${Prefix}/${Seg}`>
  }

export interface ApiClientBase {
  /** Send a typed request and return the parsed JSON (or text) body. */
  <P extends PathsForMethod<'GET'>, M extends HttpMethod = 'GET'>(
    path: P,
    options?: ApiRequestOptions<P> & { method?: M | Lowercase<M> },
  ): Promise<InferRouteOutput<P, M>>

  /** Send a typed request and return the `TypedResponse<T>` (like `fetch`, with `.json()` typed). */
  $fetch<P extends keyof ApiRoutes extends never ? string : (keyof ApiRoutes & string) | RouteTemplate<keyof ApiRoutes & string>, M extends HttpMethod = 'GET'>(
    path: P,
    options?: ApiRequestOptions<P> & { method?: M | Lowercase<M> },
  ): Promise<TypedResponse<InferRouteOutput<P, M>>>

  get<T = never, P extends PathsForMethod<'GET'> = PathsForMethod<'GET'>>(
    path: P,
    options?: ApiRequestOptions<P>,
  ): Promise<[T] extends [never] ? InferRouteOutput<P, 'GET'> : T>

  delete<T = never, P extends PathsForMethod<'DELETE'> = PathsForMethod<'DELETE'>>(
    path: P,
    options?: ApiRequestOptions<P>,
  ): Promise<[T] extends [never] ? InferRouteOutput<P, 'DELETE'> : T>

  post<T = never, P extends PathsForMethod<'POST'> = PathsForMethod<'POST'>>(
    path: P,
    body?: InferRouteInput<P, 'POST'>,
    options?: ApiRequestOptions<P>,
  ): Promise<[T] extends [never] ? InferRouteOutput<P, 'POST'> : T>

  put<T = never, P extends PathsForMethod<'PUT'> = PathsForMethod<'PUT'>>(
    path: P,
    body?: InferRouteInput<P, 'PUT'>,
    options?: ApiRequestOptions<P>,
  ): Promise<[T] extends [never] ? InferRouteOutput<P, 'PUT'> : T>

  patch<T = never, P extends PathsForMethod<'PATCH'> = PathsForMethod<'PATCH'>>(
    path: P,
    body?: InferRouteInput<P, 'PATCH'>,
    options?: ApiRequestOptions<P>,
  ): Promise<[T] extends [never] ? InferRouteOutput<P, 'PATCH'> : T>
}

export type ApiClient<Routes = ApiRoutes, Prefix extends string = '/api'> =
  & ApiClientBase
  & (keyof Routes extends never ? Record<string, any> : ApiNode<Routes, Prefix>)

export interface ApiClientOptions {
  /** Base URL or prefix (default `''` for path calls, `'/api'` for property chains). */
  baseURL?: string
  /** Route prefix for property chains (default `'/api'`). */
  prefix?: string
  /** Default headers sent with every request. */
  headers?: HeadersInit
  /** Custom `fetch` implementation, e.g. `app.fetch` in tests. */
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
}

function isBodyInit(value: unknown): value is BodyInit {
  return typeof value === 'string'
    || value instanceof FormData
    || value instanceof Blob
    || value instanceof URLSearchParams
    || value instanceof ArrayBuffer
    || ArrayBuffer.isView(value)
    || value instanceof ReadableStream
}

function buildUrl(path: string, baseURL: string | undefined, params?: Record<string, any>, query?: Record<string, any>) {
  let resolved = path
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      const encoded = Array.isArray(value) ? value.map(v => encodeURIComponent(String(v))).join('/') : encodeURIComponent(String(value))
      resolved = resolved.replace(`*${key}`, encoded).replace(`:${key}`, encoded)
    }
  }
  if (baseURL && !/^https?:\/\//i.test(resolved)) {
    resolved = `${baseURL.replace(/\/+$/, '')}/${resolved.replace(/^\/+/, '')}`
  }
  if (query) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) search.append(key, String(value))
    }
    const qs = search.toString()
    if (qs) resolved += (resolved.includes('?') ? '&' : '?') + qs
  }
  return resolved
}

async function parseResponse(response: Response) {
  if (response.status === 204 || response.status === 205) return undefined
  const type = response.headers.get('content-type') ?? ''
  const text = await response.text()
  if (!text) return undefined
  if (/[/+]json\b/i.test(type)) return JSON.parse(text)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Create a typed API client for `server/api` routes. Supports both path calls
 * (`client.get('/api/todos')`) and Hono-style RPC chains (`client.todos.$get()`).
 */
export function createApiClient<Routes = ApiRoutes, Prefix extends string = '/api'>(
  clientOptions: ApiClientOptions = {},
): ApiClient<Routes, Prefix> {
  const prefix = (clientOptions.prefix ?? '/api').replace(/\/+$/, '')
  const fetcher = clientOptions.fetch ?? ((input, init) => globalThis.fetch(input, init))

  const sendRaw = async (path: string, options: ApiRequestOptions = {}): Promise<TypedResponse<any>> => {
    const { method = 'GET', params, param, query, json, body: rawBody, headers: optHeaders, ...rest } = options
    const url = buildUrl(path, clientOptions.baseURL, (params ?? param) as Record<string, any> | undefined, query)
    const headers = new Headers(clientOptions.headers)
    if (optHeaders) new Headers(optHeaders).forEach((value, key) => headers.set(key, value))
    const payload = json !== undefined ? json : rawBody
    let body: BodyInit | undefined
    if (payload !== undefined) {
      if (isBodyInit(payload)) {
        body = payload
      } else {
        body = JSON.stringify(payload)
        if (!headers.has('content-type')) headers.set('content-type', 'application/json')
      }
    }
    return await fetcher(url, { ...rest, method: String(method).toUpperCase(), headers, body }) as TypedResponse<any>
  }

  const sendParsed = async (path: string, options: ApiRequestOptions = {}) => {
    const response = await sendRaw(path, options)
    const data = await parseResponse(response.clone())
    if (!response.ok) {
      const message = (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string')
        ? (data as any).error
        : `Request to ${path} failed with status ${response.status}`
      throw Object.assign(new Error(message), { status: response.status, response, data })
    }
    return data
  }

  const makeNode = (segments: string[]): any => {
    const routePath = () => `${prefix}/${segments.join('/')}`.replace(/\/+/g, '/')
    const fn = (path: string, options?: ApiRequestOptions) => sendParsed(path, options)
    return new Proxy(fn, {
      get(_target, prop) {
        if (typeof prop !== 'string') return undefined
        if (prop === '$fetch') return (path: string, options?: ApiRequestOptions) => sendRaw(path, options)
        // `$get`, `$post`, `$put`, `$patch`, `$delete`: Hono RPC style returning TypedResponse
        if (prop.startsWith('$')) {
          const method = prop.slice(1).toUpperCase() as HttpMethod
          return (options?: ApiRequestOptions) => sendRaw(routePath(), { ...options, method })
        }
        const upper = prop.toUpperCase()
        if (['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(upper)) {
          return (first?: string | ApiRequestOptions, second?: ApiRequestOptions) => {
            if (typeof first === 'string' && !segments.length) return sendParsed(first, { ...second, method: upper as HttpMethod })
            return sendParsed(routePath(), { ...(first as ApiRequestOptions), method: upper as HttpMethod })
          }
        }
        if (['POST', 'PUT', 'PATCH'].includes(upper)) {
          return (first?: unknown, second?: unknown, third?: ApiRequestOptions) => {
            if (typeof first === 'string' && !segments.length && ( first.startsWith('/') || /^https?:\/\//i.test(first))) {
              return sendParsed(first, { ...third, method: upper as HttpMethod, body: second })
            }
            return sendParsed(routePath(), { ...(second as ApiRequestOptions), method: upper as HttpMethod, body: first })
          }
        }
        return makeNode([...segments, prop])
      },
    })
  }

  return makeNode([])
}

/** Default typed API client for `server/api` routes. */
export const api: ApiClient = createApiClient()
