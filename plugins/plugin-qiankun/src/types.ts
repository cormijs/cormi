/** A micro app of the master. */
export interface MicroAppConfig {
  name: string
  /** URL of the micro app's document, e.g. `//localhost:8001` */
  entry: string
  /** props passed to the micro app */
  props?: Record<string, any>
}

export interface SandboxConfig {
  strictStyleIsolation?: boolean
  experimentalStyleIsolation?: boolean
}

/** Config of the master's browser plugin, shared by the node and the browser side. */
export interface MasterClientConfig {
  apps: MicroAppConfig[]
  sandbox: boolean | SandboxConfig
  /** prefetch the micro apps once the master has mounted */
  prefetch: boolean
}
