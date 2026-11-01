import { existsSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { watch } from 'chokidar'
import { type Context, Schema, winPath } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'dva'
export const inject = ['app', 'react']

export interface Config extends ClientConfig {
  /** directory of models, relative to the app root */
  dir: string
}

export const Config: Schema<Config> = Schema.object({
  dir: Schema.string().default('src/models').description('directory of models'),
  loading: Schema.boolean().default(true).description('track the effects in state.loading'),
  immer: Schema.boolean().default(false).description('write reducers with immer drafts'),
})

const MODEL_RE = /\.[jt]sx?$/

/**
 * dva: redux with models of `src/models` (`namespace`, `state`, `reducers`,
 * `effects`, `subscriptions`). Modules exporting a hook are left to
 * @cormijs/plugin-model, so both share the directory.
 */
export function apply(ctx: Context, config: Config) {
  const dir = ctx.cormi.resolve(config.dir)
  const outDir = join(ctx.app.dir, 'plugin-dva')
  const scan = () => existsSync(dir)
    ? readdirSync(dir).filter(file => MODEL_RE.test(file) && !file.endsWith('.d.ts')).sort()
    : []
  let files = scan()

  ctx.app.file('plugin-dva/models.ts', () => {
    const specifier = (file: string) => {
      const path = winPath(relative(outDir, join(dir, file)))
      return path.startsWith('.') ? path : `./${path}`
    }
    return [
      ...files.map((file, index) => `import model${index} from ${JSON.stringify(specifier(file))}`),
      '',
      'export default {',
      ...files.map((file, index) => `  ${JSON.stringify(basename(file, extname(file)))}: model${index},`),
      '}',
      '',
    ].join('\n')
  })
  ctx.app.entry('@cormijs/plugin-dva/client', { loading: config.loading, immer: config.immer } satisfies ClientConfig)

  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(dir, { ignoreInitial: true, depth: 0 })
      const update = () => {
        files = scan()
        ctx.app.refresh()
      }
      watcher.on('add', update).on('unlink', update)
      return () => watcher.close()
    }, 'watch dva models')
  }
}
