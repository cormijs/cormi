import { importPeer, stripServerExports } from '@cormijs/core'
import type { PluginOption } from 'vite'

/**
 * React in Vite: JSX and Fast Refresh, one instance of React, and the
 * runtime plugins of packages (`packages()`) bundled into the server entry.
 */
export async function viteReact(packages: () => string[]): Promise<PluginOption[]> {
  const { default: react } = await importPeer('@vitejs/plugin-react', '@cormijs/react with vite', () => import('@vitejs/plugin-react'))
  return [react(), {
    name: 'cormi:react',
    config: () => ({
      // resolved from the app root: only packages the app depends on itself
      resolve: { dedupe: ['react', 'react-dom'] },
      optimizeDeps: { include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'] },
      ssr: {
        // one instance of the React API, shared by the server entry, the pages and the runtime plugins
        external: ['@cormijs/react', '@cormijs/runtime'],
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
      const [file] = id.split('?')
      if (!/\.[cm]?[jt]sx?$/.test(file) || !isRouteFile(file)) return
      return stripServerExports(code, file)
    },
  }
}
