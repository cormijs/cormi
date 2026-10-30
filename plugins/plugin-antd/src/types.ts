/** Config of the browser plugin, shared by the node and the browser side. */
export interface ClientConfig {
  /** design tokens and component tokens of `ConfigProvider` */
  theme: Record<string, any>
  /** use the dark algorithm */
  dark: boolean
  /** use the compact algorithm */
  compact: boolean
  /** wrap the app with antd's `<App>` (context of `message`, `modal`, `notification`) */
  app: boolean
}
