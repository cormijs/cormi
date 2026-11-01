import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {} from '@cordisjs/plugin-server'
import { type Bundler, idle, Refresher, Schema, winPath } from '@cormijs/core'
import {
  createRsbuild,
  type ManifestData,
  mergeRsbuildConfig,
  type RsbuildConfig,
  type RsbuildDevServer,
  type RsbuildPlugin,
  type RsbuildPlugins,
  type Rspack,
  version,
} from '@rsbuild/core'
import { Context, Service } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import { type EntryAssets, getEntryAssets, getWorkspaceAliases, toAliases, toBrowserslist } from './config.ts'

export * from './config.ts'

declare module 'cordis' {
  interface Context {
    rsbuild: Rsbuild
  }
}

declare module '@cormijs/core' {
  namespace Bundler {
    interface Plugins {
      rsbuild: Rsbuild.PluginInput
      /** an Rspack plugin, e.g. the `rspack` variant of an unplugin */
      rspack: Rsbuild.RspackPluginInput
    }
  }
}

/** the path of Rsbuild's HMR socket, answered by Rsbuild on the http server */
const HMR_PATH = '/rsbuild-hmr'
/** prefixes of the environment variables that reach the browser */
const ENV_PREFIXES = ['CORMI_APP_', 'PUBLIC_']

/**
 * Rsbuild as the bundler of the app (`ctx.rsbuild`, and `ctx.bundler`).
 *
 * The app is built in two environments: `web` (the browser entry and the
 * inputs) and `node` (the server entry, when the app generates one). Plugins
 * add Rsbuild plugins with `plugin()` and edit the Rsbuild config with
 * `configure()`; both are effects of the calling plugin. In dev mode the dev
 * server is attached to `ctx.server` and restarted when registrations change.
 */
export class Rsbuild extends Service implements Bundler {
  static inject = ['app']

  readonly name = 'rsbuild'
  readonly version = version

  /** the dev server, in dev mode */
  devServer: RsbuildDevServer | undefined

  /** inputs of client builds besides the app's entry, by name */
  inputs = new Map<string, string>()
  private _plugins = new Set<Rsbuild.PluginInput>()
  private _configs = new Set<Rsbuild.ConfigInput>()
  private _devTask: Promise<RsbuildDevServer | undefined> | undefined
  private _serverEntry: Promise<any> | undefined
  /** the manifest of the web environment, as the dev server compiled it */
  private _manifest: ManifestData | undefined
  private _restart: Refresher | undefined
  /** whether registrations changed since the dev server's config was resolved */
  private _stale = false

  constructor(ctx: Context, public config: Rsbuild.Config) {
    super(ctx, 'rsbuild')
    ctx.provide('bundler', this)
  }

