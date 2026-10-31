// A module resolution hook (`module.register()`), running in Node's loader
// thread: specifiers of workspace packages resolve to their sources, so
// `cormi.yml` loads `cormi-plugin-foo` from `plugins/foo` without a build or
// an install.
import type { InitializeHook, ResolveHook } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { MessagePort } from 'node:worker_threads'
import { resolveWorkspace, type WorkspaceTarget } from './workspace-exports.ts'

export interface HookData {
  packages: Record<string, WorkspaceTarget>
  /** receives the packages again whenever the workspace changes */
  port: MessagePort
}

let packages: Record<string, WorkspaceTarget> = {}

export const initialize: InitializeHook<HookData> = (data) => {
  packages = data.packages
  data.port.on('message', (message: Record<string, WorkspaceTarget>) => {
    packages = message
  })
  data.port.unref()
}

export const resolve: ResolveHook = (specifier, context, next) => {
  const file = resolveWorkspace(packages, specifier, ['node', 'import'])
  // the next hooks still see the file: tsx resolves the format of TypeScript sources
  return next(file ? pathToFileURL(file).href : specifier, context)
}
