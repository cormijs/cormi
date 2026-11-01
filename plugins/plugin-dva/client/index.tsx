// the CommonJS build of dva-core (which Node loads) expects a global regeneratorRuntime
import 'regenerator-runtime/runtime'
import models from '@@/plugin-dva/models'
import type { Context } from '@cormijs/react/client'
import { create, type DvaInstance, type Model } from 'dva-core'
import createLoading from 'dva-loading'
import { produce } from 'immer'
import { useState } from 'react'
import { Provider } from 'react-redux'
import type { ClientConfig } from '../src/types.ts'

export { connect, useDispatch, useSelector, useStore } from 'react-redux'
export type { DvaInstance, Model } from 'dva-core'

declare module 'cordis' {
  interface Events {
    /**
     * A dva app was created for a rendered app, before it starts: add hooks
     * (`app.use()`) or models (`app.model()`).
     * @mode emit
     * @param app the dva app
     */
    'dva/create'(app: DvaInstance): void
  }
}

let current: DvaInstance | undefined

/** The dva app of the rendered app. */
export function getDvaApp() {
  return current
}

function isDvaModel(value: unknown): value is Model {
  return !!value && typeof value === 'object' && ['state', 'reducers', 'effects', 'subscriptions'].some(key => key in value)
}

/** Reducers receive immer drafts (what dva-immer does). */
function handleActionsWithImmer(handlers: Record<string, (state: any, action: any) => any>, defaultState: any) {
  return (state = defaultState, action: { type: string }) => {
    const handler = handlers[action.type]
    if (!handler) return state
    return produce(state, (draft: any) => handler(draft, action))
  }
}

export default (ctx: Context, config: ClientConfig) => {
  ctx.wrap(({ children }) => {
    // one app per rendered app: server-rendered requests do not share a store
    const [app] = useState(() => {
      const app = create({ onError: (error: Error) => console.error(error) })
      // subscriptions receive a history that follows the router of the app
      ;(app as any)._history = {
        get location() {
          return ctx.$router.router?.state.location
        },
        listen: (listener: (location: unknown) => void) => ctx.on('router/change', location => listener(location)),
        push: (to: string) => ctx.$router.navigate(to),
        replace: (to: string) => ctx.$router.navigate(to, { replace: true }),
      }
      if (config.loading) app.use(createLoading())
      if (config.immer) app.use({ _handleActions: handleActionsWithImmer } as any)
      for (const [namespace, model] of Object.entries<unknown>(models)) {
        if (isDvaModel(model)) app.model({ namespace, ...model })
      }
      ctx.emit('dva/create', app)
      app.start()
      return current = app
    })
    return <Provider store={(app as any)._store}>{children}</Provider>
  })
}
