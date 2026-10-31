/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  /** track the effects in `state.loading` (dva-loading) */
  loading: boolean
  /** write reducers with immer drafts */
  immer: boolean
}
