import { describe, expect, it } from 'vitest'
import { getPackageName, renderRoutes, toSpecifier, transformExports } from '../src/index.ts'

describe('templates', () => {
  it('keeps package specifiers and relativizes files', () => {
    expect(toSpecifier('/app/src/.cormi', '/app/src/pages/index.tsx')).toBe('../pages/index.tsx')
    expect(toSpecifier('/app/src/.cormi', '/app/src/.cormi/api.ts')).toBe('./api.ts')
    expect(toSpecifier('/app/src/.cormi', '@cormi/plugin-antd/client')).toBe('@cormi/plugin-antd/client')
    expect(getPackageName('@cormi/plugin-antd/client')).toBe('@cormi/plugin-antd')
    expect(getPackageName('foo/client')).toBe('foo')
    expect(getPackageName('/abs/file.ts')).toBeUndefined()
  })

  it('renders the route manifest', () => {
    const code = renderRoutes('/app/src/.cormi', {
      index: { id: 'index', path: '/', file: '/app/src/pages/index.tsx', exports: ['default', 'loader', 'clientLoader'] },
    })
    expect(code).toContain('"index": {"id":"index","path":"/","hasLoader":true,"hasClientLoader":true}')
    expect(code).toContain('"index": () => import("../pages/index.tsx")')
  })

  it('strips server loaders and the code only they use', () => {
    const code = [
      `import { readFile } from 'node:fs/promises'`,
      `import { useLoaderData } from 'cormi/client'`,
      `export async function loader() { return readFile('x', 'utf8') }`,
      `export default function Page() { return useLoaderData() }`,
    ].join('\n')
    const result = transformExports(code, { remove: ['loader'] })!.code
    expect(result).not.toContain('node:fs')
    expect(result).not.toContain('loader()')
    expect(result).toContain('useLoaderData')
  })
})
