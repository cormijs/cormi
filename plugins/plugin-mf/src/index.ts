import { join } from 'node:path'
import { type Context, importPeer, Schema } from '@cormijs/cormi'
import type {} from '@cormijs/rsbuild'
import type {} from '@cormijs/vite'

export const name = 'mf'
export const inject = ['app', 'bundler']

export interface Remote {
  /** URL of the remote's entry, e.g. `http://localhost:8002/remoteEntry.js` */
  entry: string
  /** global name of the remote, defaults to its key */
  name?: string
}

export interface Shared {
  /** one instance for the page: the first loaded wins */
  singleton?: boolean
  /** semver range this app accepts, from its package.json by default */
  requiredVersion?: string
  /** bundled into the entry, instead of loaded on demand */
  eager?: boolean
}

export interface Config {
  /** name of this app as a federated container */
  name: string
  /** remotes this app imports from: `import('<key>/<expose>')` */
  remotes: Record<string, string | Remote>
  /** modules this app exposes: `{ './Button': './src/components/Button.tsx' }` */
  exposes: Record<string, string>
  /** dependencies shared with the other apps, e.g. react; with options by name */
  shared: string[] | Record<string, Shared>
  /** file name of this app's remote entry */
  filename: string
  /** generate the types of exposed modules, and download those of remotes */
  dts: boolean
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().required().description('name of this app as a federated container'),
  remotes: Schema.dict(Schema.union([String, Schema.object({ entry: Schema.string().required(), name: Schema.string() })])).default({}),
  exposes: Schema.dict(String).default({}).description('modules this app exposes'),
  shared: Schema.union([
    Schema.array(String),
    Schema.dict(Schema.object({
      singleton: Schema.boolean(),
      requiredVersion: Schema.string(),
      eager: Schema.boolean(),
    })),
  ]).default(['react', 'react-dom']),
  filename: Schema.string().default('remoteEntry.js'),
  dts: Schema.boolean().default(true).description('generate and download the types of exposed modules'),
})

/**
 * Module federation: import modules of remote apps at runtime, and expose
 * modules of this one, with `@module-federation/vite` or
 * `@module-federation/rsbuild-plugin`, which the app installs. During server
 * rendering, modules of remotes render nothing; the browser loads them.
 */
export function apply(ctx: Context, config: Config) {
  const remotes = Object.entries(config.remotes).map(([key, value]) => {
    const remote = typeof value === 'string' ? { entry: value } : value
    return { key, name: remote.name ?? key, entry: remote.entry }
  })
  const exposes = Object.keys(config.exposes).length > 0
  const isRemote = (id: string) => remotes.some(({ key }) => id.startsWith(`${key}/`))

  // the server bundle cannot load remotes: their modules render nothing there,
  // and the browser loads them (e.g. through React.lazy)
  const SSR_STUB = '\0cormi-mf-ssr:'
  const STUB = 'export default function RemoteModule() { return null }\n'
  if (remotes.length) ctx.app.file('plugin-mf/remote.ts', STUB)

  ctx.bundler.plugin({
    vite: env => [{
      name: 'cormi:mf-ssr',
      enforce: 'pre',
      resolveId(id, _importer, options) {
        if (options?.ssr && isRemote(id)) return SSR_STUB + id
      },
      load(id) {
        if (id.startsWith(SSR_STUB)) return STUB
      },
    }, env.ssr ? [] : importPeer('@module-federation/vite', '@cormijs/plugin-mf with vite', () => import('@module-federation/vite')).then(({ federation }) => federation({
      name: config.name,
      filename: config.filename,
      remotes: Object.fromEntries(remotes.map(({ key, name, entry }) => [key, { type: 'module', name, entry, entryGlobalName: name, shareScope: 'default' }])),
      exposes: config.exposes,
      shared: config.shared,
      dts: config.dts,
      // the app has no index.html
      hostInitInjectLocation: 'entry',
    }) as any)],
    rsbuild: async () => {
      const { pluginModuleFederation } = await importPeer('@module-federation/rsbuild-plugin', '@cormijs/plugin-mf with rsbuild', () => import('@module-federation/rsbuild-plugin'))
      return [pluginModuleFederation({
        name: config.name,
        filename: config.filename,
        remotes: Object.fromEntries(remotes.map(({ key, name, entry }) => [key, `${name}@${entry}`])),
        // a host is not a remote: the plugin configures remotes when `exposes` is set
        exposes: exposes ? config.exposes : undefined,
        shared: config.shared as any,
        // types of remotes that cannot be downloaded (e.g. from a dev server) keep their last version
        dts: config.dts && { generateTypes: true, consumeTypes: { deleteTypesFolder: false } },
        // the entry consumes the shared modules once they are loaded: no bootstrap module needed
        experiments: { asyncStartup: true },
      }, { environment: 'web' }), {
        name: 'cormi:mf',
        setup(api) {
          api.modifyEnvironmentConfig((config, { name, mergeEnvironmentConfig }) => {
            if (name !== 'web' || !exposes) return config
            return mergeEnvironmentConfig(config, {
              // the chunks of exposed modules load from this app, wherever the host is
              output: { assetPrefix: 'auto' },
              dev: { assetPrefix: 'auto' },
            })
          })
          api.modifyRspackConfig((config, { environment, rspack }) => {
            if (environment.name !== 'node' || !remotes.length) return
            const stub = join(ctx.app.dir, 'plugin-mf/remote.ts')
            config.plugins = [...config.plugins ?? [], new rspack.NormalModuleReplacementPlugin(/.*/, (resource) => {
              if (isRemote(resource.request)) resource.request = stub
            })]
          })
        },
      }]
    },
  })

  if (!exposes) return
  ctx.inject(['server'], (ctx) => {
    // hosts import the remote entry and the exposed modules from another origin
    ctx.server.use((req, res, next) => {
      res._res.setHeader('access-control-allow-origin', '*')
      return next()
    })
    // assets imported by modules of the Vite dev server point to this server
    ctx.inject(['vite'], (ctx) => {
      const host = ['0.0.0.0', '::'].includes(ctx.server.host) ? 'localhost' : ctx.server.host
      ctx.vite.configure(config => ({
        ...config,
        server: { ...config.server, origin: `http://${host}:${ctx.server.port}` },
      }))
    })
  })
}
