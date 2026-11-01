import { describe, expect, it } from 'vitest'
import { prefixSelectors } from '../src/conventions.ts'

describe('conventions', () => {
  it('prefixes the selectors of overrides with body', () => {
    const css = prefixSelectors('.a, body .b { color: red }\nhtml { margin: 0 }\n@media (min-width: 1px) { .c { color: blue } }\n@keyframes k { from { opacity: 0 } }')
    expect(css).toContain('body .a, body .b { color: red }')
    expect(css).toContain('html { margin: 0 }')
    expect(css).toContain('body .c { color: blue }')
    expect(css).toContain('from { opacity: 0 }')
  })
})
