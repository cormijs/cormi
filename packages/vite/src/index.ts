import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {} from '@cordisjs/plugin-server'
import { type Bundler, idle, Refresher, Schema, winPath, type Workspace } from '@cormi/core'
import { Context, Service } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import { build, createServer, type InlineConfig, type Manifest, mergeConfig, type PluginOption, version, type ViteDevServer } from 'vite'
import { type EntryAssets, getEntryAssets, toAliases } from './config.ts'

export * from './config.ts'

declare module 'cordis' {
  interface Context {
    vite: Vite
  }
}

const CSS_RE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/

/**
 * Vite as the bundler of the app (`ctx.vite`, and `ctx.bundler`).
 *
 * Plugins add Vite plugins with `plugin()` and edit the Vite config with
 * `configure()`; both are effects of the calling plugin. In dev mode the dev
 * server is attached to `ctx.server` and restarted when registrations change.
 * `build()` writes the client bundle and, when the app generates a server
 * entry, the server bundle.
 */
export class Vite extends Service implements Bundler {
  static inject = ['app']

  readonly name = 'vite'
  readonly version = version

  /** the dev server, in dev mode */
  devServer: ViteDevServer | undefined

  private _devTask: Promise<ViteDevServer | undefined> | undefined
  private _serverEntry: Promise<any> | undefined
  /** inputs of client builds besides the app's entry, by name */
  inputs = new Map<string, string>()
  private _plugins = new Set<Vite.PluginInput>()
  private _configs = new Set<Vite.ConfigInput>()
  private _restart: Refresher | undefined
  /** whether registrations changed since the dev server's config was resolved */
  private _stale = false

  constructor(ctx: Context, public config: Vite.Config) {
    super(ctx, 'vite')
    ctx.provide('bundler', this)
  }

  /** whether the dev server can serve requests */
  get ready() {
    return this.ctx.cormi.mode !== 'dev' || !!this.devServer
  }

  /** The assets of an entry module: the module itself in dev mode, its built chunks otherwise. */
  async assets(file: string): Promise<EntryAssets> {
    const entry = winPath(relative(this.ctx.cormi.cwd, file))
    if (this.ctx.cormi.mode === 'dev') return { js: [this.config.publicPath + entry], css: [], preload: [] }
    const manifest: Manifest = JSON.parse(await readFile(join(this.outDir, '.vite/manifest.json'), 'utf8'))
    return getEntryAssets(manifest, entry, this.config.publicPath)
  }

  /** `import.meta.hot` passes the new modules to the callback. */
  hotAccept(imports: [string, string][], callback: string) {
    return [
      `if (import.meta.hot) {`,
      `  import.meta.hot.accept(${JSON.stringify(imports.map(([specifier]) => specifier))}, ${callback})`,
      `}`,
    ].join('\n')
  }

  /** Add the HMR client and the preambles of plugins to a document (dev mode); waits for a restarting server. */
  async transformDocument(url: string, html: string) {
    const server = await this._devTask
    return server ? server.transformIndexHtml(url, html) : html
  }

  /**
   * Links to the stylesheets imported by the modules the server has rendered
   * (dev mode). Vite injects styles from JavaScript; linking them in the
   * document avoids a flash of unstyled content before the app hydrates.
   */
  devStyles(entry: string) {
    const server = this.devServer
    if (!server) return ''
    const styles = new Set<string>()
    const seen = new Set<unknown>()
    const visit = (module: ReturnType<typeof server.environments.ssr.moduleGraph.getModuleById>) => {
      if (!module || seen.has(module)) return
      seen.add(module)
      if (CSS_RE.test(module.url)) styles.add(module.url)
      for (const imported of module.importedModules) visit(imported)
    }
    visit(server.environments.ssr.moduleGraph.getModuleById(entry))
    return [...styles].map(url => `<link rel="stylesheet" href="${url}?direct" data-cormi-dev>`).join('\n')
  }

