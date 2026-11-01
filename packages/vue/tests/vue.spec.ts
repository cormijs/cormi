import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '../src/client/index.ts'
import { getSfcExports, renderEntry, stripRouteModule } from '../src/node/index.ts'

const SFC = [
  `<script lang="ts">`,
  `import { platform } from 'node:os'`,
  `export async function loader() { return { platform: platform() } }`,
  `export const handle = { title: 'About' }`,
  `</script>`,
  '',
  `<script setup lang="ts">`,
  `import { useLoaderData } from '@cormijs/vue/client'`,
  `const data = useLoaderData()`,
  `</script>`,
  '',
  `<template><p>{{ data }}</p></template>`,
  '',
].join('\n')

describe('route modules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cormi-vue-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('reads the exports of the <script> of a single-file component', async () => {
    const file = join(dir, 'about.vue')
    writeFileSync(file, SFC)
    expect((await getSfcExports(file)).sort()).toEqual(['default', 'handle', 'loader'])
  })

  it('strips the server loader from the source, with what only it uses', async () => {
    const result = (await stripRouteModule(SFC, '/app/src/pages/about.vue'))!.code
    expect(result).not.toContain('node:os')
    expect(result).not.toContain('loader()')
    expect(result).toContain('handle')
    expect(result).toContain(`<script setup lang="ts">\nimport { useLoaderData } from '@cormijs/vue/client'`)
    expect(await stripRouteModule(SFC.replace(/loader/g, 'other'), '/app/src/pages/about.vue')).toBeUndefined()
  })
})

describe('router', () => {
  it('turns the route table into the records of Vue Router', () => {
    const ctx = new Context({
      routes: {
        'layout': { id: 'layout', path: '/', isLayout: true },
        'index': { id: 'index', path: '/', parentId: 'layout' },
        'users/$id': { id: 'users/$id', path: 'users/:id', parentId: 'layout', meta: { name: 'User' } },
        '$': { id: '$', path: '*', parentId: 'layout' },
        'login': { id: 'login', path: 'login' },
      },
      routeModules: { index: async () => ({}) },
    })
    const [layout, login] = ctx.$router.createRoutes()
    expect(layout).toMatchObject({ path: '/', name: 'layout' })
    expect(layout.children!.map(child => child.path)).toEqual(['/', 'users/:id', ':pathMatch(.*)*'])
    expect(layout.children![1].meta).toEqual({ name: 'User', id: 'users/$id' })
    // routes at the top are absolute
    expect(login.path).toBe('/login')
  })
})

describe('templates', () => {
  it('mounts the entry with the Vue client, hot-replacing its plugins through the bundler', () => {
    const app = { dir: '/app/src/.cormi', entries: new Set([{ file: '/app/src/app.ts' }]), imports: new Set() } as any
    const hotAccept = (imports: [string, string][], callback: string) => `hot(${JSON.stringify(imports)}, ${callback})`
    const code = renderEntry(app, { base: '/', history: 'browser', mountElementId: 'root', hotAccept })
    expect(code).toContain(`from '@cormijs/vue/client'`)
    expect(code).toContain('hot([["../app.ts","entry0"]], (modules: any[]) => {')
  })
})
