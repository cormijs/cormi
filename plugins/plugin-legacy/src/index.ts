import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import legacy from '@vitejs/plugin-legacy'
import { type Context, renderTag, Schema, winPath } from 'cormi'
import type {} from '@cormijs/vite'

export const name = 'legacy'
export const inject = ['app', 'html', 'vite']

export interface Config {
  /** browserslist query of the legacy bundle (default: `defaults`) */
  targets?: string | string[]
  /** polyfills of the modern bundle */
  modernPolyfills: boolean
}

export const Config: Schema<Config> = Schema.object({
  targets: Schema.union([String, Schema.array(String)]).description('browserslist query of the legacy bundle'),
  modernPolyfills: Schema.boolean().default(false).description('polyfills of the modern bundle'),
})

// the inline scripts of @vitejs/plugin-legacy 7, which only adds them to documents Vite builds
const LEGACY_POLYFILL_ID = 'vite-legacy-polyfill'
const LEGACY_ENTRY_ID = 'vite-legacy-entry'
const SYSTEMJS_INLINE_CODE = `System.import(document.getElementById('${LEGACY_ENTRY_ID}').getAttribute('data-src'))`
const SAFARI10_NO_MODULE_FIX = `!function(){var e=document,t=e.createElement("script");if(!("noModule"in t)&&"onbeforeload"in t){var n=!1;e.addEventListener("beforeload",(function(e){if(e.target===t)n=!0;else if(!e.target.hasAttribute("nomodule")||!n)return;e.preventDefault()}),!0),t.type="module",t.src=".",e.head.appendChild(t),t.remove()}}();`
const DETECT_MODERN_BROWSER_CODE = `import.meta.url;import("_").catch(()=>1);(async function*(){})().next();window.__vite_is_modern_browser=true`
const DYNAMIC_FALLBACK_CODE = `!function(){if(window.__vite_is_modern_browser)return;console.warn("vite: loading legacy chunks, syntax error above and the same error below should be ignored");var e=document.getElementById("${LEGACY_POLYFILL_ID}"),n=document.createElement("script");n.src=e.src,n.onload=function(){${SYSTEMJS_INLINE_CODE}},document.body.appendChild(n)}();`

interface LegacyAssets {
  entry: string
  polyfills: string
  modernPolyfills?: string
}

/** The tags of the legacy bundle, as @vitejs/plugin-legacy adds them. */
export function injectLegacyTags(html: string, assets: LegacyAssets, crossorigin?: string | false) {
  const cors = crossorigin || true
  const head = [
    ...assets.modernPolyfills ? [renderTag({ tag: 'script', attrs: { type: 'module', crossorigin: cors, src: assets.modernPolyfills } })] : [],
    renderTag({ tag: 'script', attrs: { type: 'module' }, content: DETECT_MODERN_BROWSER_CODE }),
    renderTag({ tag: 'script', attrs: { type: 'module' }, content: DYNAMIC_FALLBACK_CODE }),
  ]
  const body = [
    renderTag({ tag: 'script', attrs: { nomodule: true }, content: SAFARI10_NO_MODULE_FIX }),
    renderTag({ tag: 'script', attrs: { nomodule: true, crossorigin: cors, id: LEGACY_POLYFILL_ID, src: assets.polyfills } }),
    renderTag({ tag: 'script', attrs: { 'nomodule': true, 'crossorigin': cors, 'id': LEGACY_ENTRY_ID, 'data-src': assets.entry }, content: SYSTEMJS_INLINE_CODE }),
  ]
  return html
    .replace('</head>', `${head.join('\n')}\n</head>`)
    .replace('</body>', `${body.join('\n')}\n</body>`)
}

/**
 * Bundles for browsers without ES modules, with @vitejs/plugin-legacy: the
 * documents of the app load the legacy bundle in those browsers.
 */
export function apply(ctx: Context, config: Config) {
  ctx.vite.plugin(env => env.ssr ? [] : legacy({ targets: config.targets, modernPolyfills: config.modernPolyfills }))
  if (ctx.cormi.mode === 'dev') return

  let assets: Promise<LegacyAssets | undefined> | undefined
  const load = async (): Promise<LegacyAssets | undefined> => {
    const manifest = JSON.parse(await readFile(join(ctx.vite.outDir, '.vite/manifest.json'), 'utf8').catch(() => '{}'))
    const base = ctx.vite.config.publicPath.replace(/\/?$/, '/')
    const entry = manifest[winPath(relative(ctx.cormi.cwd, ctx.app.clientEntry)).replace(/(\.\w+)$/, '-legacy$1')]
    const polyfills = manifest['vite/legacy-polyfills-legacy']
    if (!entry || !polyfills) return
    const modernPolyfills = manifest['vite/legacy-polyfills']
    return {
      entry: base + entry.file,
      polyfills: base + polyfills.file,
      modernPolyfills: modernPolyfills && base + modernPolyfills.file,
    }
  }
  // the manifest changes with every build
  ctx.on('build/before', () => {
    assets = undefined
  })
  ctx.html.transform(async (html) => {
    const legacyAssets = await (assets ??= load())
    return legacyAssets ? injectLegacyTags(html, legacyAssets, ctx.html.config.crossorigin) : html
  })
}
