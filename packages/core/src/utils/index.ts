export * from './exports.ts'
export * from './path.ts'
export * from './refresher.ts'

export function makeArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

/**
 * Import an optional peer dependency, e.g. the integration of a bundler that
 * the app installs only when it uses that bundler. When it is missing, the
 * error names it: `${by} needs ${name}: add it to the dependencies of the app`.
 */
export async function importPeer<T>(name: string, by: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error: any) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(`'${name}'`)) {
      throw new Error(`${by} needs ${name}: add it to the dependencies of the app`)
    }
    throw error
  }
}