  /** whether the dev server can serve requests */
  get ready() {
    return this.ctx.cormi.mode !== 'dev' || !!this.devServer
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
   * Add an Rsbuild plugin. A function is called for every server or build, to
   * get fresh plugin instances. As `ctx.bundler.plugin()`, takes the plugin of
   * each bundler by name, and uses `rsbuild`, or else `rspack`.
   */
  plugin(plugin: Rsbuild.PluginInput | Bundler.Plugin) {
    if (!isBundlerPlugin(plugin)) return this._register(this._plugins, plugin, 'ctx.rsbuild.plugin()')
    if (plugin.rsbuild) return this._register(this._plugins, plugin.rsbuild, 'ctx.bundler.plugin()')
    const rspack = plugin.rspack
    if (rspack) {
      return this._register(this._plugins, (env: Rsbuild.ConfigEnv) => rspackPlugin(typeof rspack === 'function' ? rspack(env) : rspack), 'ctx.bundler.plugin()')
    }
    const names = Object.keys(plugin)
    throw new Error(`the plugin supports ${names.length ? names.join(', ') : 'no bundler'}, not rsbuild`)
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
    }, `ctx.rsbuild.input(${JSON.stringify(name)})`)
  }

  /** Merge an object into the Rsbuild config, or edit it with a function. */
  configure(config: Rsbuild.ConfigInput) {
    return this._register(this._configs, config, 'ctx.rsbuild.configure()')
  }

  /** The Rsbuild config: defaults, then `config.rsbuild`, then registrations in order. */
  async resolveConfig(env: Rsbuild.ConfigEnv): Promise<RsbuildConfig> {
    let config = mergeRsbuildConfig(this._defaults(env), this.config.rsbuild ?? {})
    for (const plugin of this._plugins) {
      config.plugins = [...config.plugins ?? [], (typeof plugin === 'function' ? plugin(env) : plugin) as RsbuildPlugins[number]]
    }
    for (const input of this._configs) {
      config = typeof input === 'function' ? (await input(config, env)) ?? config : mergeRsbuildConfig(config, input)
    }
    return config
  }

  /** The assets of an entry module: its chunks, from the dev server in dev mode, from the build output otherwise. */
  async assets(file: string): Promise<EntryAssets> {
    const name = this._entryName(file)
    if (this.ctx.cormi.mode === 'dev') {
      const server = await this._devTask
      // the manifest is generated as the web environment compiles
      await server?.environments.web.getStats()
      return getEntryAssets(this._manifest, name, this.config.publicPath)
    }
    const manifest = JSON.parse(await readFile(join(this.outDir, 'manifest.json'), 'utf8'))
    return getEntryAssets(manifest, name, this.config.publicPath)
  }

  /**
   * `import.meta.webpackHot` rebinds the imports of the updated modules
   * before calling back: the new ones are those whose binding changed.
   */
  hotAccept(imports: [string, string][], callback: string) {
    const names = `[${imports.map(([, name]) => name).join(', ')}]`
    return [
      `if (import.meta.webpackHot) {`,
      `  let previous = ${names}`,
      `  import.meta.webpackHot.accept(${JSON.stringify(imports.map(([specifier]) => specifier))}, () => {`,
      `    const current = ${names}`,
      `    ;(${callback})(current.map((module, index) => module === previous[index] ? undefined : module))`,
      `    previous = current`,
      `  })`,
      `}`,
    ].join('\n')
  }

  /** Rsbuild puts its HMR client into the bundle: documents stay as they are. */
  async transformDocument(_url: string, html: string) {
    return html
  }

  /** The server entry of the app: from the dev server in dev mode, from the build output otherwise. */
  async loadServerEntry(): Promise<any> {
    if (this.ctx.cormi.mode === 'dev') {
      const server = await this._devTask
      if (!server) throw new Error('the dev server is not running')
      if (!server.environments.node) throw new Error('the app has no server entry')
      return server.environments.node.loadBundle('server')
    }
    return this._serverEntry ??= import(pathToFileURL(join(this.outDir, 'server/server.mjs')).href)
  }

  /** Write the client bundle and, if the app generates a server entry, the server bundle. */
  async build(): Promise<Rsbuild.BuildResult> {
    const app = this.ctx.app
    await this.ctx.parallel('build/before')
    await app.flush()
    const outDir = this.outDir
    await rm(outDir, { recursive: true, force: true })

    const rsbuild = await createRsbuild({ cwd: this.ctx.cormi.cwd, config: await this.resolveConfig({ command: 'build' }), loadEnv: false })
    const { close } = await rsbuild.build()
    await close()

    const manifest: ManifestData = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
    const assets = getEntryAssets(manifest, 'cormi', this.config.publicPath)
    const inputs = Object.fromEntries([...this.inputs.keys()].map(name => [name, getEntryAssets(manifest, name, this.config.publicPath)]))
    const server = existsSync(app.serverEntry) ? join(outDir, 'server/server.mjs') : undefined
    const result: Rsbuild.BuildResult = { outDir, assets, inputs, server }
    await this.ctx.parallel('build/after', result)
    return result
  }

  private _entryName(file: string) {
    const path = winPath(file)
    if (path === winPath(this.ctx.app.clientEntry)) return 'cormi'
    for (const [name, input] of this.inputs) {
      if (input === path) return name
    }
    throw new Error(`${relative(this.ctx.cormi.cwd, file)} is not an entry of the app`)
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

  private _defaults(env: Rsbuild.ConfigEnv): RsbuildConfig {
    const { cormi, app } = this.ctx
    const { paths } = cormi
    const workspace = this.ctx.get('workspace')
    const { publicPath } = this.config
    const outDir = this.outDir
    const port = this.ctx.get('server')?.port
    const define: Dict<string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!ENV_PREFIXES.some(prefix => key.startsWith(prefix))) continue
      define[`import.meta.env.${key}`] = JSON.stringify(value)
      define[`process.env.${key}`] = JSON.stringify(value)
    }
    const environments: RsbuildConfig['environments'] = {
      web: {
        source: {
          entry: { cormi: app.clientEntry, ...Object.fromEntries(this.inputs) },
          define: { 'import.meta.env.SSR': 'false' },
        },
        resolve: { alias: getWorkspaceAliases(workspace, ['browser', 'import', 'module']) },
        output: {
          target: 'web',
          distPath: { root: outDir },
          manifest: {
            filename: 'manifest.json',
            generate: ({ manifestData }) => {
              this._manifest = manifestData
              return manifestData
            },
          },
        },
      },
    }
    if (existsSync(app.serverEntry)) {
      environments.node = {
        source: {
          entry: { server: app.serverEntry },
          define: { 'import.meta.env.SSR': 'true' },
        },
        resolve: { alias: getWorkspaceAliases(workspace, ['node', 'import']) },
        output: {
          target: 'node',
          // Rsbuild runs ES module bundles in dev only with --experimental-vm-modules; the
          // CommonJS one requires the dependencies, ES modules too (Node 22.12)
          module: env.command === 'build',
          distPath: { root: join(outDir, 'server') },
          filename: { js: env.command === 'build' ? '[name].mjs' : '[name].cjs' },
          filenameHash: false,
          // the dependencies of the app are imported from its node_modules: one instance of the
          // framework; the workspace packages are bundled from their sources
          autoExternal: { exclude: Object.keys(workspace?.packages ?? {}) },
          // styles are the web environment's
          emitCss: false,
        },
      }
    }
    return {
      root: cormi.cwd,
      mode: env.command === 'build' ? 'production' : 'development',
      logLevel: env.command === 'build' ? 'info' : 'warn',
      source: { define: { ...define, ...this.config.define } },
      resolve: {
        alias: {
          ...toAliases(this.config.alias),
          '@@': winPath(paths.tmp),
          '@': winPath(paths.src),
        },
      },
      output: {
        assetPrefix: publicPath,
        cleanDistPath: false,
        sourceMap: this.config.sourcemap ? { js: 'source-map', css: true } : undefined,
        overrideBrowserslist: toBrowserslist(this.config.targets),
      },
      dev: {
        assetPrefix: publicPath,
        cliShortcuts: false,
        progressBar: false,
        // server-rendered pages link the css of their routes, which must be compiled upfront
        lazyCompilation: false,
        // the HMR client connects to ctx.server, also from pages of other apps (module federation)
        client: { path: HMR_PATH, ...port && { port } },
      },
      server: {
        middlewareMode: true,
        printUrls: false,
        htmlFallback: false,
        historyApiFallback: false,
        publicDir: existsSync(paths.public) ? { name: paths.public } : false,
      },
      // the documents are rendered by ctx.html
      tools: { htmlPlugin: false },
      environments,
    }
  }

  /** Run the dev server on the http server of `ctx.server`. */
  private _serve(ctx: Context) {
    let task: Promise<RsbuildDevServer | undefined> = Promise.resolve(undefined)
    // the environments of the dev server: the server entry is generated or removed as the app changes
    let hasServerEntry: boolean | undefined

    const restart = () => this._devTask = task = task.then(async (previous) => {
      // registrations made while the running server started are in its config
      if (previous && !this._stale) return previous
      if (previous) ctx.logger('rsbuild').info('restarting the dev server')
      await previous?.close()
      this.devServer = undefined
      this._manifest = undefined
      // plugins loading right now may still register Rsbuild plugins
      await idle(ctx)
      // the entries must exist when Rsbuild compiles them
      await ctx.app.flush()
      // the config below includes every registration so far
      this._stale = false
      hasServerEntry = existsSync(ctx.app.serverEntry)
      const rsbuild = await createRsbuild({ cwd: ctx.cormi.cwd, config: await this.resolveConfig({ command: 'serve' }), loadEnv: false })
      const server = await rsbuild.createDevServer()
      server.connectWebSocket({ server: ctx.server._http })
      await server.afterListen()
      this.devServer = server
      return server
    }).catch((error) => {
      ctx.logger('rsbuild').error(error)
      return undefined
    })

    ctx.effect(() => {
      this._restart = new Refresher(async () => {
        await restart()
      }, 100, error => ctx.logger('rsbuild').error(error))
      void restart()
      return async () => {
        this._restart?.dispose()
        this._restart = undefined
        await (await task)?.close()
        this.devServer = undefined
        this._devTask = undefined
      }
    }, 'rsbuild dev server')

    // a server entry appears or goes away; workspace packages are resolved by aliases
    ctx.on('app/generate', () => {
      if (hasServerEntry === undefined || existsSync(ctx.app.serverEntry) === hasServerEntry) return
      this._invalidate()
    })
    ctx.on('workspace/update', () => this._invalidate())

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

    // the HMR socket is accepted by Rsbuild's own upgrade listener
    ctx.on('server/upgrade', (req, next) => {
      if (req.path === HMR_PATH) return Promise.resolve()
      return next()
    })
  }
}

