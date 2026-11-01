import { type ChildProcess, fork } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {} from '@cordisjs/plugin-loader'
import { CommandError, idle, type Mode, settle, start, stop } from '@cormijs/core'
import type { Context } from 'cordis'
import parse from 'yargs-parser'
import { MIN_NODE_VERSION, RESTART_EXIT_CODE } from './constants.ts'
import { checkPlugin, formatReport, writeDeclaration } from './plugin-check.ts'

const BUILTIN_COMMANDS: [string, string][] = [
  ['dev', 'serve the app with the dev server'],
  ['build', 'write the client and server bundles'],
  ['preview', 'serve the build output'],
  ['setup', 'write the generated files (src/.cormi) only'],
  ['plugin check', 'check a plugin package with each bundler and UI framework (--write, --json)'],
]

function formatCommands(commands: [string, string][]) {
  return commands.map(([name, description]) => `  ${name.padEnd(14)}${description}`).join('\n')
}

const COMMANDS = `Commands:\n${formatCommands(BUILTIN_COMMANDS)}`

const HELP = `Usage: cormi <command> [options]

${COMMANDS}

Options:
  --config <file> the plugin tree, instead of cormi.yml
  --port <port>   port of the dev and preview server, over cormi.yml
  --host <host>   host of the dev and preview server, over cormi.yml
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

function getService<K extends 'bundler' | 'app'>(ctx: Context, name: K): Context[K] {
  const service = ctx.get(name)
  if (!service) throw new CommandError(`service ${name} is not available: is a bundler (e.g. @cormijs/vite or @cormijs/rsbuild) with @cormijs/preset, or @cormijs/preset-react, in cormi.yml?`)
  return service
}

/**
 * Load the app, run `task` once every plugin has loaded, then dispose the app.
 * Without `strict`, a plugin failing to load does not stop the task.
 */
async function once(cwd: string, mode: Mode, task: (ctx: Context) => Promise<unknown>, { strict = true, logger = true } = {}) {
  await registerTypeScript()
  const ctx = await start({ cwd, mode, logger, config: process.env.CORMI_CONFIG })
  try {
    await (strict ? settle(ctx) : idle(ctx))
    await task(ctx)
  } finally {
    await stop(ctx)
  }
}

/** The commands registered by the plugins of the app, for `cormi help`. */
async function getPluginCommands(cwd: string) {
  if (!existsSync(join(cwd, process.env.CORMI_CONFIG ?? 'cormi.yml'))) return ''
  let commands: [string, string][] = []
  await once(cwd, 'setup', async (ctx) => {
    commands = [...ctx.cli.commands].map(([name, command]) => {
      const aliases = command.aliases?.length ? ` (${command.aliases.join(', ')})` : ''
      return [name + aliases, command.description]
    })
  }, { strict: false, logger: false })
  return formatCommands(commands)
}

/** Load the app and keep it running until the process is interrupted. */
async function serve(cwd: string, mode: 'dev' | 'preview') {
  await registerTypeScript()
  const ctx = await start({ cwd, mode, hmr: mode === 'dev', config: process.env.CORMI_CONFIG })
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

/**
 * `cormi plugin check [--write]`: load the plugin package of `cwd` with each
 * bundler and UI framework it can be loaded with, infer what it supports,
 * and compare with the `cormi` field of its package.json.
 */
async function checkPluginCommand(cwd: string, write: boolean, json: boolean) {
  await registerTypeScript()
  const report = await checkPlugin(cwd)
  // for tools, e.g. the registry that verifies plugins
  if (json) return console.log(JSON.stringify(report))
  console.log(formatReport(report))
  if (report.exports.some(item => item.error)) throw new CommandError('cannot infer what the plugin supports')
  if (!report.mismatches.length && !report.keywords) return console.log('  package.json declares the same')
  if (write) {
    writeDeclaration(cwd, report)
    return console.log('  package.json is updated: the cormi field and the keywords that mirror it')
  }
  const what = report.mismatches.length ? `declares otherwise for ${report.mismatches.join(', ')}` : 'has keywords that do not mirror the declaration'
  throw new CommandError(`package.json ${what}: run cormi plugin check --write`)
}

export async function run(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < MIN_NODE_VERSION) {
    throw new CommandError(`Cormi requires node >= ${MIN_NODE_VERSION}, current is ${process.versions.node}`)
  }
  const args = parse(argv, {
    alias: { version: ['v'], help: ['h'] },
    boolean: ['version', 'help', 'write', 'json'],
    string: ['config', 'host', 'port'],
  })
  if (args.version) return console.log(getVersion())
  // the options of the command line win over cormi.yml; the worker of the dev server inherits them
  if (args.config) process.env.CORMI_CONFIG = args.config
  if (args.port) process.env.CORMI_PORT = args.port
  if (args.host) process.env.CORMI_HOST = args.host
  const command = String(args._[0] ?? 'help')
  if (args.help || command === 'help') {
    const plugins = await getPluginCommands(process.cwd())
    return console.log(plugins ? HELP.replace(COMMANDS, `${COMMANDS}\n${plugins}`) : HELP)
  }

  const cwd = process.cwd()
  switch (command) {
    case 'dev':
      if (process.env.CORMI_WORKER) return serve(cwd, 'dev')
      return daemon(argv)
    case 'preview':
      return serve(cwd, 'preview')
    case 'build':
      return once(cwd, 'build', ctx => getService(ctx, 'bundler').build())
    case 'setup':
      return once(cwd, 'setup', ctx => getService(ctx, 'app').flush())
    case 'plugin':
      if (args._[1] !== 'check') throw new CommandError('usage: cormi plugin check [--write] [--json]')
      return checkPluginCommand(cwd, !!args.write, !!args.json)
    default:
      // commands of plugins, e.g. generate and config
      return once(cwd, 'setup', async (ctx) => {
        const target = ctx.cli.resolve(command)
        if (!target) {
          console.log(HELP)
          throw new CommandError(`unknown command ${command}`)
        }
        await target.action({ ...args, _: args._.slice(1) })
      }, { strict: false })
  }
}
