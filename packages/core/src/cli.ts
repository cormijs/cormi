import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative } from 'node:path'
import type {} from '@cordisjs/plugin-loader'
import { Context, resolveConfig, Service } from 'cordis'
import { Awaitable } from 'cosmokit'

declare module 'cordis' {
  interface Context {
    cli: Cli
  }
}

const STATES = ['pending', 'loading', 'active', 'failed', 'disposed', 'unloading']

/** An error of the user's input: the CLI prints its message, without a stack. */
export class CommandError extends Error {
  name = 'CommandError'
}

/** Write a file the generator creates; an existing file is never overwritten. */
export async function createFile(file: string, content: string) {
  if (existsSync(file)) throw new CommandError(`${file} exists already`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  return file
}

/**
 * The commands of the CLI (`ctx.cli`). Plugins add commands with `command()`
 * and generators of `cormi generate` with `generator()`; both are effects of
 * the calling plugin. `start()` provides the service on the root context.
 *
 * Commands other than dev, build, start and setup run once the plugin tree
 * has loaded in `setup` mode.
 */
export class Cli extends Service {
  commands = new Map<string, Cli.Command>()
  generators = new Map<string, Cli.Generator>()

  constructor(ctx: Context) {
    super(ctx, 'cli')
    this.commands.set('generate', {
      description: 'create files from a generator: cormi generate <type> <name>',
      aliases: ['g'],
      action: args => this._generate(args),
    })
    this.commands.set('config', {
      description: 'show the plugin tree, or the resolved config of the plugins matching <name>',
      action: args => this._config(args),
    })
  }

  command(name: string, command: Cli.Command) {
    return this._register(this.commands, name, command, `ctx.cli.command(${JSON.stringify(name)})`)
  }

  generator(type: string, generator: Cli.Generator) {
    return this._register(this.generators, type, generator, `ctx.cli.generator(${JSON.stringify(type)})`)
  }

  /** A command by name or alias. */
  resolve(name: string) {
    if (this.commands.has(name)) return this.commands.get(name)
    for (const command of this.commands.values()) {
      if (command.aliases?.includes(name)) return command
    }
  }

  private _register<T>(map: Map<string, T>, key: string, value: T, label: string) {
    return this.ctx.effect(() => {
      if (map.has(key)) throw new Error(`${label.split('(')[0]} ${key} is registered twice`)
      map.set(key, value)
      return () => {
        if (map.get(key) === value) map.delete(key)
      }
    }, label)
  }

  private async _generate(args: Cli.Arguments) {
    const [type, name] = args._.map(String)
    const generator = type && this.generators.get(type)
    if (!generator || !name) {
      const list = [...this.generators].map(([type, { description }]) => `  ${type.padEnd(12)}${description}`)
      console.log(`Usage: cormi generate <type> <name>\n\nGenerators:\n${list.join('\n')}`)
      if (type && !generator) throw new CommandError(`unknown generator ${type}`)
      return
    }
    const files = await generator.run(name, args)
    for (const file of files) console.log(`created ${relative(this.ctx.cormi.cwd, file)}`)
  }

  private async _config(args: Cli.Arguments) {
    const loader = this.ctx.get('loader')
    if (!loader) throw new Error('the plugin tree is not loaded')
    const query = args._[0] === undefined ? undefined : String(args._[0])
    for (const entry of loader.entries()) {
      const { id, name, disabled } = entry.options
      if (name === 'cordis:include') continue
      const state = disabled ? 'disabled' : STATES[entry.fiber?.state ?? 0]
      if (!query) {
        console.log(`${name.padEnd(36)} ${state.padEnd(9)} ${id}`)
        continue
      }
      if (!name.includes(query) && id !== query) continue
      const fiber = entry.fiber
      const config = fiber?.runtime ? resolveConfig(fiber.runtime, fiber.config) : entry.options.config
      console.log(`# ${name} (${state})\n${JSON.stringify(config ?? null, null, 2)}`)
    }
  }
}

export namespace Cli {
  export interface Arguments {
    /** positional arguments after the command */
    _: (string | number)[]
    [key: string]: any
  }

  export interface Command {
    description: string
    aliases?: string[]
    action(args: Arguments): Awaitable<void>
  }

  export interface Generator {
    description: string
    /** create the files of `name`; returns the created files */
    run(name: string, args: Arguments): Awaitable<string[]>
  }
}
