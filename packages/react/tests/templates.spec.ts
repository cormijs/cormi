import { describe, expect, it } from 'vitest'
import { getPackageName, toSpecifier, transformExports } from '@cormi/core'
import { renderEntry, renderRoutes } from '../src/node/index.ts'

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
      `import { useLoaderData } from '@cormi/react/client'`,
      `export async function loader() { return readFile('x', 'utf8') }`,
      `export default function Page() { return useLoaderData() }`,
    ].join('\n')
    const result = transformExports(code, { remove: ['loader'] })!.code
    expect(result).not.toContain('node:fs')
    expect(result).not.toContain('loader()')
    expect(result).toContain('useLoaderData')
  })

  it('mounts the entry once the runtime plugins are applied, with src/loading', () => {
    const app = { dir: '/app/src/.cormi', entries: new Set([{ file: '/app/src/app.tsx' }]), imports: new Set([{ source: '/app/src/global.css' }]) } as any
    const hotAccept = (imports: [string, string][], callback: string) => `hot(${JSON.stringify(imports)}, ${callback})`
    const code = renderEntry(app, { base: '/', history: 'browser', mountElementId: 'root', loading: '/app/src/loading.tsx', hotAccept })
    expect(code.indexOf('import "../global.css"')).toBe(0)
    expect(code).toContain('import loading from "../loading.tsx"')
    expect(code).toContain('history: "browser", loading })')
    expect(code).toContain(`void Promise.allSettled(fibers).then(() => ctx.bail('app/bootstrap') || mount())`)
    expect(code).toContain('export async function unmount()')
    // the runtime plugins are hot-replaced through the bundler
    expect(code).toContain('hot([["../app.tsx","entry0"]], (modules: any[]) => {')
  })
})

describe('generators', () => {
  it('names components after the last segment', async () => {
    const { toComponentName } = await import('../src/node/index.ts')
    expect(toComponentName('users/order-list')).toBe('OrderList')
    expect(toComponentName('button')).toBe('Button')
  })
})
