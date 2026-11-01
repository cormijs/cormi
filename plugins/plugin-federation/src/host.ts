import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as mf from '@cormi/plugin-mf'
import { type Context, readJSON, Schema } from 'cormi'
import { checkShared, getShared, REGISTRY_FILE, REMOTE_ENTRY, toContainerName } from './shared.ts'

export const name = 'federation-host'
export const inject = ['app', 'bundler']

export interface PackageEntry {
  /** URL the package is deployed at, where its `federation.json` is */
  url: string
  /** load the package with the app, whatever its manifest says */
  eager?: boolean
}

export interface Config {
  /** name of the host's container; defaults to the package name */
  name?: string
  /** the packages: URLs where they are deployed */
  packages: (string | PackageEntry)[]
  /** id of the route the top routes of packages are mounted below; defaults to the top layout */
  parent?: string
  /** dependencies of one instance for the page, besides react, react-dom, react-router, cordis and the Cormi runtime */
  shared: string[]
  /** let `localStorage['cormi:packages']` add packages or replace them by name; defaults to dev mode only */
  override?: boolean
}

export const Config: Schema<Config> = Schema.object({
  name: Schema.string().description('name of the host\'s container, defaults to the package name'),
  packages: Schema.array(Schema.union([
    String,
    Schema.object({
      url: Schema.string().required(),
      eager: Schema.boolean(),
    }),
  ])).default([]).description('URLs where the packages are deployed'),
  parent: Schema.string().description('id of the route the routes of packages are mounted below'),
  shared: Schema.array(String).default([]).description('dependencies of one instance for the page'),
  override: Schema.boolean().description('let localStorage["cormi:packages"] add or replace packages'),
})

/**
 * The host of a federated app. When the app starts in the browser, it reads
 * the list of packages (`packages.json`, a file of the build, so it can be
 * edited where the app is deployed), then their manifests: the routes of
 * every package are mounted at once, while its code loads when one of them
 * is visited. The host provides the shared singletons to the packages.
 */
export function apply(ctx: Context, config: Config) {
  const name = config.name ?? toContainerName(readJSON(ctx.cormi.resolve('package.json'))?.name ?? 'host')
  const registry = config.packages.map(entry => typeof entry === 'string' ? { url: entry } : entry)
  const { publicPath } = ctx.bundler.config

  const shared = getShared(config.shared)
  checkShared(ctx, shared)
  // modules are loaded by id at runtime: there are no types of remotes to download
  ctx.plugin(mf, { name, remotes: {}, exposes: {}, shared, filename: REMOTE_ENTRY, dts: false })
  ctx.app.entry('@cormi/plugin-federation/host/client', {
    registry: publicPath + REGISTRY_FILE,
    parent: config.parent,
    override: config.override ?? ctx.cormi.mode === 'dev',
  })

  ctx.on('build/after', async ({ outDir }) => {
    await writeFile(join(outDir, REGISTRY_FILE), JSON.stringify(registry, null, 2) + '\n')
  })
  // the build serves its own file, which may have been edited
  if (ctx.cormi.mode !== 'dev') return
  ctx.inject(['server'], (ctx) => {
    ctx.server.get(new URL(publicPath + REGISTRY_FILE, 'http://localhost').pathname, async () => Response.json(registry))
  })
}
