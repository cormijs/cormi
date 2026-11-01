import type { Context } from '@cormijs/react/client'

/** Runtime plugins apply to every page. */
export default (ctx: Context) => {
  ctx.wrap(({ children }) => (
    <>
      <nav>
        <a href="/">Home</a>
        <a href="/about.html">About</a>
      </nav>
      {children}
    </>
  ))
}
