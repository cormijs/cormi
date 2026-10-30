/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  /** prefix of relative request URLs; required for requests during server rendering */
  baseURL?: string
  /** abort requests after this many milliseconds */
  timeout?: number
  /** headers of every request */
  headers: Record<string, string>
  credentials?: 'omit' | 'same-origin' | 'include'
  /** `useRequest()` returns this field of the response body, e.g. `data` */
  dataField?: string
}
