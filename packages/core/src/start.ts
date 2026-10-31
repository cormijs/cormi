import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Include from '@cordisjs/plugin-include'
import Loader from '@cordisjs/plugin-loader'
import Logger from '@cordisjs/plugin-logger-console'
import Timer from '@cordisjs/plugin-timer'
import { Context, Fiber } from 'cordis'
import { Cli } from './cli.ts'
import { Cormi } from './cormi.ts'
import { loadEnv } from './env.ts'

// `FiberState` is a const enum in cordis' typings
const FAILED = 3

export interface StartOptions extends Cormi.Options {
  /** the plugin tree, relative to `cwd` (default `cormi.yml`) */
  config?: string
  /** reload node plugins and the plugin tree when their files change */
  hmr?: boolean
  /** print logs to the console (default `true`) */
  logger?: boolean
}

/**
 * Start a cormi app:
 *
 * ```
 * root Context
 * ├─ logger-console, timer
 * ├─ ctx.cormi, ctx.cli          (provided on the root context)
 * ├─ hmr                          (with `hmr: true`)
 * └─ loader
 *    └─ include → cormi.yml       (the plugin tree)
 * ```
 *
 * The returned context keeps running until `stop()` is called.
 */
export async function start(options: StartOptions) {
  const cwd = resolve(options.cwd)
  loadEnv({ cwd, envFile: '.env' })
  process.env.NODE_ENV ??= options.mode === 'dev' ? 'development' : 'production'

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(cwd).href + '/'
  if (options.logger !== false) await ctx.plugin(Logger)
  await ctx.plugin(Timer)
  // eslint-disable-next-line no-new
  new Cormi(ctx, { cwd, mode: options.mode })
  // eslint-disable-next-line no-new
  new Cli(ctx)
  await ctx.plugin(Loader)
  // the app does not depend on the include plugin, so it is a builtin of the loader
  ctx.loader.builtins.include = Include
  if (options.hmr) {
    const { default: Hmr } = await import('@cordisjs/plugin-hmr')
    ctx.plugin(Hmr, {
      root: [cwd],
      ignored: ['**/node_modules/**', '**/.git/**', 'src/**', 'dist/**', 'public/**'],
      debounce: 100,
    })
  }
  await ctx.loader.create({ name: 'cordis:include', config: { path: options.config ?? 'cormi.yml' } })
  return ctx
}

function* fibers(ctx: Context): Generator<Fiber> {
  for (const runtime of ctx.registry.values()) {
    yield* runtime.fibers
  }
}

/**
 * Wait until no plugin is loading or unloading, including the modules the
 * loader is still importing. Plugins waiting for a service nobody provides
 * stay pending; they do not block.
 */
export async function idle(ctx: Context) {
  while (true) {
    const tasks: Promise<unknown>[] = [...ctx.get('loader')?.getTasks() ?? []]
    for (const fiber of fibers(ctx)) {
      if (fiber.inertia) tasks.push(fiber.inertia)
    }
    if (!tasks.length) return
    await Promise.allSettled(tasks)
  }
}

/** Wait until the plugin tree has loaded; throws if a plugin failed. */
export async function settle(ctx: Context) {
  await idle(ctx)
  const failed = [...fibers(ctx)].filter(fiber => fiber.state === FAILED)
  if (failed.length) {
    throw new Error(`failed to load ${failed.map(fiber => fiber.name).join(', ')}, see the errors above`)
  }
}

/** Dispose every plugin of the app. */
export async function stop(ctx: Context) {
  const roots = [...fibers(ctx)].filter(fiber => fiber.parent.fiber === ctx.fiber)
  await Promise.all(roots.map(fiber => fiber.dispose()))
}