  /** Point the stack of an error thrown by a server module to its sources. */
  fixStacktrace(error: Error) {
    this.devServer?.ssrFixStacktrace(error)
  }

  /** absolute path of the build output */
  get outDir() {
    return this.ctx.cormi.resolve(this.config.outDir)
  }

  [Service.init]() {
    if (this.ctx.cormi.mode !== 'dev') return
    this.ctx.inject(['server'], ctx => this._serve(ctx))
  }

  /**
   * Add a Vite plugin. A function is called for every server or build, to get
   * fresh plugin instances. As `ctx.bundler.plugin()`, takes the plugin of
   * each bundler by name, and uses `vite`.
   */
  plugin(plugin: Vite.PluginInput | Bundler.Plugin) {
    if (!isBundlerPlugin(plugin)) return this._register(this._plugins, plugin, 'ctx.vite.plugin()')
    if (!plugin.vite) {
      const names = Object.keys(plugin)
      throw new Error(`the plugin supports ${names.length ? names.join(', ') : 'no bundler'}, not vite`)
    }
    return this._register(this._plugins, plugin.vite, 'ctx.bundler.plugin()')
  }

  /** Add an input to client builds (e.g. a page of a multi-page app); its assets are in `BuildResult.inputs`. */
  input(name: string, file: string) {
    return this.ctx.effect(() => {
      if (this.inputs.has(name)) throw new Error(`input ${name} is registered twice`)
      this.inputs.set(name, winPath(file))
      this._invalidate()
      return () => {
        this.inputs.delete(name)
        this._invalidate()
      }
    }, `ctx.vite.input(${JSON.stringify(name)})`)
  }

  /** Merge an object into the Vite config, or edit it with a function. */
  configure(config: Vite.ConfigInput) {
    return this._register(this._configs, config, 'ctx.vite.configure()')
  }

  /** The Vite config: defaults, then `config.vite`, then registrations in order. */
  async resolveConfig(env: Vite.ConfigEnv): Promise<InlineConfig> {
    let config = mergeConfig(this._defaults(env), this.config.vite ?? {})
    for (const plugin of this._plugins) {
      config.plugins = [...config.plugins ?? [], typeof plugin === 'function' ? plugin(env) : plugin]
    }
    for (const input of this._configs) {
      config = typeof input === 'function' ? (await input(config, env)) ?? config : mergeConfig(config, input)
    }
    return config
  }

  /** Load a module through the dev server (dev mode only); waits for a restarting server. */
  async ssrLoadModule(file: string) {
    const server = await this._devTask
    if (!server) throw new Error('the dev server is not running')
    return server.ssrLoadModule(file)
  }

  /** The server entry of the app: from the dev server in dev mode, from the build output otherwise. */
  loadServerEntry(): Promise<any> {
    if (this.ctx.cormi.mode === 'dev') return this.ssrLoadModule(this.ctx.app.serverEntry)
    return this._serverEntry ??= import(/* @vite-ignore */ pathToFileURL(join(this.outDir, 'server/server.mjs')).href)
  }

