import { type ChildProcess, fork } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type {} from '@cordisjs/plugin-loader'
import { type Mode, settle, start, stop } from '@cormi/core'
import type {} from '@cormi/vite'
import type { Context } from 'cordis'
import parse from 'yargs-parser'
import { MIN_NODE_VERSION, RESTART_EXIT_CODE } from './constants.ts'

const HELP = `Usage: cormi <command> [options]

Commands:
  dev       serve the app with the dev server
  build     write the client and server bundles
  preview   serve the build output
  setup     write the generated files (src/.cormi) only

Options:
  --port <port>   port of the dev and preview server (env PORT)
  --host <host>   host of the dev and preview server (env HOST)
  -v, --version
  -h, --help`

function getVersion(): string {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

/** Let the plugin tree load TypeScript plugins, e.g. `./plugin.ts`. */
async function registerTypeScript() {
  const { register } = await import('tsx/esm/api')
  register()
}

function getService<K extends 'vite' | 'app'>(ctx: Context, name: K): Context[K] {
  const service = ctx.get(name)
  if (!service) throw new Error(`service ${name} is not available, is @cormi/preset-react in cormi.yml?`)
  return service
}

/** Load the app, run `task` once every plugin has loaded, then dispose the app. */
async function once(cwd: string, mode: Mode, task: (ctx: Context) => Promise<unknown>) {
  await registerTypeScript()
  const ctx = await start({ cwd, mode })
  try {
    await settle(ctx)
    await task(ctx)
  } finally {
    await stop(ctx)
  }
}

/** Load the app and keep it running until the process is interrupted. */
async function serve(cwd: string, mode: 'dev' | 'preview') {
  await registerTypeScript()
  const ctx = await start({ cwd, mode, hmr: mode === 'dev' })
  let exiting = false
  const exit = (code: number) => {
    if (exiting) return
    exiting = true
    void stop(ctx).finally(() => process.exit(code))
  }
  // plugin-hmr asks for a fresh process when a file outside the plugin tree changes
  if (mode === 'dev') ctx.loader.exit = () => exit(RESTART_EXIT_CODE)
  process.on('SIGINT', () => exit(0))
  process.on('SIGTERM', () => exit(0))
  process.on('unhandledRejection', error => ctx.logger('cormi').warn(error))
}

/**
 * The dev server runs in a worker process supervised by this one, like
 * koishi's daemon: the worker exits with {@link RESTART_EXIT_CODE} when it
 * needs a fresh process, and is forked again. `--expose-internals` lets
 * plugin-hmr reload node plugins in place.
 */
function daemon(argv: string[]) {
  let child: ChildProcess | undefined
  let exiting = false
  const start = () => {
    child = fork(fileURLToPath(new URL('../bin/cormi.js', import.meta.url)), argv, {
      env: { ...process.env, CORMI_WORKER: '1' },
      execArgv: [...process.execArgv, '--expose-internals'],
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (exiting) return
      if (code === RESTART_EXIT_CODE) return start()
      process.exit(code ?? 0)
    })
  }
  const onSignal = (signal: NodeJS.Signals) => {
    if (exiting) return
    exiting = true
    if (!child || child.exitCode !== null) process.exit(0)
    child.once('exit', () => process.exit(0))
    child.kill(signal)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  start()
}

export async function run(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < MIN_NODE_VERSION) {
    throw new Error(`Cormi requires node >= ${MIN_NODE_VERSION}, current is ${process.versions.node}`)
  }
  const args = parse(argv, {
    alias: { version: ['v'], help: ['h'] },
    boolean: ['version', 'help'],
    string: ['host', 'port'],
  })
  if (args.version) return console.log(getVersion())
  const command = String(args._[0] ?? 'help')
  if (args.help || command === 'help') return console.log(HELP)
  if (args.port) process.env.PORT = args.port
  if (args.host) process.env.HOST = args.host

  const cwd = process.cwd()
  switch (command) {
    case 'dev':
      if (process.env.CORMI_WORKER) return serve(cwd, 'dev')
      return daemon(argv)
    case 'preview':
      return serve(cwd, 'preview')
    case 'build':
      return once(cwd, 'build', ctx => getService(ctx, 'vite').build())
    case 'setup':
      return once(cwd, 'setup', ctx => getService(ctx, 'app').flush())
    default:
      console.log(HELP)
      throw new Error(`unknown command ${command}`)
  }
}
