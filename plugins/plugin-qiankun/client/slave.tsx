import { type Context, useHostProps } from '@cormi/react/client'

/** Props qiankun passes to a micro app, plus the props of the master. */
export interface MasterProps {
  name?: string
  /** the master's element hosting the micro app */
  container?: HTMLElement
  /** basename of the micro app's router in the master */
  base?: string
  onGlobalStateChange?: (callback: (state: Record<string, any>, prev: Record<string, any>) => void, fireImmediately?: boolean) => void
  setGlobalState?: (state: Record<string, any>) => boolean
  [key: string]: any
}

export default (ctx: Context) => {
  // the loader of the document mounts the app, inside a master or by itself
  ctx.on('app/bootstrap', () => true)
}

/** The props of the master; empty when the micro app runs by itself. */
export function useMasterProps<T extends MasterProps = MasterProps>(): T {
  return useHostProps<T>()
}

/** Whether the micro app runs inside a qiankun master. */
export function useInQiankun() {
  return !!useHostProps<MasterProps>().container
}
