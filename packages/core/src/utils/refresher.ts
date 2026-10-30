/**
 * Coalesces refresh requests into one run of `callback`.
 *
 * Services recompute their output (route table, generated files, dev server)
 * whenever a registration is added or disposed; a plugin usually registers
 * several things at once, so requests within `delay` ms share one run.
 * Runs never overlap: a request made during a run schedules another one.
 */
export class Refresher {
  private _timer: ReturnType<typeof setTimeout> | undefined
  private _pending = false
  private _task: Promise<void> = Promise.resolve()

  constructor(
    private _callback: () => Promise<void>,
    private _delay: number,
    private _onError: (error: unknown) => void,
  ) {}

  /** Request a run. */
  schedule() {
    this._pending = true
    if (this._timer) return
    this._timer = setTimeout(() => {
      this._timer = undefined
      void this.flush()
    }, this._delay)
  }

  /** Start the pending run now, if any; resolves once no run is in progress. */
  flush(): Promise<void> {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = undefined
    }
    if (!this._pending) return this._task
    this._pending = false
    this._task = this._task.then(() => this._callback()).catch(this._onError)
    return this._task
  }

  /** Drop the pending run. A run in progress still completes. */
  dispose() {
    clearTimeout(this._timer)
    this._timer = undefined
    this._pending = false
  }
}
