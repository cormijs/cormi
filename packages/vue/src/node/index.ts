import { type Renderer as RendererContract, Schema } from '@cormi/core'
import { Context, Service } from 'cordis'
import { getSfcExports } from './exports.ts'
import { Generators } from './generators.ts'
import { Renderer } from './renderer.ts'

export * from './exports.ts'
export * from './generators.ts'
export * from './renderer.ts'
export * from './templates.ts'

declare module 'cordis' {
  interface Context {
    vue: Vue
  }
}

/**
 * Vue as the UI framework of the app (`ctx.vue`, and `ctx.renderer`). Route
 * modules are single-file components (`.vue`), whose `<script>` exports the
 * loaders; the browser entry renders the route table with Vue Router and
 * the server entry with `vue/server-renderer`. Plugins that only work with
 * Vue inject `vue`.
 *
 * The browser API of the app is `@cormi/vue/client`.
 */
export class Vue extends Service implements RendererContract {
  static inject = ['app', 'router']

  readonly name = 'vue'

  constructor(ctx: Context, public config: Vue.Config) {
    super(ctx, 'vue')
    ctx.provide('renderer', this)
    ctx.router.extension('.vue')
    ctx.plugin(Renderer)
    ctx.plugin(Generators)
  }

  async routeExports(file: string) {
    if (file.endsWith('.vue')) return getSfcExports(file)
  }
}

export namespace Vue {
  export interface Config {}

  export const Config: Schema<Config> = Schema.object({})
}

export default Vue