// an Rsbuild plugin has a name; the plugins of several bundlers are keyed by bundler
function isBundlerPlugin(value: Rsbuild.PluginInput | Bundler.Plugin): value is Bundler.Plugin {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'then' in value) return false
  return !('name' in value)
}

/** An Rspack plugin as an Rsbuild plugin. */
function rspackPlugin(plugin: Rspack.RspackPluginInstance): RsbuildPlugin {
  return {
    name: 'cormi:rspack-plugin',
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins = [...config.plugins ?? [], plugin]
      })
    },
  }
}

export namespace Rsbuild {
  export interface ConfigEnv {
    command: 'serve' | 'build'
  }

  /** an Rsbuild plugin, typed strictly (Rsbuild takes `setup(api: any)` from plugins of older versions) */
  export type PluginOption = Awaitable<RsbuildPlugin | false | null | undefined | PluginOption[]>
  export type PluginInput = PluginOption | ((env: ConfigEnv) => PluginOption)
  export type RspackPluginInput = Rspack.RspackPluginInstance | ((env: ConfigEnv) => Rspack.RspackPluginInstance)
  export type ConfigInput = RsbuildConfig | ((config: RsbuildConfig, env: ConfigEnv) => Awaitable<RsbuildConfig | void>)

  export type BuildResult = Bundler.BuildResult

  export interface Config {
    /** URL prefix of the assets */
    publicPath: string
    /** build output, relative to the app root */
    outDir: string
    alias: Dict<string>
    define: Dict<any>
    sourcemap: boolean
    /** browsers to build for: `{ chrome: 87, safari: 14 }` or browserslist queries */
    targets?: string[] | Record<string, number | string | false>
    /** raw Rsbuild config, merged over the defaults */
    rsbuild?: RsbuildConfig
  }

  export const Config: Schema<Config> = Schema.object({
    publicPath: Schema.string().default('/').description('URL prefix of the assets'),
    outDir: Schema.string().default('dist').description('build output, relative to the app root'),
    alias: Schema.dict(String).default({}),
    define: Schema.dict(Schema.any()).default({}),
    sourcemap: Schema.boolean().default(false),
    targets: Schema.union([Schema.array(String), Schema.dict(Schema.union([Number, String, Schema.const(false)]))]).description('browsers to build for'),
    rsbuild: Schema.any().description('raw Rsbuild config, merged over the defaults'),
  })
}

export default Rsbuild
