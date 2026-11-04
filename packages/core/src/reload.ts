import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const registered = new Set<string>()

/**
 * Import the code of the app (e.g. `server/`) so that it can be imported
 * again with its changes: after `invalidate()`, a module and the files of
 * the app it imports are evaluated anew. Node keeps every generation in
 * memory, so this is meant for development.
 */
export class ModuleReloader {
  generation = 0

  constructor(public root: string) {
    // the hook passes the generation on, from a module to the files it imports
    if (registered.has(root)) return
    registered.add(root)
    const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
    register(new URL(`./reload-hook${extension}`, import.meta.url), { data: { root } })
  }

  /** Import a module of the app at the current generation. */
  import(file: string): Promise<any> {
    const url = pathToFileURL(file)
    if (this.generation) url.searchParams.set('cormi-v', String(this.generation))
    return import(url.href)
  }

  /** The next imports evaluate the modules again. */
  invalidate() {
    this.generation++
  }
}
