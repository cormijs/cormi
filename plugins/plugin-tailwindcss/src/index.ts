import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { type Context, Schema, winPath } from 'cormi'
import type {} from '@cormi/vite'

export const name = 'tailwindcss'
export const inject = ['app', 'vite']

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

/** Tailwind CSS v4 through its Vite plugin; the stylesheet is imported before the app starts. */
export function apply(ctx: Context, config: Config) {
  ctx.vite.plugin(() => tailwindcss())
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
