import type { Server } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { winPath, type Workspace } from '@cormijs/core'
import react from '@vitejs/plugin-react'
import { createServer, type ViteDevServer } from 'vite'

/** The console package: the dependencies of the console (React, its client) resolve from here. */
export const ROOT = winPath(fileURLToPath(new URL('..', import.meta.url)))

/** The console's own browser modules. */
export const CLIENT = winPath(join(ROOT, 'client'))

/** The URL of the generated entry, below the console's path. */
export const ENTRY_URL = '/@cormi-console/entry.tsx'

export interface ConsoleServerOptions {
  /** the path of the console, ending with `/` */
  base: string
  /** the app root */
  cwd: string
  /** the http server of the app, which the HMR socket shares */
  http: Server
  workspace?: Workspace
  /** the code of the entry */
  entry: () => string
}

/**
 * The console's own Vite dev server, whatever the app's bundler and UI
 * framework: the console is a React app. Its entry is a module of the app
 * root, so that the console pages of the app's plugins resolve from there.
 */
export async function createConsoleServer(options: ConsoleServerOptions) {
  const entryId = winPath(join(options.cwd, 'node_modules/.cormi-console/entry.tsx'))
  const server = await createServer({
    configFile: false,
    root: ROOT,
    base: options.base,
    mode: 'development',
    logLevel: 'warn',
    clearScreen: false,
    appType: 'custom',
    publicDir: false,
    cacheDir: join(options.cwd, 'node_modules/.cache/cormi-console'),
    // one React, the console's, also for the console pages of plugins
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: [join(CLIENT, 'index.tsx'), join(CLIENT, 'builtin/index.tsx')] },
    server: { middlewareMode: true, hmr: { server: options.http }, fs: { strict: false } },
    plugins: [react(), {
      name: 'cormi:console',
      enforce: 'pre',
      resolveId(id) {
        if (id === ENTRY_URL) return entryId
        // console pages of workspace packages, from their sources
        if (options.workspace && Object.keys(options.workspace.packages).length) {
          return options.workspace.resolve(id, ['browser', 'import', 'module'])
        }
      },
      load(id) {
        if (id === entryId) return options.entry()
      },
    }],
  })
  return Object.assign(server, {
    /** The entry changed: browsers load the console again. */
    reloadEntry() {
      const graph = server.environments.client.moduleGraph
      const module = graph.getModuleById(entryId)
      if (module) graph.invalidateModule(module)
      server.environments.client.hot.send({ type: 'full-reload' })
    },
  })
}

export type ConsoleServer = ViteDevServer & { reloadEntry(): void }
