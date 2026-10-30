import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {} from '@cordisjs/plugin-loader'
import type {} from '@cordisjs/plugin-server'
import { idle, Refresher, Schema, winPath } from '@cormi/core'
import { Context, Service } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import { build, createServer, type InlineConfig, type Manifest, mergeConfig, type PluginOption, type ViteDevServer } from 'vite'
import { type EntryAssets, getEntryAssets, toAliases } from './config.ts'

export * from './config.ts'

declare module 'cordis' {
  interface Context {
    vite: Vite
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
    'build/after'(result: Vite.BuildResult): Awaitable<void>
  }
}

/**
 * The bundler of the app (`ctx.vite`).
 *
 * Plugins add Vite plugins with `plugin()` and edit the Vite config with
 * `configure()`; both are effects of the calling plugin. In dev mode the dev
 * server is attached to `ctx.server` and restarted when registrations change.
 * `build()` writes the client bundle and, when the app generates a server
 * entry, the server bundle.
 */
export class Vite extends Service {
  static inject = ['app']

  /** the dev server, in dev mode */
  devServer: ViteDevServer | undefined

  private _devTask: Promise<ViteDevServer | undefined> | undefined
  private _serverEntry: Promise<any> | undefined
  private _plugins = new Set<Vite.PluginInput>()
  private _configs = new Set<Vite.ConfigInput>()
  private _restart: Refresher | undefined

  constructor(ctx: Context, public config: Vite.Config) {
    super(ctx, 'vite')
  }

  /** absolute path of the build output */
  get outDir() {
    return this.ctx.cormi.resolve(this.config.outDir)
  }

  [Service.init]() {
    if (this.ctx.cormi.mode !== 'dev') return
    // start once the plugin tree has loaded, so plugins can register first
    this.ctx.inject({ server: null, loader: { await: true } }, ctx => this._serve(ctx))
  }

  /** Add a Vite plugin. A function is called for every server or build, to get fresh plugin instances. */
  plugin(plugin: Vite.PluginInput) {
    return this._register(this._plugins, plugin, 'ctx.vite.plugin()')
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
    return this._serverEntry ??= import(pathToFileURL(join(this.outDir, 'server/server.mjs')).href)
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
        rollupOptions: { input: { cormi: app.clientEntry } },
      },
    } satisfies InlineConfig))
    const manifestPath = join(outDir, '.vite/manifest.json')
    const manifest: Manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const assets = getEntryAssets(manifest, winPath(relative(cwd, app.clientEntry)), this.config.publicPath)

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

    const result: Vite.BuildResult = { outDir, assets, server }
    await this.ctx.parallel('build/after', result)
    return result
  }

  private _register<T>(set: Set<T>, value: T, label: string) {
    return this.ctx.effect(() => {
      set.add(value)
      this._restart?.schedule()
      return () => {
        set.delete(value)
        this._restart?.schedule()
      }
    }, label)
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
        // resolved from the app root: only packages the app depends on itself
        dedupe: ['react', 'react-dom'],
      },
      css: { devSourcemap: true },
      optimizeDeps: { entries: [app.clientEntry] },
      server: { fs: { strict: false } },
      build: {
        assetsDir: 'static',
        sourcemap: this.config.sourcemap,
        target: 'es2022',
      },
    }
  }

  /** Run the dev server on the http server of `ctx.server`. */
  private _serve(ctx: Context) {
    let task: Promise<ViteDevServer | undefined> = Promise.resolve(undefined)

    const restart = () => this._devTask = task = task.then(async (previous) => {
      await previous?.close()
      this.devServer = undefined
      // plugins loading right now may still register Vite plugins
      await idle(ctx)
      // the config below includes every registration so far
      this._restart?.dispose()
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
        ctx.logger('vite').info('restarting the dev server')
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

export namespace Vite {
  export interface ConfigEnv {
    command: 'serve' | 'build'
    /** building the server bundle */
    ssr?: boolean
  }

  export type PluginInput = PluginOption | ((env: ConfigEnv) => PluginOption)
  export type ConfigInput = InlineConfig | ((config: InlineConfig, env: ConfigEnv) => Awaitable<InlineConfig | void>)

  export interface BuildResult {
    outDir: string
    /** assets of the client entry, with `publicPath` */
    assets: EntryAssets
    /** the server bundle, if the app has a server entry */
    server?: string
  }

  export interface Config {
    /** URL prefix of the assets */
    publicPath: string
    /** build output, relative to the app root */
    outDir: string
    alias: Dict<string>
    define: Dict<any>
    sourcemap: boolean
    /** raw Vite config, merged over the defaults */
    vite?: InlineConfig
  }

  export const Config: Schema<Config> = Schema.object({
    publicPath: Schema.string().default('/').description('URL prefix of the assets'),
    outDir: Schema.string().default('dist').description('build output, relative to the app root'),
    alias: Schema.dict(String).default({}),
    define: Schema.dict(Schema.any()).default({}),
    sourcemap: Schema.boolean().default(false),
    vite: Schema.any().description('raw Vite config, merged over the defaults'),
  })
}

export default Vite
