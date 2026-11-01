import { useRequest as useAhooksRequest } from 'ahooks'
import type { Options, Plugin, Result } from 'ahooks/lib/useRequest/src/types'
import type { Context } from '@cormi/react/client'
import type { ClientConfig } from '../src/types.ts'

declare module 'cordis' {
  interface Events {
    /**
     * Around every request. A listener may edit `init` (e.g. its headers),
     * replace the response, or answer without calling `next()`.
     * @mode waterfall
     * @param url the resolved URL, with the params
     * @param init the fetch options
     * @param config the request config
     * @param next send the request through the next listeners and `fetch()`
     */
    'request/fetch'(url: URL, init: RequestInit & { headers: Headers }, config: RequestConfig, next: () => Promise<Response>): Promise<Response>
    /**
     * A request failed (unless `skipErrorHandler` is set), e.g. to show a message.
     * The error is thrown to the caller either way; a listener returning `true`
     * has handled it, so `useRequest()` does not log it.
     * @mode bail
     */
    'request/error'(error: RequestError, config: RequestConfig): boolean | void
  }
}

export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'response'

export interface RequestConfig extends Omit<RequestInit, 'body' | 'headers' | 'method'> {
  method?: string
  headers?: HeadersInit
  /** query parameters; `null` and `undefined` are left out */
  params?: Record<string, string | number | boolean | null | undefined>
  /** the body: sent as JSON unless it is a `BodyInit` (string, `FormData`, `Blob`, ...) */
  data?: unknown
  baseURL?: string
  timeout?: number
  /** how to read the response; by default JSON when the response says so, text otherwise */
  responseType?: ResponseType
  /** whether a status is a success (default: 2xx) */
  validateStatus?: (status: number) => boolean
  /** do not emit `request/error` for this request */
  skipErrorHandler?: boolean
}

export class RequestError extends Error {
  name = 'RequestError'
  /** a listener of `request/error` handled the error */
  handled = false

  constructor(
    message: string,
    public config: RequestConfig,
    /** the response, if the server answered */
    public response?: Response,
    /** the body of the response */
    public data?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

let current: { ctx: Context; config: ClientConfig } | undefined

export default (ctx: Context, config: ClientConfig) => {
  const instance = { ctx, config }
  current = instance
  ctx.effect(() => () => {
    if (current === instance) current = undefined
  }, 'request')
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

async function decode(response: Response, type: ResponseType | undefined) {
  if (type === 'response' || response.status === 204 || response.status === 205) return
  if (type) return response[type]()
  const text = await response.text()
  if (!text) return
  return /[/+]json\b/.test(response.headers.get('content-type') ?? '') ? JSON.parse(text) : text
}

const ABSOLUTE_URL_RE = /^([a-z][a-z\d+.-]*:)?\/\//i

async function send(url: string | URL, options: RequestConfig = {}): Promise<any> {
  if (!current) throw new Error('@cormi/plugin-request is not in cormi.yml')
  const { ctx, config: defaults } = current
  const config: RequestConfig = { ...defaults, ...options, headers: undefined }
  const { params, data, baseURL, timeout, responseType, validateStatus, skipErrorHandler, dataField: _, ...rest } = config as RequestConfig & ClientConfig

  // like axios: a relative URL is appended to `baseURL`
  let href = String(url)
  if (baseURL && !ABSOLUTE_URL_RE.test(href)) href = `${baseURL.replace(/\/+$/, '')}/${href.replace(/^\/+/, '')}`
  const page = globalThis.location?.href
  if (!page && !ABSOLUTE_URL_RE.test(href)) throw new Error(`cannot request the relative URL ${href} on the server, set baseURL`)
  const target = new URL(href, page)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined) target.searchParams.append(key, String(value))
  }

  const headers = new Headers(defaults.headers)
  new Headers(options.headers).forEach((value, key) => headers.set(key, value))
  let body: BodyInit | undefined
  if (data !== undefined) {
    if (isBodyInit(data)) {
      body = data
    } else {
      body = JSON.stringify(data)
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
  }
  const signals = [options.signal, timeout ? AbortSignal.timeout(timeout) : undefined].filter(Boolean) as AbortSignal[]
  const init: RequestInit & { headers: Headers } = {
    ...rest,
    method: (config.method ?? 'GET').toUpperCase(),
    headers,
    body,
    signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
  }

  const fail = (error: RequestError) => {
    if (!skipErrorHandler) error.handled = !!ctx.bail('request/error', error, config)
    return error
  }

  let response: Response
  try {
    response = await ctx.waterfall('request/fetch', target, init, config, () => fetch(target, init))
  } catch (cause) {
    const reason = (cause as Error)?.name === 'TimeoutError' ? `timed out after ${timeout}ms` : (cause as Error)?.message
    throw fail(new RequestError(`request to ${target.pathname} failed: ${reason}`, config, undefined, undefined, { cause }))
  }
  const result = await decode(response.clone(), responseType)
  if (!(validateStatus ?? (status => status >= 200 && status < 300))(response.status)) {
    throw fail(new RequestError(`request to ${target.pathname} failed with status ${response.status}`, config, response, result))
  }
  return responseType === 'response' ? response : result
}

type Method = <T = any>(url: string | URL, config?: RequestConfig) => Promise<T>
type MethodWithData = <T = any>(url: string | URL, data?: unknown, config?: RequestConfig) => Promise<T>

export interface Request {
  <T = any>(url: string | URL, config?: RequestConfig): Promise<T>
  get: Method
  delete: Method
  head: Method
  post: MethodWithData
  put: MethodWithData
  patch: MethodWithData
}

/** Send a request; resolves with the body of the response, rejects with a `RequestError`. */
export const request: Request = Object.assign(send, {
  get: (url: string | URL, config?: RequestConfig) => send(url, { ...config, method: 'GET' }),
  delete: (url: string | URL, config?: RequestConfig) => send(url, { ...config, method: 'DELETE' }),
  head: (url: string | URL, config?: RequestConfig) => send(url, { ...config, method: 'HEAD' }),
  post: (url: string | URL, data?: unknown, config?: RequestConfig) => send(url, { ...config, method: 'POST', data }),
  put: (url: string | URL, data?: unknown, config?: RequestConfig) => send(url, { ...config, method: 'PUT', data }),
  patch: (url: string | URL, data?: unknown, config?: RequestConfig) => send(url, { ...config, method: 'PATCH', data }),
}) as Request

/** Log the errors no listener of `request/error` has handled, like ahooks does by default. */
function logUnhandled(error: Error) {
  if (!(error instanceof RequestError && error.handled)) console.error(error)
}

/**
 * ahooks' `useRequest()`. With `dataField` in the config of the plugin, the
 * data is that field of the service's result.
 */
export function useRequest<TData, TParams extends any[] = []>(
  service: (...args: TParams) => Promise<any>,
  options?: Options<TData, TParams>,
  plugins?: Plugin<TData, TParams>[],
): Result<TData, TParams> {
  return useAhooksRequest<TData, TParams>(async (...args) => {
    const result = await service(...args)
    const field = current?.config.dataField
    return field ? result?.[field] : result
  }, { onError: logUnhandled, ...options }, plugins)
}
