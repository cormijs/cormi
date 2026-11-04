import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { cancel, confirm, intro, isCancel, log, note, outro, select, text } from '@clack/prompts'
import {
  BUNDLERS,
  type BundlerName,
  DATABASES,
  type DatabaseName,
  type Kind,
  KINDS,
  type PackageManager,
  render,
  runScript,
  toPackageName,
  type UI,
  UIS,
} from './template.ts'

export * from './template.ts'

/** An error of the user's input, printed without a stack. */
export class CreateError extends Error {
  name = 'CreateError'
}

const HELP = `Usage: create-cormi [directory] [options]

Creates a Cormi app. Its kind says which sides it has:

  web         Frontend: pages rendered in the browser, built into static files
  api         Backend: API routes and a database, no pages
  fullstack   Frontend + backend: pages rendered in the browser, with API routes and a database
  ssr         Server-side rendering: pages rendered on the server, their loaders read the database

Options:
  -t, --template <kind>   web, api, fullstack or ssr
  --ui <name>             the UI framework of the pages: react or vue
  --bundler <name>        the bundler of the pages: vite or rsbuild
  --database <name>       the database of the server: sqlite, postgres, mysql, mongo, memory or none
  --no-install            write the files only
  -y, --yes               the defaults for what the options do not say, without questions
  -f, --force             write into a directory that is not empty
  -v, --version
  -h, --help`

function getVersion(): string {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

/** The package manager that runs this command, e.g. `pnpm create @cormijs`. */
function getPackageManager(): PackageManager {
  const name = process.env.npm_config_user_agent?.split('/')[0]
  return name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : 'npm'
}

function check<T extends string>(value: string | undefined, choices: Record<T, unknown>, option: string): T | undefined {
  if (value === undefined) return
  if (value in choices) return value as T
  const names = Object.keys(choices)
  throw new CreateError(`--${option} must be ${names.slice(0, -1).join(', ')} or ${names.at(-1)}, not ${value}`)
}

function isEmpty(dir: string) {
  return !existsSync(dir) || readdirSync(dir).every(file => file === '.git')
}

/** The answer of a prompt, or the end of the command when it is cancelled. */
function answer<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel('Cancelled')
    process.exit(0)
  }
  return value as Exclude<T, symbol>
}

function exec(command: string, args: string[], cwd: string) {
  return new Promise<boolean>((resolve) => {
    // the package managers are .cmd files on Windows
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('close', code => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

export async function run(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      template: { type: 'string', short: 't' },
      ui: { type: 'string' },
      bundler: { type: 'string' },
      database: { type: 'string' },
      install: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      force: { type: 'boolean', short: 'f' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.version) return console.log(getVersion())
  if (values.help) return console.log(HELP)

  let kind = check<Kind>(values.template, KINDS, 'template')
  let ui = check<UI>(values.ui, UIS, 'ui')
  let bundler = check<BundlerName>(values.bundler, BUNDLERS, 'bundler')
  let database = check<DatabaseName>(values.database, DATABASES, 'database')
  const pm = getPackageManager()
  const version = getVersion()
  // without a terminal (e.g. in CI), the defaults
  const ask = !values.yes && !!process.stdin.isTTY && !!process.stdout.isTTY

  intro(`Cormi ${version}`)

  let dir = positionals[0]
  if (!dir && ask) {
    dir = answer(await text({ message: 'Where should the app be?', placeholder: 'cormi-app', defaultValue: 'cormi-app' }))
  }
  dir ||= 'cormi-app'
  const root = resolve(dir)
  if (!isEmpty(root) && !values.force) {
    if (!ask) throw new CreateError(`${dir} is not empty: pass --force to write into it`)
    const overwrite = answer(await confirm({ message: `${dir} is not empty: write into it? Files of the same names are replaced.`, initialValue: false }))
    if (!overwrite) return cancel('Cancelled')
  }

  if (!kind) {
    kind = ask
      ? answer(await select<Kind>({
          message: 'What does the app have?',
          options: Object.entries(KINDS).map(([value, info]) => ({ value: value as Kind, label: info.label, hint: info.hint })),
          initialValue: 'web',
        }))
      : 'web'
  }
  const info = KINDS[kind]
  // the questions of the sides the app has
  if (info.pages) {
    ui ??= ask
      ? answer(await select<UI>({ message: 'The UI framework of the pages', options: Object.entries(UIS).map(([value, label]) => ({ value: value as UI, label })) }))
      : 'react'
    bundler ??= ask
      ? answer(await select<BundlerName>({ message: 'The bundler of the pages', options: Object.entries(BUNDLERS).map(([value, label]) => ({ value: value as BundlerName, label })) }))
      : 'vite'
  }
  if (info.server) {
    database ??= ask
      ? answer(await select<DatabaseName>({
          message: 'The database of the server',
          options: Object.entries(DATABASES).map(([value, { label, driver }]) => ({ value: value as DatabaseName, label, hint: driver })),
          initialValue: 'sqlite',
        }))
      : 'sqlite'
  }
  let install = values.install
  if (install === undefined) {
    install = ask ? answer(await confirm({ message: `Install the dependencies with ${pm}?` })) : true
  }

  const name = toPackageName(basename(root))
  const files = render({ name, kind, ui: ui ?? 'react', bundler: bundler ?? 'vite', database: database ?? 'none', version, pm })
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  const sides = [info.pages && `pages (${UIS[ui!]}, ${BUNDLERS[bundler!]}${info.pages === 'server' ? ', rendered on the server' : ''})`, info.server && `server (${DATABASES[database!].label} database)`]
  log.success(`Created ${info.label.toLowerCase()} in ${relative(process.cwd(), root) || '.'}: ${sides.filter(Boolean).join(' and ')}`)

  const steps: string[] = []
  if (root !== process.cwd()) steps.push(`cd ${relative(process.cwd(), root)}`)
  if (install) {
    if (!await exec(pm, ['install'], root)) {
      log.warn(`${pm} install failed: run it again in ${dir}`)
      steps.push(`${pm} install`)
    } else if (info.pages) {
      // the generated files of the pages, e.g. src/.cormi/tsconfig.json, for the editor
      await exec(process.execPath, [join('node_modules', '@cormijs', 'cormi', 'bin', 'cormi.js'), 'setup'], root)
    }
  } else {
    steps.push(`${pm} install`)
  }
  steps.push(runScript(pm, 'dev'))
  note(steps.join('\n'), 'Next')
  outro('The guide is at https://cormi.js.org')
}
