import { type Context, Schema, tryResolveModule } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'antd'
export const inject = ['app', 'react']

export interface Config extends ClientConfig {
  /** a locale of `antd/locale`, e.g. `zh_CN` */
  locale?: string
}

export const Config: Schema<Config> = Schema.object({
  theme: Schema.dict(Schema.any()).default({}).description('design tokens of ConfigProvider'),
  dark: Schema.boolean().default(false),
  compact: Schema.boolean().default(false),
  locale: Schema.string().pattern(/^[a-z]{2}_[A-Z]{2}$/).description('a locale of antd/locale, e.g. zh_CN'),
  app: Schema.boolean().default(true).description('wrap the app with antd <App>'),
})

/**
 * Ant Design. The browser plugin wraps the app with `ConfigProvider`; during
 * server rendering the CSS-in-JS styles are extracted into `<head>`, which
 * requires `@ant-design/cssinjs` in the dependencies of the app.
 */
export function apply(ctx: Context, config: Config) {
  // antd and the browser plugin must share one instance of the style cache,
  // so the app resolves `@ant-design/cssinjs` itself (as antd's SSR guide requires)
  if (!tryResolveModule('@ant-design/cssinjs', ctx.cormi.cwd)) {
    ctx.logger('antd').warn('@ant-design/cssinjs is not a dependency of the app: server-rendered pages will not include the styles of antd')
  }
  const { locale, ...client } = config
  // locales are modules: the import is generated, so only the chosen one is bundled
  ctx.app.file('plugin-antd/locale.ts', locale
    ? `export { default } from 'antd/locale/${locale}'\n`
    : 'export default undefined\n')
  ctx.app.entry('@cormijs/plugin-antd/client', client satisfies ClientConfig)
}
