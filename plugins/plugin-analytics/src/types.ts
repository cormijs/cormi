/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  /** measurement id of Google Analytics 4, e.g. `G-XXXXXXX` */
  ga?: string
  /** site id of Baidu Tongji */
  baidu?: string
}
