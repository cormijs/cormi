import { join } from 'node:path'
import { type Context, Schema } from 'cormi'
import type { ClientConfig } from './types.ts'

export type * from './types.ts'

export const name = 'layout'
export const inject = ['app', 'router', 'react']

export interface Config extends ClientConfig {}

export const Config: Schema<Config> = Schema.object({
  title: Schema.string(),
  logo: Schema.string().description('URL of the logo'),
  layout: Schema.union(['side', 'top'] as const).default('side'),
  theme: Schema.union(['dark', 'light'] as const).default('dark'),
  breadcrumb: Schema.boolean().default(true),
  footer: Schema.string(),
})

const ICON_RE = /^[A-Z]\w*$/

/**
 * A layout with a menu built from the routes, with Ant Design. Configured
 * routes provide `name`, `icon` (an icon of @ant-design/icons) and
 * `hideInMenu`; other routes are named after their path.
 */
export function apply(ctx: Context, config: Config) {
  ctx.app.entry('@cormijs/plugin-layout/client', config satisfies ClientConfig)

  // the icons of the menu are imported by name, so only those are bundled
  ctx.app.file('plugin-layout/icons.ts', () => {
    const icons = new Set<string>()
    for (const route of Object.values(ctx.router.routes)) {
      const icon = route.meta?.icon ?? route.icon
      if (typeof icon === 'string' && ICON_RE.test(icon)) icons.add(icon)
    }
    if (!icons.size) return 'export default {}\n'
    const names = [...icons].sort().join(', ')
    return `import { ${names} } from '@cormijs/plugin-layout/icons'\n\nexport default { ${names} }\n`
  })
  ctx.app.file('plugin-layout/Layout.tsx', `export { Layout as default } from '@cormijs/plugin-layout/client'\n`)
  ctx.router.layout(join(ctx.app.dir, 'plugin-layout/Layout.tsx'), { id: '@@/plugin-layout' })
}
