import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type Context, Schema } from 'cormi'
import { type Preset, presetMini, presetWind3, presetWind4 } from 'unocss'
import UnoCSS from 'unocss/vite'
import type {} from '@cormi/vite'

export const name = 'unocss'
export const inject = ['app', 'vite']

export interface Config {
  /** the preset used when the app has no `uno.config.*` of its own */
  preset: 'wind4' | 'wind3' | 'mini'
}

export const Config: Schema<Config> = Schema.object({
  preset: Schema.union(['wind4', 'wind3', 'mini'] as const).default('wind4').description('preset used without uno.config.*'),
})

const CONFIG_FILES = ['uno.config.ts', 'uno.config.mts', 'uno.config.js', 'uno.config.mjs', 'unocss.config.ts', 'unocss.config.js']
// the presets have themes of their own: they are used through `Preset<any>`
const PRESETS: Record<Config['preset'], () => Preset<any>> = {
  wind4: () => presetWind4(),
  wind3: () => presetWind3(),
  mini: () => presetMini(),
}

/** UnoCSS: the Vite plugin and `virtual:uno.css`, imported before the app starts. */
export function apply(ctx: Context, config: Config) {
  const ownConfig = CONFIG_FILES.some(file => existsSync(join(ctx.cormi.cwd, file)))
  ctx.vite.plugin(() => UnoCSS(ownConfig ? {} : { presets: [PRESETS[config.preset]()] }))
  ctx.app.import('virtual:uno.css')
}
