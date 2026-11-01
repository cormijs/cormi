import { Awaitable, Dict } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    bundler: Bundler
    renderer: Renderer
  }

  interface Events {
    /**
     * The bundles are about to be written.
     * @mode parallel
     */
    'build/before'(): Awaitable<void>
    /**
     * The client bundle (and the server bundle, if any) were written.
     * @mode parallel
     * @param result output directory and entry assets
     */
    'build/after'(result: Bundler.BuildResult): Awaitable<void>
  }
}

/** The assets of an entry, URLs with the public path. */
export interface EntryAssets {
  js: string[]
  css: string[]
  /** modules to preload */
  preload: string[]
}

/**
 * The bundler of the app (`ctx.bundler`), implemented by `@cormi/vite` and
 * other bundler plugins. The core and the neutral plugins only use this
 * contract; what is specific to one bundler stays on its own service
 * (`ctx.vite`), which plugins inject when they need it.
 */
export interface Bundler {
  /** the name of the implementation, e.g. `vite` */
  readonly name: string
  /** the version of the bundler, e.g. Vite's */
  readonly version?: string
  readonly config: Bundler.Config
  /** absolute path of the build output */
  readonly outDir: string
  /** whether the dev server can serve requests (always true outside dev mode) */
  readonly ready: boolean
  /**
   * Add a plugin to the bundler: `spec` has a plugin for each bundler it
   * supports, by the bundler's name, e.g. `{ vite: () => tailwindcss() }`.
   * Throws when it has none for this bundler.
   */
  plugin(spec: Bundler.Plugin): () => void
  /** Add an input to client builds, e.g. a page of a multi-page app. */
  input(name: string, file: string): () => void
  /** The assets of an entry module: the module itself in dev mode, its built chunks otherwise. */
  assets(file: string): Promise<EntryAssets>
  /**
   * Code that hot-replaces the namespace imports of a generated module, e.g.
   * the browser plugins of the entry: `imports` are the `[specifier, name]` of
   * `import * as name from specifier`, and `callback` the source of a function
   * called with the new module of each import, `undefined` if not updated.
   */
  hotAccept(imports: [specifier: string, name: string][], callback: string): string
  /** Prepare a document for the browser in dev mode: the HMR client, preambles of the UI framework. */
  transformDocument(url: string, html: string): Promise<string>
  /** Links to the stylesheets that server-rendered modules import (dev mode), before their scripts inject them. */
  devStyles?(entry: string): string
  /** Point the stack of an error thrown by a server module to its sources (dev mode). */
  fixStacktrace?(error: Error): void
  /** The server entry of the app: from the dev server in dev mode, from the build output otherwise. */
  loadServerEntry(): Promise<any>
  /** Write the client bundle and, if the app generates a server entry, the server bundle. */
  build(): Promise<Bundler.BuildResult>
}

export namespace Bundler {
  /**
   * What each bundler takes as a plugin, by its name; every bundler package
   * declares its own: `interface Plugins { vite: Vite.PluginInput }`.
   */
  export interface Plugins {}

  /**
   * A plugin for several bundlers. The variants of an unplugin fit in:
   * `{ vite: () => plugin.vite(options), rspack: () => plugin.rspack(options) }`.
   */
  export type Plugin = { [K in keyof Plugins]?: Plugins[K] }

  export interface Config {
    /** URL prefix of the assets */
    publicPath: string
    /** build output, relative to the app root */
    outDir: string
    alias: Dict<string>
    define: Dict<any>
    sourcemap: boolean
  }

  export interface BuildResult {
    outDir: string
    /** assets of the client entry, with `publicPath` */
    assets: EntryAssets
    /** assets of the inputs added with `input()`, by name */
    inputs: Record<string, EntryAssets>
    /** the server bundle, if the app has a server entry */
    server?: string
  }
}

/**
 * The UI framework of the app (`ctx.renderer`), implemented by `@cormi/react`
 * and other renderer plugins: it generates the browser and the server entry
 * from `ctx.app` and `ctx.router`. Plugins that only work with one framework
 * inject its own service (`ctx.react`).
 */
export interface Renderer {
  /** the name of the implementation, e.g. `react` */
  readonly name: string
  /** the version of the UI framework, e.g. React's */
  readonly version?: string
  /**
   * The exports of a route module that is not a script, e.g. those of the
   * `<script>` of a `.vue` file; `undefined` for scripts, which the router
   * reads itself.
   */
  routeExports?(file: string): Promise<string[] | undefined>
}
