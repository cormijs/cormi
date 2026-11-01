import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Context, importPeer, Schema, winPath } from 'cormi'
import type {} from '@cormijs/rsbuild'
import type {} from '@cormijs/vite'

export const name = 'tailwindcss'
export const inject = ['app', 'bundler']

export interface Config {
  /**
   * Your own stylesheet with `@import "tailwindcss"`, relative to the app root,
   * e.g. to customize the theme. By default a stylesheet is generated.
   */
  css?: string
}

export const Config: Schema<Config> = Schema.object({
  css: Schema.string().description('your own stylesheet with @import "tailwindcss"'),
})

/**
 * Tailwind CSS v4: `@tailwindcss/vite` with Vite, `@tailwindcss/postcss`
 * with Rsbuild, which the app installs; the stylesheet is imported before
 * the app starts.
 */
export function apply(ctx: Context, config: Config) {
  ctx.bundler.plugin({
    vite: async () => {
      const { default: tailwindcss } = await importPeer('@tailwindcss/vite', '@cormijs/plugin-tailwindcss with vite', () => import('@tailwindcss/vite'))
      return tailwindcss()
    },
    rsbuild: async () => {
      const { default: tailwindcss } = await importPeer('@tailwindcss/postcss', '@cormijs/plugin-tailwindcss with rsbuild', () => import('@tailwindcss/postcss'))
      return {
        name: 'cormi:tailwindcss',
        setup(api) {
          api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => mergeRsbuildConfig(config, {
            tools: { postcss: (_, { addPlugins }) => addPlugins(tailwindcss()) },
          }))
        },
      }
    },
  })
  if (config.css) {
    ctx.app.import(ctx.cormi.resolve(config.css))
    return
  }
  // resolved from this package, so the app does not have to depend on tailwindcss
  const stylesheet = winPath(fileURLToPath(import.meta.resolve('tailwindcss/index.css')))
  ctx.app.file('plugin-tailwindcss/index.css', [
    `@import "${stylesheet}";`,
    // relative to this file: scan src/
    `@source "../..";`,
    '',
  ].join('\n'))
  ctx.app.import(join(ctx.app.dir, 'plugin-tailwindcss/index.css'))
}
