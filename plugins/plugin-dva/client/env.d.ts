declare module '@@/plugin-dva/models' {
  const models: Record<string, unknown>
  export default models
}

declare module 'dva-core' {
  import type { Reducer, Store } from 'redux'

  export interface Model {
    namespace?: string
    state?: any
    reducers?: Record<string, Reducer<any, any>>
    effects?: Record<string, any>
    subscriptions?: Record<string, (api: { dispatch: (action: any) => any; history: any }, done: (error: Error) => void) => unknown>
  }

  export interface DvaInstance {
    model(model: Model): void
    unmodel(namespace: string): void
    use(hooks: Record<string, unknown>): void
    start(): void
    _store: Store
  }

  export function create(hooks?: Record<string, unknown>, options?: Record<string, unknown>): DvaInstance
}

declare module 'dva-loading' {
  export default function createLoading(options?: { namespace?: string; effects?: boolean }): Record<string, unknown>
}
