import { federation } from '@module-federation/vite'
import { type Context, Schema } from 'cormi'

export const name = 'mf'
export const inject = ['vite']

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
 * Module federation with @module-federation/vite: import modules of remote
 * apps at runtime, and expose modules of this one. The host is initialized in
 * the entry of the app, which has no index.html. During server rendering,
 * modules of remotes render nothing; the browser loads them.
 */
export function apply(ctx: Context, config: Config) {
  const remotes = Object.fromEntries(Object.entries(config.remotes).map(([key, value]) => {
    const remote = typeof value === 'string' ? { entry: value } : value
    const name = remote.name ?? key
    return [key, { type: 'module', name, entry: remote.entry, entryGlobalName: name, shareScope: 'default' }]
  }))
  // the server bundle cannot load remotes: their modules render nothing there,
  // and the browser loads them (e.g. through React.lazy)
  const SSR_STUB = '\0cormi-mf-ssr:'
  ctx.vite.plugin({
    name: 'cormi:mf-ssr',
    enforce: 'pre',
    resolveId(id, importer, options) {
      if (!options?.ssr) return
      if (Object.keys(remotes).some(key => id.startsWith(`${key}/`))) return SSR_STUB + id
    },
    load(id) {
      if (id.startsWith(SSR_STUB)) return 'export default function RemoteModule() { return null }\n'
    },
  })
  ctx.vite.plugin(env => env.ssr ? [] : federation({
    name: config.name,
    filename: config.filename,
    remotes,
    exposes: config.exposes,
    shared: config.shared,
    dts: config.dts,
    hostInitInjectLocation: 'entry',
  }) as any)

  if (!Object.keys(config.exposes).length) return
  ctx.inject(['server'], (ctx) => {
    // hosts import the remote entry and the exposed modules from another origin
    ctx.server.use((req, res, next) => {
      res._res.setHeader('access-control-allow-origin', '*')
      return next()
    })
    // assets imported by modules of the dev server point to this server
    const host = ['0.0.0.0', '::'].includes(ctx.server.host) ? 'localhost' : ctx.server.host
    ctx.vite.configure(config => ({
      ...config,
      server: { ...config.server, origin: `http://${host}:${ctx.server.port}` },
    }))
  })
}
