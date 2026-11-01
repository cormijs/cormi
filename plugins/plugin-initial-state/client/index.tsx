import type { Context } from '@cormi/react/client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

declare module 'cordis' {
  interface Events {
    /**
     * Load the initial state of the app when it mounts, or on `refresh()`.
     * The first listener returning a value other than `undefined` wins.
     * @mode serial
     */
    'initialState/load'(): unknown
  }
}

/** The initial state of the app; augment it to type `useInitialState()`. */
export interface InitialState {}

export interface InitialStateValue {
  initialState: InitialState | undefined
  loading: boolean
  error: unknown
  /** load the state again */
  refresh(): Promise<void>
  setInitialState(state: InitialState | ((state: InitialState | undefined) => InitialState)): void
}

const InitialStateContext = createContext<InitialStateValue | null>(null)

interface State {
  initialState?: InitialState
  loading: boolean
  error?: unknown
}

export default (ctx: Context) => {
  ctx.wrap(({ children }) => {
    const [state, setState] = useState<State>({ loading: true })

    const refresh = useCallback(async () => {
      setState(state => ({ ...state, loading: true, error: undefined }))
      try {
        const initialState = await ctx.serial('initialState/load') as InitialState | undefined
        setState({ initialState, loading: false })
      } catch (error) {
        setState(state => ({ ...state, loading: false, error }))
      }
    }, [])

    const setInitialState = useCallback<InitialStateValue['setInitialState']>((value) => {
      setState(state => ({
        ...state,
        initialState: typeof value === 'function' ? value(state.initialState) : value,
      }))
    }, [])

    useEffect(() => {
      void refresh()
    }, [refresh])

    const value = useMemo<InitialStateValue>(() => ({
      initialState: state.initialState,
      loading: state.loading,
      error: state.error,
      refresh,
      setInitialState,
    }), [state, refresh, setInitialState])

    return <InitialStateContext.Provider value={value}>{children}</InitialStateContext.Provider>
  }, 10)
}

export function useInitialState(): InitialStateValue {
  const value = useContext(InitialStateContext)
  if (!value) throw new Error('useInitialState() is called outside of the app')
  return value
}
