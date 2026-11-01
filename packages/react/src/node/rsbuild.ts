import { importPeer, winPath } from '@cormi/core'
import type { RsbuildPlugin } from '@rsbuild/core'
import { stripServerExports } from './route-exports.ts'

/**
 * React in Rsbuild: JSX and Fast Refresh, one instance of React, and the
 * runtime plugins of packages (`packages()`) bundled into the server entry.
 */
export async function rsbuildReact(packages: () => string[]): Promise<RsbuildPlugin[]> {
  const { pluginReact } = await importPeer('@rsbuild/plugin-react', '@cormi/react with rsbuild', () => import('@rsbuild/plugin-react'))
  return [pluginReact(), {
    name: 'cormi:react',
    setup(api) {
      api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => mergeRsbuildConfig(config, {
        resolve: { dedupe: ['react', 'react-dom'] },
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
      api.transform({ test: /\.[cm]?[jt]sx?$/, environments: ['web'], enforce: 'pre' }, ({ code, resourcePath }) => {
        const file = winPath(resourcePath)
        if (!isRouteFile(file)) return code
        return stripServerExports(code, file) ?? code
      })
    },
  }
}
