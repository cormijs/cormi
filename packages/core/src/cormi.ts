import { join, resolve } from 'node:path'
import { Context, Service } from 'cordis'
import type { NodeBuild } from './compile.ts'

declare module 'cordis' {
  interface Context {
    cormi: Cormi
  }
}

/**
 * - `dev`: serve the app with the dev server, from its sources, watch files
 * - `build`: write the bundles of the pages and compile the Node code, then exit
 * - `start`: serve the app in production, from the output of `build`
 * - `setup`: write the generated files only (e.g. before type checking)
 */
export type Mode = 'dev' | 'build' | 'start' | 'setup'

export namespace Cormi {
  export interface Options {
    /** root directory of the app */
    cwd: string
    mode: Mode
    /** the compiled Node code, in `start` mode */
    build?: NodeBuild
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
  /** the Node code that `cormi build` compiled (`dist/node`), which the app runs in `start` mode */
  readonly build?: NodeBuild

  constructor(ctx: Context, options: Cormi.Options) {
    super(ctx, 'cormi')
    this.cwd = resolve(options.cwd)
    this.mode = options.mode
    this.build = options.build
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
   * Whether the app serves requests (`dev`, `start`): the server side of the
   * app, its code in `server/` and services such as the database, runs only
   * then, not when it builds or writes files.
   */
  get serving() {
    return this.mode === 'dev' || this.mode === 'start'
  }

  /** Resolve a path against the app root. */
  resolve(...paths: string[]) {
    return resolve(this.cwd, ...paths)
  }
}
