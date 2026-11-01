import { importPeer, winPath } from '@cormijs/core'
import type { RsbuildPlugin } from '@rsbuild/core'
import { stripRouteModule } from './exports.ts'

/**
 * Vue in Rsbuild: single-file components, one instance of Vue, and the
 * runtime plugins of packages (`packages()`) bundled into the server entry.
 */
export async function rsbuildVue(packages: () => string[]): Promise<RsbuildPlugin[]> {
  const { pluginVue } = await importPeer('@rsbuild/plugin-vue', '@cormijs/vue with rsbuild', () => import('@rsbuild/plugin-vue'))
  return [pluginVue(), {
    name: 'cormi:vue',
    setup(api) {
      api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => mergeRsbuildConfig(config, {
        resolve: { dedupe: ['vue'] },
      }))
      // runtime plugins of packages may ship TypeScript sources
      api.modifyEnvironmentConfig((config, { name, mergeEnvironmentConfig }) => {
        if (name !== 'node') return config
        return mergeEnvironmentConfig(config, { output: { autoExternal: { exclude: packages() } } })
      })
    },
  }]
}

/** Strip the server-only exports of route modules from the client bundle (the `web` environment). */
export function rsbuildRouteExports(isRouteFile: (file: string) => boolean): RsbuildPlugin {
  return {
    name: 'cormi:route-exports',
    setup(api) {
      // vue-loader compiles each block of a single-file component from its stripped source
      api.transform({ test: /\.(vue|[cm]?[jt]sx?)$/, environments: ['web'], enforce: 'pre' }, async ({ code, resourcePath }) => {
        const file = winPath(resourcePath)
        if (!isRouteFile(file)) return code
        return (await stripRouteModule(code, file))?.code ?? code
      })
    },
  }
}
