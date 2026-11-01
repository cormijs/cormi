import { existsSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { watch } from 'chokidar'
import { type Context, Schema, winPath } from 'cormi'

export const name = 'model'
export const inject = ['app', 'react']

export interface Config {
  /** directory of models, relative to the app root */
  dir: string
}

export const Config: Schema<Config> = Schema.object({
  dir: Schema.string().default('src/models').description('directory of models'),
})

interface Model {
  namespace: string
  file: string
}

const MODEL_RE = /\.[jt]sx?$/

/**
 * Global data models. A module of `src/models` default-exporting a React
 * hook is a model: the hook's return value is shared by every component
 * calling `useModel(<file name>)`. Other modules (e.g. dva models) are left
 * out. The models and their types are generated into `src/.cormi/plugin-model`.
 */
export function apply(ctx: Context, config: Config) {
  const dir = ctx.cormi.resolve(config.dir)
  const outDir = join(ctx.app.dir, 'plugin-model')
  const toSpecifier = (file: string) => {
    const path = winPath(relative(outDir, file))
    return path.startsWith('.') ? path : `./${path}`
  }

  const scan = (): Model[] => existsSync(dir)
    ? readdirSync(dir)
        .filter(file => MODEL_RE.test(file) && !file.endsWith('.d.ts'))
        .sort()
        .map(file => ({ namespace: basename(file, extname(file)), file: join(dir, file) }))
    : []
  let models = scan()

  ctx.app.file('plugin-model/models.ts', () => [
    ...models.map((model, index) => `import model${index} from ${JSON.stringify(toSpecifier(model.file))}`),
    '',
    'export default {',
    ...models.map((model, index) => `  ${JSON.stringify(model.namespace)}: model${index},`),
    '}',
    '',
  ].join('\n'))

  ctx.app.file('plugin-model/types.d.ts', () => [
    `import type {} from '@cormi/plugin-model/client'`,
    '',
    `declare module '@cormi/plugin-model/client' {`,
    `  interface Models {`,
    // modules that do not export a hook (e.g. dva models) are not models of useModel()
    ...models.map(model => `    ${JSON.stringify(model.namespace)}: typeof import(${JSON.stringify(toSpecifier(model.file))}).default extends (...args: any[]) => infer R ? R : never`),
    `  }`,
    `}`,
    '',
  ].join('\n'))

  ctx.app.entry('@cormi/plugin-model/client')

  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(dir, { ignoreInitial: true, depth: 0 })
      const update = () => {
        models = scan()
        ctx.app.refresh()
      }
      watcher.on('add', update).on('unlink', update)
      return () => watcher.close()
    }, 'watch models')
  }
}
