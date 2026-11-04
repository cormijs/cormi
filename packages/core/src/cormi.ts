import { join, resolve } from 'node:path'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    cormi: Cormi
  }
}

/**
 * - `dev`: serve the app with the dev server, watch files
 * - `build`: write the client (and server) bundles, then exit
 * - `preview`: serve the build output
 * - `setup`: write the generated files only (e.g. before type checking)
 */
export type Mode = 'dev' | 'build' | 'preview' | 'setup'

export namespace Cormi {
  export interface Options {
    /** root directory of the app */
    cwd: string
    mode: Mode
  }

  export interface Paths {
    cwd: string
    /** the pages, `src/`: bundled for the browser */
    src: string
    /** the server code, `server/`: run by Node, when the app serves */
    server: string
    /** generated files, `src/.cormi/` */
    tmp: string
    /** files served as-is, `public/` */
    public: string
  }
}

/**
 * The app environment: where the app lives and what the process is doing.
 *
 * `start()` provides it on the root context, so every plugin can read
 * `ctx.cormi` without declaring it in `inject`.
 */
export class Cormi extends Service {
  readonly cwd: string
  readonly mode: Mode
  readonly paths: Cormi.Paths

  constructor(ctx: Context, options: Cormi.Options) {
    super(ctx, 'cormi')
    this.cwd = resolve(options.cwd)
    this.mode = options.mode
    const src = join(this.cwd, 'src')
    this.paths = {
      cwd: this.cwd,
      src,
      server: join(this.cwd, 'server'),
      tmp: join(src, '.cormi'),
      public: join(this.cwd, 'public'),
    }
  }

  /** `NODE_ENV` of the app: `development` in dev mode, `production` otherwise */
  get env() {
    return this.mode === 'dev' ? 'development' : 'production'
  }

  /**
   * Whether the app serves requests (`dev`, `preview`): the server side of the
   * app, its code in `server/` and services such as the database, runs only
   * then, not when it builds or writes files.
   */
  get serving() {
    return this.mode === 'dev' || this.mode === 'preview'
  }

  /** Resolve a path against the app root. */
  resolve(...paths: string[]) {
    return resolve(this.cwd, ...paths)
  }
}
