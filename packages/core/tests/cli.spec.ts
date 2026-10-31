import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Cli, CommandError, Cormi, createFile } from '../src/index.ts'

describe('ctx.cli', () => {
  let cwd: string
  let ctx: Context

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'cormi-cli-'))
    ctx = new Context()
    // eslint-disable-next-line no-new
    new Cormi(ctx, { cwd, mode: 'setup' })
    // eslint-disable-next-line no-new
    new Cli(ctx)
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('registers commands as effects of the plugin, with aliases', async () => {
    const action = vi.fn()
    const fiber = await ctx.plugin((ctx: Context) => {
      ctx.cli.command('hello', { description: 'say hello', aliases: ['hi'], action })
    })
    await ctx.cli.resolve('hi')!.action({ _: ['world'] })
    expect(action).toHaveBeenCalledWith({ _: ['world'] })
    await fiber.dispose()
    expect(ctx.cli.resolve('hello')).toBeUndefined()
    expect(ctx.cli.resolve('g')).toBe(ctx.cli.commands.get('generate'))
  })

  it('runs generators, which never overwrite files', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await ctx.plugin((ctx: Context) => {
      ctx.cli.generator('note', {
        description: 'a note',
        run: async name => [await createFile(join(ctx.cormi.cwd, 'notes', `${name}.md`), `# ${name}\n`)],
      })
    })
    const generate = ctx.cli.resolve('generate')!
    await generate.action({ _: ['note', 'first'] })
    expect(readFileSync(join(cwd, 'notes/first.md'), 'utf8')).toBe('# first\n')
    await expect(generate.action({ _: ['note', 'first'] })).rejects.toBeInstanceOf(CommandError)
    await expect(generate.action({ _: ['nope', 'x'] })).rejects.toThrow('unknown generator nope')
  })
})
