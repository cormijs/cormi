import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

/**
 * React in Vite: JSX and Fast Refresh, one instance of React, and the
 * runtime plugins of packages (`packages()`) bundled into the server entry.
 */
export function viteReact(packages: () => string[]): PluginOption {
  return [react(), {
    name: 'cormi:react',
    config: () => ({
      // resolved from the app root: only packages the app depends on itself
      resolve: { dedupe: ['react', 'react-dom'] },
      optimizeDeps: { include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'] },
      ssr: {
        // one instance of the React API, shared by the server entry, the pages and the runtime plugins
        external: ['@cormi/react', '@cormi/runtime'],
        // runtime plugins of packages may ship TypeScript sources
        noExternal: packages(),
      },
    }),
  }]
}
