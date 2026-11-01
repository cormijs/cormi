import { join } from 'node:path'
import { type Context, Schema } from 'cormi'
import type { MasterClientConfig, MicroAppConfig, SandboxConfig } from './types.ts'

export type * from './types.ts'

export const name = 'qiankun-master'
export const inject = ['app', 'router', 'react']

export interface MicroAppRoute {
  /** route path, e.g. `/app1/*`; the micro app's router runs below its static part */
  path: string
  /** name of the micro app */
  app: string
  /** props passed to the micro app on this route */
  props?: Record<string, any>
}

export interface Config extends MasterClientConfig {
  /** routes rendering a micro app */
  routes: MicroAppRoute[]
}

const app: Schema<MicroAppConfig> = Schema.object({
  name: Schema.string().required(),
  entry: Schema.string().required().description('URL of the micro app, e.g. //localhost:8001'),
  props: Schema.dict(Schema.any()),
})

export const Config: Schema<Config> = Schema.object({
  apps: Schema.array(app).default([]).description('micro apps'),
  routes: Schema.array(Schema.object({
    path: Schema.string().required(),
    app: Schema.string().required(),
    props: Schema.dict(Schema.any()),
  })).default([]).description('routes rendering a micro app'),
  sandbox: Schema.union([Schema.boolean(), Schema.object({
    strictStyleIsolation: Schema.boolean(),
    experimentalStyleIsolation: Schema.boolean(),
  }) as Schema<SandboxConfig>]).default(true),
  prefetch: Schema.boolean().default(true).description('prefetch the micro apps once the master has mounted'),
})

/** `/app1/*` -> `/app1` */
function getBase(path: string) {
  return path.replace(/\/?\*$/, '').replace(/\/$/, '') || '/'
}

/**
 * The master app of qiankun. Micro apps render with `<MicroApp name>` from
 * `@cormijs/plugin-qiankun/master/client`, or on the configured `routes`.
 */
export function apply(ctx: Context, config: Config) {
  const { routes, ...client } = config
  ctx.app.entry('@cormijs/plugin-qiankun/master/client', client satisfies MasterClientConfig)

  routes.forEach((route, index) => {
    if (!config.apps.some(app => app.name === route.app)) {
      throw new Error(`route ${route.path} renders the micro app ${route.app}, which is not in apps`)
    }
    const file = `plugin-qiankun-master/route-${index}.tsx`
    const props = { name: route.app, base: getBase(route.path), ...route.props }
    ctx.app.file(file, [
      `import { MicroApp } from '@cormijs/plugin-qiankun/master/client'`,
      '',
      `export default function MicroAppRoute() {`,
      `  return <MicroApp {...${JSON.stringify(props)}} />`,
      `}`,
      '',
    ].join('\n'))
    ctx.router.route({ id: `qiankun/${index}`, path: route.path, file: join(ctx.app.dir, file) })
  })
}
