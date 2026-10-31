/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  /** `defaultOptions` of the QueryClient, e.g. `{ queries: { staleTime: 60000 } }` */
  defaultOptions: Record<string, any>
  /** show the devtools in dev mode */
  devtools: boolean
}