  /** Write the client bundle and, if the app generates a server entry, the server bundle. */
  async build(): Promise<Vite.BuildResult> {
    const app = this.ctx.app
    await this.ctx.parallel('build/before')
    await app.flush()
    const { cwd } = this.ctx.cormi
    const outDir = this.outDir
    await rm(outDir, { recursive: true, force: true })

    const client = await this.resolveConfig({ command: 'build', ssr: false })
    await build(mergeConfig(client, {
      build: {
        outDir,
        manifest: true,
        emptyOutDir: false,
        // the entry exports the lifecycles of the app, for hosts that mount it
        rollupOptions: { input: { cormi: app.clientEntry, ...Object.fromEntries(this.inputs) }, preserveEntrySignatures: 'exports-only' },
      },
    } satisfies InlineConfig))
    const manifestPath = join(outDir, '.vite/manifest.json')
    const manifest: Manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const assets = getEntryAssets(manifest, winPath(relative(cwd, app.clientEntry)), this.config.publicPath)
    const inputs = Object.fromEntries([...this.inputs].map(([name, file]) => {
      return [name, getEntryAssets(manifest, winPath(relative(cwd, file)), this.config.publicPath)]
    }))

    let server: string | undefined
    if (existsSync(app.serverEntry)) {
      const ssr = await this.resolveConfig({ command: 'build', ssr: true })
      await build(mergeConfig(ssr, {
        build: {
          ssr: app.serverEntry,
          outDir: join(outDir, 'server'),
          emptyOutDir: true,
          copyPublicDir: false,
          rollupOptions: {
            output: {
              entryFileNames: 'server.mjs',
              chunkFileNames: 'chunks/[name]-[hash].mjs',
            },
          },
        },
      } satisfies InlineConfig))
      server = join(outDir, 'server/server.mjs')
    }

    const result: Vite.BuildResult = { outDir, assets, inputs, server }
    await this.ctx.parallel('build/after', result)
    return result
  }

  private _register<T>(set: Set<T>, value: T, label: string) {
    return this.ctx.effect(() => {
      set.add(value)
      this._invalidate()
      return () => {
        set.delete(value)
        this._invalidate()
      }
    }, label)
  }

  private _invalidate() {
    this._stale = true
    this._restart?.schedule()
  }

