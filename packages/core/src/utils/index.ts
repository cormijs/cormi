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
