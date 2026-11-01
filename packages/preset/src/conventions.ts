import { basename, extname, join } from 'node:path'
import { watch } from 'chokidar'
import { expandExtensions, tryPaths, winPath } from '@cormi/core'
import type {} from '@cormi/rsbuild'
import type {} from '@cormi/vite'
import { Context } from 'cordis'
import postcss from 'postcss'

export const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js']
export const STYLE_EXTENSIONS = ['.css', '.less', '.scss', '.sass', '.styl']

/** Prepend `body` to the selectors of a stylesheet, so its rules win over rules of equal specificity. */
export function prefixSelectors(css: string, from?: string) {
  return postcss([{
    postcssPlugin: 'cormi-overrides',
    Once(root) {
      root.walkRules((rule) => {
        if (rule.parent?.type === 'atrule' && /keyframes$/i.test((rule.parent as postcss.AtRule).name)) return
        rule.selectors = rule.selectors.map(selector => /^(html|body|:root)\b/.test(selector) ? selector : `body ${selector}`)
      })
    },
  }]).process(css, { from }).css
}

/** Wrap a preprocessor stylesheet with `body`; module rules (`@use`, `@forward`) stay at the top. */
function nestInBody(code: string) {
  const head: string[] = []
  const body = code.split('\n').filter((line) => {
    if (!/^\s*@(use|forward)\b/.test(line)) return true
    head.push(line)
    return false
  })
  return [...head, 'body {', ...body, '}'].join('\n')
}

interface Convention {
  /** candidate files; the first existing one is used */
  files(): string[]
  /** contribute the file; returns a disposer */
  register(file: string): () => void
}

/**
 * The file conventions of the app. Each convention is a contribution that
 * exists while its file does:
 *
 * - `src/global.(css|less|scss|…)`, `src/global.(ts|tsx|…)`: imported before the app starts
 * - `src/app.(ts|tsx|…)`: the runtime plugin of the app
 * - `src/overrides.(css|less|scss|…)`: imported with `body` prepended to its selectors
 * - `public/favicon.(ico|png|svg)`: the icon, unless `favicons` is configured
 */
export function Conventions(ctx: Context) {
  const { paths } = ctx.cormi
  const inSrc = (name: string, extensions: string[]) => () => expandExtensions(join(paths.src, name), extensions)
  let overrides: string | undefined

  const conventions: Convention[] = [
    { files: inSrc('global', STYLE_EXTENSIONS), register: file => ctx.app.import(file) },
    { files: inSrc('global', SCRIPT_EXTENSIONS), register: file => ctx.app.import(file) },
    { files: inSrc('app', SCRIPT_EXTENSIONS), register: file => ctx.app.entry(file) },
    {
      files: inSrc('overrides', STYLE_EXTENSIONS),
      register(file) {
        overrides = file
        const dispose = ctx.app.import(file)
        return () => {
          overrides = undefined
          dispose()
        }
      },
    },
    {
      files: () => ['ico', 'png', 'svg'].map(ext => join(paths.public, `favicon.${ext}`)),
      register(file) {
        if (ctx.html.config.favicons.length) return () => {}
        const href = ctx.bundler.config.publicPath + basename(file)
        return ctx.html.head({ tag: 'link', attrs: { rel: 'icon', href } })
      },
    },
  ]

  const active = new Map<Convention, { file: string; dispose: () => void }>()
  const update = () => {
    for (const convention of conventions) {
      const found = tryPaths(convention.files())
      const file = found && winPath(found)
      const current = active.get(convention)
      if (current?.file === file) continue
      current?.dispose()
      active.delete(convention)
      if (file) active.set(convention, { file, dispose: convention.register(file) })
    }
  }
  update()

  // the selectors of src/overrides are prefixed as the bundler loads it
  const transformOverrides = (code: string, file: string) => extname(file) === '.css' ? prefixSelectors(code, file) : nestInBody(code)
  ctx.bundler.plugin({
    vite: {
      name: 'cormi:overrides',
      enforce: 'pre',
      async transform(code, id) {
        const file = id.split('?')[0]
        if (!overrides || file !== overrides) return
        return transformOverrides(code, file)
      },
    },
    rsbuild: {
      name: 'cormi:overrides',
      setup(api) {
        const test = (file: string) => !!overrides && winPath(file) === overrides
        api.transform({ test, enforce: 'pre' }, ({ code, resourcePath }) => transformOverrides(code, winPath(resourcePath)))
      },
    },
  })

  if (ctx.cormi.mode === 'dev') {
    ctx.effect(() => {
      const watcher = watch([paths.src, paths.public], { ignoreInitial: true, depth: 0 })
      watcher.on('add', update).on('unlink', update)
      // src/loading is read by the renderer when it generates the entry
      watcher.on('add', () => ctx.app.refresh()).on('unlink', () => ctx.app.refresh())
      return () => watcher.close()
    }, 'watch file conventions')
  }
}

export namespace Conventions {
  export const inject = ['app', 'html', 'bundler']
}
