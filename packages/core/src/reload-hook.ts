// A module resolution hook (`module.register()`), running in Node's loader
// thread: a module imported with `?cormi-v=<generation>` passes the
// generation on to the files of the app it imports, so importing it at a
// new generation evaluates it again with them. Dependencies (node_modules)
// and the workspace packages (plugins of their own) are not reloaded.
import type { InitializeHook, ResolveHook } from 'node:module'
import { sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const QUERY = 'cormi-v'

let root = ''

export const initialize: InitializeHook<{ root: string }> = (data) => {
  root = data.root.endsWith(sep) ? data.root : data.root + sep
}

export const resolve: ResolveHook = async (specifier, context, next) => {
  const result = await next(specifier, context)
  const parent = context.parentURL
  if (!parent?.includes(`${QUERY}=`) || !result.url.startsWith('file:') || result.url.includes(`${QUERY}=`)) return result
  const path = fileURLToPath(result.url)
  if (!path.startsWith(root) || path.includes(`${sep}node_modules${sep}`) || path.startsWith(`${root}plugins${sep}`)) return result
  const url = new URL(result.url)
  url.searchParams.set(QUERY, new URL(parent).searchParams.get(QUERY)!)
  return { ...result, url: url.href }
}
