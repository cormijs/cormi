import type { ApiContext } from '@cormijs/cormi'
import { $ } from '@cormijs/database'

declare module '@cormijs/cache' {
  interface Tables {
    stats: number
  }
}

export const inject = ['database', 'cache']

/** GET /api/stats: the number of todos, counted once in 5 seconds, and the visits of this route. */
export async function GET(request: Request, { ctx }: ApiContext) {
  const todos = await ctx.cache.getOrSet('stats', 'todos', () => ctx.database.eval('todo', row => $.count(row.id)), 5000)
  const visits = await ctx.cache.increment('stats', 'visits')
  return { todos, visits }
}
