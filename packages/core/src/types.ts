/**
 * A route of the app. The route table is flat (`{ [id]: route }`); nesting is
 * expressed with `parentId`.
 */
export interface Route {
  id: string
  /** path segment relative to the parent route */
  path?: string
  /** full path, including the paths of parent routes */
  absPath?: string
  /** absolute path of the route module */
  file?: string
  parentId?: string
  /** index route of its parent */
  index?: boolean
  /** a layout route wrapping other routes */
  isLayout?: boolean
  /** `false` opts the route out of global layouts */
  layout?: boolean
  /** named exports of the route module, collected by `ctx.router` */
  exports?: string[]
  [key: string]: any
}
