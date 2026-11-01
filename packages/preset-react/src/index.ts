import * as Preset from '@cormijs/preset'
import { Schema } from '@cormijs/core'
import React from '@cormijs/react'
import Vite from '@cormijs/vite'
import { Context } from 'cordis'

export const name = 'preset-react'

export interface Config extends Preset.Config, Vite.Config {}

export const Config: Schema<Config> = Schema.intersect([Preset.Config, Vite.Config]) as Schema<Config>

/**
 * A React app bundled by Vite: `@cormijs/preset`, `@cormijs/vite` and
 * `@cormijs/react` with one flat config. Each part reads its own fields; write
 * them as three entries of cormi.yml to choose another bundler or UI
 * framework.
 */
export function apply(ctx: Context, config: Config) {
  ctx.plugin(Preset, config)
  ctx.plugin(Vite, config)
  ctx.plugin(React, {})
}
