import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { watch } from 'chokidar'
import { type App, type Context, expandExtensions, readJSON, Schema, tryPaths, winPath } from 'cormi'
import type {} from '@cormi/react'

export const name = 'mpa'
// the pages are rendered with React
export const inject = ['app', 'html', 'router', 'bundler', 'react']

export interface Config {
  /** directory of pages: each `<dir>/<name>/index.tsx` is a page */
  dir: string
}

export const Config: Schema<Config> = Schema.object({
  dir: Schema.string().default('src/pages').description('directory of pages'),
})

export interface Page {
  name: string
  file: string
  /** from `<dir>/<name>/config.json` */
  title?: string
}

const PAGE_EXTENSIONS = ['.tsx', '.jsx', '.ts', '.js']

function toSpecifier(dir: string, file: string) {
  if (!isAbsolute(file)) return file
  const path = winPath(relative(dir, file))
  return path.startsWith('.') ? path : `./${path}`
}

/** The browser entry of a page: the runtime plugins of the app, then the page, without a router. */
export function renderPageEntry(app: App, page: Page, mountElementId: string) {
  const dir = join(app.dir, 'plugin-mpa')
  const json = JSON.stringify
  const entries = [...app.entries]
  return [
    ...[...app.imports].map(({ source }) => `import ${json(toSpecifier(dir, source))}`),
    `import { Context, renderPage, unwrapExports } from '@cormi/react/client'`,
    `import Page from ${json(toSpecifier(dir, page.file))}`,
    ...entries.map((entry, index) => `import * as entry${index} from ${json(toSpecifier(dir, entry.file))}`),
    '',
    `const ctx = new Context({ routes: {}, routeModules: {} })`,
    `const fibers = [${entries.map((entry, index) => `ctx.plugin(unwrapExports(entry${index}), ${entry.config === undefined ? 'undefined' : json(entry.config)})`).join(', ')}]`,
    `void Promise.allSettled(fibers).then(() => renderPage(ctx, Page, { mountElementId: ${json(mountElementId)} }))`,
    '',
  ].join('\n')
}

/**
 * A multi-page app: every `src/pages/<name>/index.tsx` is a page of its own,
 * `<name>.html`, rendered without a router; `index` is the home page. The
 * runtime plugins of the app (and `src/app`) apply to every page.
 */
export function apply(ctx: Context, config: Config) {
  const dir = ctx.cormi.resolve(config.dir)
  const { mountElementId } = ctx.html.config
  const scan = (): Page[] => {
    if (!existsSync(dir)) return []
    return readdirSync(dir, { withFileTypes: true }).filter(dirent => dirent.isDirectory()).flatMap((dirent) => {
      const file = tryPaths(expandExtensions(join(dir, dirent.name, 'index'), PAGE_EXTENSIONS))
      if (!file) return []
      const { title } = readJSON(join(dir, dirent.name, 'config.json')) ?? {}
      return [{ name: dirent.name, file: winPath(file), title }]
    }).sort((a, b) => a.name.localeCompare(b.name))
  }
  const entryOf = (page: Page) => join(ctx.app.dir, `plugin-mpa/${page.name}.tsx`)

  // a multi-page app has no routes
  ctx.router.patch((routes) => {
    for (const id of Object.keys(routes)) delete routes[id]
  })

  let pages: Page[] = []
  const registered = new Map<string, () => void>()
  const update = () => {
    pages = scan()
    for (const [name, dispose] of registered) {
      if (pages.some(page => page.name === name)) continue
      dispose()
      registered.delete(name)
    }
    for (const page of pages) {
      if (registered.has(page.name)) continue
      const disposeFile = ctx.app.file(`plugin-mpa/${page.name}.tsx`, () => renderPageEntry(ctx.app, page, mountElementId))
      const disposeInput = ctx.bundler.input(`mpa/${page.name}`, entryOf(page))
      registered.set(page.name, () => {
        disposeInput()
        disposeFile()
      })
    }
  }
  update()

  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch(dir, { ignoreInitial: true, depth: 1 })
      watcher.on('add', update).on('unlink', update).on('addDir', update).on('unlinkDir', update)
      return () => watcher.close()
    }, 'watch pages')
  }

  ctx.on('build/after', async (result) => {
    for (const page of pages) {
      const assets = result.inputs[`mpa/${page.name}`]
      const html = await ctx.html.render({ url: `/${page.name}`, title: page.title, scripts: assets.js, styles: assets.css, preloads: assets.preload })
      const file = join(result.outDir, `${page.name}.html`)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, html)
      if (page.name === 'index') await writeFile(join(result.outDir, 'index.html'), html)
    }
  })

  ctx.inject(['server'], (ctx) => {
    // `/`, `/<name>` and `/<name>.html`; other paths are not pages of the app
    ctx.server.get(/^\/(.*?)(?:\.html)?$/, async (req) => {
      const page = pages.find(page => page.name === (req.params[1] || 'index'))
      const headers = { 'content-type': 'text/html; charset=utf-8' }
      if (!page) return new Response('Not Found', { status: 404, headers })
      if (ctx.cormi.mode !== 'dev') {
        return new Response(await readFile(join(ctx.bundler.outDir, `${page.name}.html`)), { headers })
      }
      const script = ctx.bundler.config.publicPath + winPath(relative(ctx.cormi.cwd, entryOf(page)))
      let html = await ctx.html.render({ url: req.url, title: page.title, scripts: [script] })
      html = await ctx.bundler.transformDocument(req.url, html)
      return new Response(html, { headers })
    })
  })
}
