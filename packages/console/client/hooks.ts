import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { LogRecord } from '../src/builtin.ts'
import { type ConsoleService, useConsole } from './index.tsx'

/** A call to the server from a button: its pending state, error and result. */
export function useAction<A extends unknown[], T>(action: (console: ConsoleService, ...args: A) => Promise<T>) {
  const console = useConsole()
  const [state, setState] = useState<{ pending: boolean; done?: boolean; error?: string; result?: T }>({ pending: false })
  const run = useCallback(async (...args: A) => {
    setState({ pending: true })
    try {
      const result = await action(console, ...args)
      setState({ pending: false, done: true, result })
      return result
    } catch (error) {
      setState({ pending: false, error: (error as Error).message })
    }
  }, [console])
  return { ...state, run, reset: () => setState({ pending: false }) }
}

/** The result of a call made when the component mounts. */
export function useQuery<T>(name: string, ...args: unknown[]) {
  const console = useConsole()
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const key = JSON.stringify(args)
  const load = useCallback(() => {
    setState(state => ({ ...state, loading: true }))
    console.call<T>(name, ...args).then(
      data => setState({ data, loading: false }),
      error => setState({ error: (error as Error).message, loading: false }),
    )
  }, [console, name, key])
  useEffect(load, [load])
  return { ...state, reload: load }
}

const MAX_LOGS = 1000

/** The logs of the server: the recent ones it sends on connection, then each as it comes. */
export class LogStore {
  records: LogRecord[] = []
  private _listeners = new Set<() => void>()

  reset(records: LogRecord[]) {
    this.records = records.slice(-MAX_LOGS)
    this._notify()
  }

  append(record: LogRecord) {
    if (this.records.length && this.records[this.records.length - 1].sn >= record.sn) return
    this.records = [...this.records.slice(-(MAX_LOGS - 1)), record]
    this._notify()
  }

  clear() {
    this.records = []
    this._notify()
  }

  subscribe = (listener: () => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  private _notify() {
    for (const listener of this._listeners) listener()
  }
}

export const logs = new LogStore()

export function useLogs() {
  return useSyncExternalStore(logs.subscribe, () => logs.records)
}

/** `Date` of a log record, as `HH:mm:ss`. */
export function formatTime(ts: number) {
  return new Date(ts).toTimeString().slice(0, 8)
}
