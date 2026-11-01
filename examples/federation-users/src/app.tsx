import { Service } from 'cordis'
import type { Context } from '@cormijs/react/client'

declare module 'cordis' {
  interface Context {
    users: Users
  }
}

export interface User {
  id: number
  name: string
}

/** The user directory of the users team: the host and the other packages use it through `ctx.users`. */
export class Users extends Service {
  list: User[] = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Carol' },
  ]

  constructor(ctx: Context) {
    super(ctx, 'users')
  }

  get(id: number) {
    return this.list.find(user => user.id === id)
  }
}

// the runtime plugin of the package: in the host, it runs when the package loads
export default (ctx: Context) => {
  // eslint-disable-next-line no-new
  new Users(ctx)
}
