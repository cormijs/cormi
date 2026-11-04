import { describe, expect, it } from 'vitest'
import { BUNDLERS, DATABASES, type Kind, KINDS, type Options, render, toPackageName, UIS } from '../src/template.ts'

const base: Options = { name: 'my-app', kind: 'web', ui: 'react', bundler: 'vite', database: 'sqlite', version: '0.1.0', pm: 'pnpm' }

function create(options: Partial<Options>) {
  const files = render({ ...base, ...options })
  return { files, paths: Object.keys(files).sort(), pkg: JSON.parse(files['package.json']) }
}

describe('render', () => {
  it('writes a frontend without a server', () => {
    const { paths, pkg, files } = create({ kind: 'web' })
    expect(paths.some(path => path.startsWith('server/'))).toBe(false)
    expect(paths).toContain('src/pages/index.tsx')
    expect(pkg.scripts).toEqual({ dev: 'cormi dev', build: 'cormi build', preview: 'cormi preview', setup: 'cormi setup' })
    expect(pkg.dependencies['@vitejs/plugin-react']).toBeDefined()
    expect(pkg.dependencies['@cormijs/database']).toBeUndefined()
    expect(pkg.devDependencies['@types/node']).toBeUndefined()
    expect(JSON.parse(files['tsconfig.json'])).toEqual({ extends: './src/.cormi/tsconfig.json' })
  })

  it('writes a backend without pages', () => {
    const { paths, pkg, files } = create({ kind: 'api' })
    expect(paths.some(path => path.startsWith('src/'))).toBe(false)
    expect(paths).toEqual(expect.arrayContaining(['server/index.ts', 'server/env.d.ts', 'server/models/todo.ts', 'server/api/todos/index.ts', 'server/api/todos/[id].ts', 'data/.gitignore']))
    expect(pkg.scripts).toEqual({ dev: 'cormi dev', start: 'cormi start' })
    expect(Object.keys(pkg.dependencies)).toEqual(['@cormijs/cormi', '@cormijs/database', '@cormijs/preset', '@minatojs/driver-sqlite', 'minato'])
    expect(files['cormi.yml']).not.toMatch(/vite|react/)
    expect(JSON.parse(files['tsconfig.json']).include).toEqual(['server'])
    expect(files['.gitignore']).not.toMatch(/src\/\.cormi/)
  })

  it('writes the pages and the server of a full-stack app', () => {
    const { paths, pkg, files } = create({ kind: 'fullstack', ui: 'vue', bundler: 'rsbuild' })
    expect(paths).toEqual(expect.arrayContaining(['src/pages/index.vue', 'server/api/todos/index.ts']))
    expect(pkg.scripts).toEqual({ dev: 'cormi dev', build: 'cormi build', start: 'cormi start', setup: 'cormi setup' })
    expect(pkg.dependencies['@rsbuild/plugin-vue']).toBeDefined()
    expect(JSON.parse(files['tsconfig.json'])).toEqual({ extends: './src/.cormi/tsconfig.json', include: ['src', 'server'] })
    expect(files['src/pages/index.vue']).toMatch(/fetch\('\/api\/todos'\)/)
    expect(files['cormi.yml']).not.toMatch(/ssr: true/)
  })

  it('renders the pages of an ssr app on the server, with loaders that read the database', () => {
    const { files } = create({ kind: 'ssr' })
    expect(files['cormi.yml']).toMatch(/ {4}ssr: true/)
    expect(files['src/pages/index.tsx']).toMatch(/context\.ctx\.database\.get\('todo'/)
  })

  it('writes an api route without a database', () => {
    const { paths, pkg, files } = create({ kind: 'ssr', database: 'none' })
    expect(paths).toContain('server/api/hello.ts')
    expect(paths.some(path => path.startsWith('server/models/') || path === 'server/env.d.ts')).toBe(false)
    expect(pkg.dependencies['@cormijs/database']).toBeUndefined()
    expect(files['src/pages/index.tsx']).toMatch(/context\.ctx\.cormi\.mode/)
  })

  it('keeps the password of a database out of cormi.yml', () => {
    const { files } = create({ kind: 'api', database: 'postgres', name: 'my-app' })
    expect(files['cormi.yml']).toMatch(/password: !!js process\.env\.DATABASE_PASSWORD/)
    expect(files['cormi.yml']).toMatch(/database: my_app/)
    expect(files['.env']).toBe('DATABASE_PASSWORD=\n')
    expect(files['.gitignore']).toMatch(/^\.env$/m)
  })

  it('writes the commands of the package manager', () => {
    expect(create({ kind: 'api', pm: 'npm' }).files['README.md']).toMatch(/npm start {2,}/)
    expect(create({ kind: 'web', pm: 'pnpm' }).files['README.md']).toMatch(/pnpm build {2,}/)
  })

  it('imports nothing but types of server/ in the pages', () => {
    for (const kind of Object.keys(KINDS) as Kind[]) {
      for (const ui of Object.keys(UIS) as Options['ui'][]) {
        for (const bundler of Object.keys(BUNDLERS) as Options['bundler'][]) {
          for (const database of Object.keys(DATABASES) as Options['database'][]) {
            const { files } = create({ kind, ui, bundler, database })
            for (const [path, content] of Object.entries(files)) {
              if (!path.startsWith('src/')) continue
              expect(content, path).not.toMatch(/^import (?!type )[^\n]*from '[./]*server\//m)
            }
          }
        }
      }
    }
  })
})

describe('toPackageName', () => {
  it('makes a valid package name of a directory name', () => {
    expect(toPackageName('My App')).toBe('my-app')
    expect(toPackageName('.hidden')).toBe('hidden')
    expect(toPackageName('a@b!c')).toBe('a-b-c')
  })
})
