import { randomBytes } from 'node:crypto'
import type {} from '@cormijs/cache'
import { type Context, getCookies, Schema, Service, setCookie, type State } from '@cormijs/cormi'

declare module '@cormijs/cormi' {
  interface Context {
    session: SessionService
  }

  interface State {
    /** the data of the session of the request: changes are saved after the response */
    session: Partial<SessionData>
  }
}

declare module '@cormijs/cache' {
  interface Tables {
    session: Partial<SessionData>
  }
}

/**
 * The data of a session, by declaration merging:
 *
 * ```ts
 * declare module '@cormijs/plugin-session' {
 *   interface SessionData {
 *     cart: number[]
 *   }
 * }
 * ```
 */
export interface SessionData {}

export interface Config {
  /** the name of the cookie */
  name: string
  /** how long a session lasts without requests, in milliseconds */
  maxAge: number
  /** whether each request extends the session, rather than each change */
  rolling: boolean
  /** `auto`: on HTTPS requests (also behind a proxy that sets `x-forwarded-proto`) */
  secure: boolean | 'auto'
  sameSite: 'strict' | 'lax' | 'none'
  domain?: string
  /** the order of the middleware, see `ctx.middleware.use()` */
  order: number
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().default('cormi.sid').description('the name of the cookie'),
  maxAge: Schema.natural().role('ms').default(7 * 24 * 3600 * 1000).description('how long a session lasts without requests'),
  rolling: Schema.boolean().default(true).description('each request extends the session'),
  secure: Schema.union([Boolean, Schema.const('auto')]).default('auto').description('auto: on HTTPS requests'),
  sameSite: Schema.union(['strict', 'lax', 'none']).default('lax'),
  domain: Schema.string(),
  order: Schema.number().default(-100).description('the order of the middleware'),
})

interface SessionState {
  /** the id of the stored session */
  id?: string
  /** the data as it was stored, as JSON */
  stored: string
  regenerate?: boolean
  destroy?: boolean
}

/**
 * Cookie sessions (`ctx.session`): `state.session` is the data of the
 * session of a request, for the middlewares, the API routes and the loaders
 * of pages. It is stored in `ctx.cache` (with the cookie, only the id goes to
 * the browser) and saved after the response when it changed; a request that
 * leaves it empty sets no cookie.
 */
export class SessionService extends Service {
  static inject = ['cache', 'middleware']

  private _states = new WeakMap<State, SessionState>()

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'session')
    ctx.middleware.use(async (request, { state }, next) => {
      const id = getCookies(request)[config.name]
      const data = id ? await ctx.cache.get('session', id) : undefined
      state.session = data && typeof data === 'object' ? data : {}
      const session: SessionState = { id: data ? id : undefined, stored: JSON.stringify(state.session) }
      this._states.set(state, session)
      const response = await next()
      await this._save(request, state, session, response, !!id)
      return response
    }, { order: config.order })
  }

  /**
   * Give the session of a request a new id, with its data, e.g. when a user
   * signs in: an id that someone else knew before is no longer the session.
   */
  regenerate(state: State) {
    this._get(state).regenerate = true
  }

  /** End the session of a request: its data is deleted and its cookie expires. */
  destroy(state: State) {
    this._get(state).destroy = true
    state.session = {}
  }

  private _get(state: State) {
    const session = this._states.get(state)
    if (!session) throw new Error('the request has no session: is the path of the request below the path of the middleware?')
    return session
  }

  private async _save(request: Request, state: State, session: SessionState, response: Response, hadCookie: boolean) {
    const { cache } = this.ctx
    const data = JSON.stringify(state.session ?? {})
    const cookie = (value: string, maxAge: number) => setCookie(response, this.config.name, value, {
      maxAge,
      httpOnly: true,
      secure: this.config.secure === 'auto' ? new URL(request.url).protocol === 'https:' : this.config.secure,
      sameSite: this.config.sameSite,
      domain: this.config.domain,
    })
    if (session.id && (session.destroy || session.regenerate || data === '{}')) {
      await cache.delete('session', session.id)
      session.id = undefined
    }
    if (data === '{}') {
      // nothing to keep: the cookie of a session that is gone expires
      if (hadCookie) cookie('', 0)
      return
    }
    if (session.id && data === session.stored && !this.config.rolling) return
    session.id ??= randomBytes(24).toString('base64url')
    await cache.set('session', session.id, JSON.parse(data), this.config.maxAge)
    cookie(session.id, this.config.maxAge / 1000)
  }
}

export const name = 'session'

export function apply(ctx: Context, config: Config) {
  ctx.plugin(SessionService, config)
}