  private _defaults(env: Vite.ConfigEnv): InlineConfig {
    const { cormi, app } = this.ctx
    const { paths } = cormi
    return {
      configFile: false,
      root: cormi.cwd,
      base: this.config.publicPath,
      mode: cormi.env,
      clearScreen: false,
      logLevel: env.command === 'build' ? 'info' : 'warn',
      envPrefix: ['VITE_', 'CORMI_APP_'],
      publicDir: existsSync(paths.public) ? paths.public : false,
      cacheDir: join(cormi.cwd, 'node_modules/.cache/vite'),
      define: this.config.define,
      resolve: {
        alias: [
          ...toAliases(this.config.alias),
          { find: /^@@\//, replacement: winPath(paths.tmp) + '/' },
          { find: /^@\//, replacement: winPath(paths.src) + '/' },
        ],
      },
      css: { devSourcemap: true },
      optimizeDeps: {
        entries: [app.clientEntry, ...this.inputs.values()],
      },
      server: { fs: { strict: false } },
      plugins: [workspacePlugin(this.ctx.get('workspace'))],
      // one instance of the framework, shared by the server entry, the pages and the runtime plugins
      ssr: { external: ['cormi'] },
      build: {
        assetsDir: 'static',
        sourcemap: this.config.sourcemap,
        target: toBuildTarget(this.config.targets),
      },
    }
  }

  /** Run the dev server on the http server of `ctx.server`. */
  private _serve(ctx: Context) {
    let task: Promise<ViteDevServer | undefined> = Promise.resolve(undefined)

    const restart = () => this._devTask = task = task.then(async (previous) => {
      // registrations made while the running server started are in its config
      if (previous && !this._stale) return previous
      if (previous) ctx.logger('vite').info('restarting the dev server')
      await previous?.close()
      this.devServer = undefined
      // plugins loading right now may still register Vite plugins
      await idle(ctx)
      // the entry must exist when Vite scans it for dependencies
      await ctx.app.flush()
      // the config below includes every registration so far
      this._stale = false
      const config = await this.resolveConfig({ command: 'serve' })
      const server = await createServer(mergeConfig(config, {
        appType: 'custom',
        server: { middlewareMode: true, hmr: { server: ctx.server._http } },
      } satisfies InlineConfig))
      this.devServer = server
      return server
    }).catch((error) => {
      ctx.logger('vite').error(error)
      return undefined
    })

    ctx.effect(() => {
      this._restart = new Refresher(async () => {
        await restart()
      }, 100, error => ctx.logger('vite').error(error))
      void restart()
      return async () => {
        this._restart?.dispose()
        this._restart = undefined
        await (await task)?.close()
        this.devServer = undefined
        this._devTask = undefined
      }
    }, 'vite dev server')

    // connect-style middlewares: handled when the response ends, passed on when `next()` is called
    ctx.server.use(async (req, res, next) => {
      const server = await task
      if (!server) return next()
      const response = res._res
      return new Promise<void>((resolve, reject) => {
        const done = () => resolve()
        response.once('finish', done)
        response.once('close', done)
        server.middlewares(req._req, response, (error?: unknown) => {
          response.off('finish', done)
          response.off('close', done)
          if (error) return reject(error)
          next().then(resolve, reject)
        })
      })
    })

    // the HMR websocket is accepted by Vite's own upgrade listener
    ctx.on('server/upgrade', (req, next) => {
      const protocol = req.headers.get('sec-websocket-protocol')
      if (protocol === 'vite-hmr' || protocol === 'vite-ping') return Promise.resolve()
      return next()
    })
  }
}

/**
 * Packages of the app's workspace (`plugins/*`) resolve to their sources,
 * in the browser and on the server, as they do in Node.
 */
function workspacePlugin(workspace: Workspace | undefined): PluginOption {
  return {
    name: 'cormi:workspace',
    enforce: 'pre',
    resolveId(id, _importer, options) {
      if (!workspace || !Object.keys(workspace.packages).length) return
      return workspace.resolve(id, options?.ssr ? ['node', 'import'] : ['browser', 'import', 'module'])
    },
  }
}

// a Vite plugin has a name; the plugins of several bundlers are keyed by bundler
function isBundlerPlugin(value: Vite.PluginInput | Bundler.Plugin): value is Bundler.Plugin {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'then' in value) return false
  return !('name' in value)
}

/** umi's `{ chrome: 87, safari: 14 }` or esbuild targets (`['chrome87', 'es2020']`); Vite's default otherwise. */
export function toBuildTarget(targets: Vite.Config['targets']) {
  if (!targets) return
  if (Array.isArray(targets)) return targets.length ? targets : undefined
  const list = Object.entries(targets).filter(([, version]) => version !== false).map(([browser, version]) => `${browser}${version}`)
  return list.length ? list : undefined
}

declare module '@cormi/core' {
  namespace Bundler {
    interface Plugins {
      vite: Vite.PluginInput
    }
  }
}

export namespace Vite {
  export interface ConfigEnv {
    command: 'serve' | 'build'
    /** building the server bundle */
    ssr?: boolean
  }

  export type PluginInput = PluginOption | ((env: ConfigEnv) => PluginOption)
  export type ConfigInput = InlineConfig | ((config: InlineConfig, env: ConfigEnv) => Awaitable<InlineConfig | void>)

  export type BuildResult = Bundler.BuildResult

  export interface Config {
    /** URL prefix of the assets */
    publicPath: string
    /** build output, relative to the app root */
    outDir: string
    alias: Dict<string>
    define: Dict<any>
    sourcemap: boolean
    /** browsers to build for: `{ chrome: 87, safari: 14 }` or esbuild targets */
    targets?: string[] | Record<string, number | string | false>
    /** raw Vite config, merged over the defaults */
    vite?: InlineConfig
  }

  export const Config: Schema<Config> = Schema.object({
    publicPath: Schema.string().default('/').description('URL prefix of the assets'),
    outDir: Schema.string().default('dist').description('build output, relative to the app root'),
    alias: Schema.dict(String).default({}),
    define: Schema.dict(Schema.any()).default({}),
    sourcemap: Schema.boolean().default(false),
    targets: Schema.union([Schema.array(String), Schema.dict(Schema.union([Number, String, Schema.const(false)]))]).description('browsers to build for'),
    vite: Schema.any().description('raw Vite config, merged over the defaults'),
  })
}

export default Vite
