import { randomBytes, scrypt as scryptCallback, type ScryptOptions, timingSafeEqual } from 'node:crypto'
import { type Context, Schema, Service, type State } from '@cormijs/cormi'
import type {} from '@cormijs/plugin-session'

declare module '@cormijs/cormi' {
  interface Context {
    auth: Auth
  }

  interface State {
    /** the signed-in user of the request */
    user?: User
  }
}

declare module '@cormijs/plugin-session' {
  interface SessionData {
    user: User
  }
}

/**
 * The signed-in user, as the app keeps it in the session, by declaration
 * merging; it is stored as JSON:
 *
 * ```ts
 * declare module '@cormijs/plugin-auth' {
 *   interface User {
 *     id: number
 *     role: 'admin' | 'member'
 *   }
 * }
 * ```
 */
export interface User {}

/** What an API module exports as `auth`: `true` for any signed-in user, or a check of the user. */
export type AuthRule = boolean | ((user: User, request: Request) => boolean | Promise<boolean>)

export interface Config {
  /** the order of the middleware, see `ctx.middleware.use()` */
  order: number
}

export const Config: Schema<Config> = Schema.object({
  order: Schema.number().default(-90).description('the order of the middleware'),
})

function scrypt(password: string, salt: Buffer, length: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password.normalize('NFKC'), salt, length, options, (error, key) => error ? reject(error) : resolve(key))
  })
}

const COST = { N: 16384, r: 8, p: 1 }
const LENGTH = 64

/** A hash of a password to store: `scrypt$N$r$p$salt$hash`, with a random salt. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, LENGTH, COST)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

/** Whether a password is the one of a hash of `hashPassword()`, in constant time. */
export async function verifyPassword(password: string, hash: string) {
  const [algorithm, N, r, p, salt, expected] = hash.split('$')
  if (algorithm !== 'scrypt' || !expected) return false
  const key = Buffer.from(expected, 'base64url')
  // an empty key would equal any password's: a hash has a key of 16 bytes at least, and valid parameters
  if (key.length < 16 || ![N, r, p].every(value => /^[1-9]\d*$/.test(value))) return false
  try {
    const actual = await scrypt(password, Buffer.from(salt, 'base64url'), key.length, { N: +N, r: +r, p: +p, maxmem: 256 * +N * +r * +p })
    return timingSafeEqual(key, actual)
  } catch {
    // a hash of other parameters than scrypt accepts
    return false
  }
}

/**
 * Signed-in users (`ctx.auth`), in the session: `login()` and `logout()` in
 * the API routes, `state.user` everywhere a request is (middlewares, API
 * routes, loaders). An API module that exports `auth` requires a user: 401
 * without one, 403 when its check of the user fails. Where the users are
 * stored is the app's.
 */
export class Auth extends Service {
  static inject = ['session', 'middleware']

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'auth')
    ctx.middleware.use((request, { state }, next) => {
      state.user = state.session.user
      return next()
    }, { order: config.order })
    ctx.on('api/request', (route, request, { state }) => this.authorize(route.module.auth as AuthRule, request, state))
  }

  /** Sign a user in, for the session of the request; the session gets a new id. */
  login(state: State, user: User) {
    this.ctx.session.regenerate(state)
    state.session.user = user
    state.user = user
  }

  /** Sign the user of a request out: the session ends. */
  logout(state: State) {
    this.ctx.session.destroy(state)
    state.user = undefined
  }

  /** The response that denies a request to a route with this rule, if it does. */
  async authorize(rule: AuthRule | undefined, request: Request, state: State): Promise<Response | undefined> {
    if (rule === undefined || rule === false) return
    if (!state.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
    if (typeof rule === 'function' && !await rule(state.user, request)) return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  hash(password: string) {
    return hashPassword(password)
  }

  verify(password: string, hash: string) {
    return verifyPassword(password, hash)
  }
}

export const name = 'auth'

export function apply(ctx: Context, config: Config) {
  ctx.plugin(Auth, config)
}
