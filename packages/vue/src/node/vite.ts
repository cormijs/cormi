import { importPeer } from '@cormi/core'
import type { PluginOption } from 'vite'
import { stripRouteModule } from './exports.ts'

/**
 * Vue in Vite: single-file components, one instance of Vue, and the runtime
 * plugins of packages (`packages()`) bundled into the server entry.
 */
export async function viteVue(packages: () => string[]): Promise<PluginOption[]> {
  const { default: vue } = await importPeer('@vitejs/plugin-vue', '@cormi/vue with vite', () => import('@vitejs/plugin-vue'))
  return [vue(), {
    name: 'cormi:vue',
    config: () => ({
      resolve: { dedupe: ['vue'] },
      optimizeDeps: { include: ['vue'] },
      ssr: {
        // one instance of Vue, shared by the server entry, the pages and the runtime plugins
        external: ['@cormi/vue', '@cormi/runtime'],
        // runtime plugins of packages may ship TypeScript sources
        noExternal: packages(),
      },
    }),
  }]
}

/** Strip the server-only exports of route modules from the client bundle. */
export function viteRouteExports(isRouteFile: (file: string) => boolean): PluginOption {
  return {
    name: 'cormi:route-exports',
    enforce: 'pre',
    transform(code, id, options) {
      if (options?.ssr) return
      // the blocks of a single-file component (`?vue&type=…`) are compiled from its stripped source
      const [file, query] = id.split('?')
      if (query || !isRouteFile(file)) return
      return stripRouteModule(code, file)
    },
  }
}
