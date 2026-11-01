import { readFile } from 'node:fs/promises'
import { getModuleExports, stripServerExports } from '@cormi/core'

/**
 * The exports of a `.vue` route module: its component, and those of its
 * `<script>` block, e.g. `loader` (`<script setup>` cannot export).
 */
export async function getSfcExports(file: string): Promise<string[]> {
  const source = await readFile(file, 'utf8').catch(() => undefined)
  if (source === undefined) return []
  const { parse } = await import('vue/compiler-sfc')
  const { descriptor } = parse(source, { filename: file })
  const script = descriptor.script
  const exports = script ? await getModuleExports({ file: `${file}.${script.lang ?? 'js'}`, content: script.content }) : []
  return ['default', ...exports.filter(name => name !== 'default')]
}

/**
 * A route module for the client bundle, without its server-only exports:
 * those of the `<script>` of a single-file component are removed from its
 * source, before it is compiled, as the compiler exposes every binding of
 * the component to its template in dev mode.
 */
export async function stripRouteModule(code: string, file: string) {
  if (!file.endsWith('.vue')) return stripServerExports(code, file)
  const { parse } = await import('vue/compiler-sfc')
  const script = parse(code, { filename: file }).descriptor.script
  if (!script) return
  const result = stripServerExports(script.content, `${file}.${script.lang ?? 'js'}`)
  if (!result) return
  return { code: code.slice(0, script.loc.start.offset) + result.code + code.slice(script.loc.end.offset) }
}
