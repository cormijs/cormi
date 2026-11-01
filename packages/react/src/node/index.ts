import { type Renderer as RendererContract, Schema } from '@cormijs/core'
import { createRequire } from 'node:module'
import { Context, Service } from 'cordis'
import { Generators } from './generators.ts'
import { Renderer } from './renderer.ts'

export * from './generators.ts'
export * from './renderer.ts'
export * from './templates.ts'

declare module 'cordis' {
  interface Context {
    react: React
  }
}

/**
 * React as the UI framework of the app (`ctx.react`, and `ctx.renderer`).
 * Route modules are `.tsx` and `.jsx` files; the browser entry renders the
 * route table with react-router and the server entry renders it with
 * `react-dom/server`. Plugins that only work with React inject `react`.
 *
 * The browser API of the app is `@cormijs/react/client`.
 */
export class React extends Service implements RendererContract {
  static inject = ['app', 'router']

  readonly name = 'react'
  /** the version of React, as the app installs it */
  readonly version: string | undefined = getVersion('react')

  constructor(ctx: Context, public config: React.Config) {
    super(ctx, 'react')
    ctx.provide('renderer', this)
    ctx.router.extension('.tsx', '.jsx')
    ctx.plugin(Renderer)
    ctx.plugin(Generators)
  }
}

function getVersion(name: string): string | undefined {
  try {
    return createRequire(import.meta.url)(`${name}/package.json`).version
  } catch {}
}

export namespace React {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default React
