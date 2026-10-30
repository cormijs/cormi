import { describe, expect, it } from 'vitest'
import { toQiankunDocument } from '../src/document.ts'

const html = `<!DOCTYPE html>
<html>
<head>
<script type="module" src="/@vite/client"></script>
<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";
injectIntoGlobalHook(window);</script>
<link rel="modulepreload" href="/static/chunk.js">
<link rel="stylesheet" href="/static/cormi.css">
</head>
<body>
<div id="root"><p>app</p></div>
<script>window.__staticRouterHydrationData = {};</script>
<script type="module" src="/src/.cormi/entry.tsx"></script>
</body>
</html>`

describe('toQiankunDocument()', () => {
  const result = toQiankunDocument(html, 'app1', 'root')

  it('replaces module scripts and module preloads, keeping everything else', () => {
    expect(result).not.toMatch(/type="module"/)
    expect(result).not.toContain('modulepreload')
    expect(result).toContain('<link rel="stylesheet" href="/static/cormi.css">')
    expect(result).toContain('<div id="root"><p>app</p></div>')
    expect(result).toContain('<script>window.__staticRouterHydrationData = {};</script>')
  })

  it('loads the modules in order and exposes the lifecycles as window[name]', () => {
    const loader = result.slice(result.lastIndexOf('<script>'))
    expect(loader).toContain('[{"src":"/@vite/client"},{"code":"import { injectIntoGlobalHook } from \\"/@react-refresh\\";\\ninjectIntoGlobalHook(window);"},{"src":"/src/.cormi/entry.tsx"}]')
    expect(loader).toContain('global["app1"] = lifecycles')
    expect(loader).toContain('props.container.querySelector("#root")')
    expect(loader.indexOf('</script>')).toBe(loader.length - '</script>\n</body>\n</html>'.length)
  })
})
