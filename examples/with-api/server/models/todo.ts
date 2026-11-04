import type { Context } from '@cormijs/cormi'

export interface Todo {
  id: number
  title: string
  done: boolean
  createdAt: Date
}

declare module '@cormijs/database' {
  interface Tables {
    todo: Todo
  }
}

export const inject = ['model', 'database']

export async function apply(ctx: Context) {
  ctx.model.extend('todo', {
    id: 'unsigned',
    title: 'string',
    done: 'boolean',
    createdAt: 'timestamp',
  }, { autoInc: true })
  // a first todo in an empty database
  if (!(await ctx.database.get('todo', {}, { limit: 1 })).length) {
    await ctx.database.create('todo', { title: 'Try Cormi', done: false, createdAt: new Date() })
  }
}
