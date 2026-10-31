/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  title?: string
  /** URL of the logo */
  logo?: string
  /** the menu at the side or at the top */
  layout: 'side' | 'top'
  theme: 'dark' | 'light'
  /** show the breadcrumb of the current route */
  breadcrumb: boolean
  footer?: string
}
