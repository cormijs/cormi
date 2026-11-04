// A module resolution hook (`module.register()`) of `cormi start`, running in
// Node's loader thread: the plugin tree imports the app's own modules by their
// sources (`./plugin.ts`, a workspace package by name), and gets the modules
// that `cormi build` compiled from them. The sources need not be deployed.
import type { InitializeHook, ResolveHook } from 'node:module'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface ProductionHookData {
  /** compiled modules by the absolute paths of their sources */
  files: Record<string, string>
  /** compiled modules by the names of workspace packages */
  packages: Record<string, string>
}

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx']

let data: ProductionHookData = { files: {}, packages: {} }

export const initialize: InitializeHook<ProductionHookData> = (value) => {
  data = value
}

/** The compiled module of a source path, which may omit its extension or be a directory. */
function lookup(path: string) {
  if (data.files[path]) return data.files[path]
  for (const candidate of [...EXTENSIONS.map(ext => path + ext), ...EXTENSIONS.map(ext => `${path}/index${ext}`)]) {
    if (data.files[candidate]) return data.files[candidate]
  }
}

export const resolve: ResolveHook = (specifier, context, next) => {
  let compiled: string | undefined = data.packages[specifier]
  if (!compiled) {
    let path: string | undefined
    if (specifier.startsWith('file:')) path = fileURLToPath(specifier)
    else if (isAbsolute(specifier)) path = specifier
    else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith('file:')) path = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier)
    if (path) compiled = lookup(path)
  }
  if (compiled) return { url: pathToFileURL(compiled).href, format: 'module', shortCircuit: true }
  return next(specifier, context)
}
