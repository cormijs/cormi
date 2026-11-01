import { existsSync } from 'node:fs'
import { join } from 'node:path'
import js from '@eslint/js'
import { CommandError, type Context, Schema } from 'cormi'
import { ESLint, type Linter } from 'eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export const name = 'lint'

export interface Config {
  /** files or directories linted when the command names none */
  files: string[]
}

export const Config: Schema<Config> = Schema.object({
  files: Schema.array(String).default(['src', 'mock', 'plugin.ts']).description('files linted by default'),
})

const CONFIG_FILES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts']

/** The config used when the app has no `eslint.config.*` of its own; with the rules of hooks for React apps. */
export function getDefaultConfig(options: { react?: boolean } = {}): Linter.Config[] {
  return [
    { ignores: ['**/dist/**', '**/src/.cormi/**', '**/node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended as Linter.Config[],
    {
      files: ['**/*.{js,jsx,ts,tsx,mjs,mts}'],
      languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },
    ...options.react
      ? [{
          files: ['**/*.{js,jsx,ts,tsx,mjs,mts}'],
          // the plugin's own typings predate ESLint 10's
          plugins: { 'react-hooks': reactHooks as ESLint.Plugin },
          rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
          },
        } satisfies Linter.Config]
      : [],
  ]
}

/**
 * `cormi lint [files...] [--fix]`: ESLint with the app's `eslint.config.*`,
 * or with a default config for TypeScript (and React hooks, in React apps).
 */
export function apply(ctx: Context, config: Config) {
  ctx.cli.command('lint', {
    description: 'lint the app with ESLint: cormi lint [files...] [--fix]',
    async action(args) {
      const { cwd } = ctx.cormi
      const ownConfig = CONFIG_FILES.some(file => existsSync(join(cwd, file)))
      const eslint = new ESLint({
        cwd,
        fix: !!args.fix,
        errorOnUnmatchedPattern: false,
        ...ownConfig ? {} : { overrideConfigFile: true, overrideConfig: getDefaultConfig({ react: ctx.get('renderer')?.name === 'react' }) },
      })
      const patterns = args._.length ? args._.map(String) : config.files.filter(file => existsSync(join(cwd, file)))
      const results = await eslint.lintFiles(patterns)
      if (args.fix) await ESLint.outputFixes(results)
      const output = await (await eslint.loadFormatter('stylish')).format(results)
      if (output) console.log(output)
      const errors = results.reduce((count, result) => count + result.errorCount, 0)
      if (errors) throw new CommandError(`${errors} lint errors`)
      console.log(`linted ${results.length} files`)
    },
  })
}
