const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>\n?/gi
const MODULE_RE = /\btype\s*=\s*["']?module["']?/i
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i
const MODULE_PRELOAD_RE = /<link\b[^>]*\brel\s*=\s*["']?modulepreload["']?[^>]*>\n?/gi

interface ModuleScript {
  src?: string
  code?: string
}

/**
 * The loader of a micro app. It runs as a classic script in qiankun's sandbox
 * (qiankun evaluates scripts and cannot run ES modules), imports the modules
 * of the document in order, and exposes the lifecycles of the last one — the
 * entry — as `window[name]`, where qiankun looks for them.
 */
function renderLoader(name: string, mountElementId: string, scripts: ModuleScript[]) {
  const json = JSON.stringify
  return `(function (global) {
  var publicPath = global.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ || location.origin + '/';
  var origin = new URL(publicPath).origin;
  function load(script) {
    if (script.src) return import(new URL(script.src, publicPath).href);
    // an inline module imports absolute paths of this app's server
    var code = script.code.replace(/((?:from|import)\\s*\\(?\\s*)(["'])\\/(?!\\/)/g, '$1$2' + origin + '/');
    return import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
  }
  var ready = ${json(scripts)}.reduce(function (task, script) {
    return task.then(function () { return load(script); });
  }, Promise.resolve());
  function options(props) {
    if (!props || !props.container) return {};
    return {
      container: props.container.querySelector(${json(`#${mountElementId}`)}) || props.container,
      basename: props.base,
      origin: origin,
      props: props,
    };
  }
  var lifecycles = {};
  ['bootstrap', 'mount', 'update', 'unmount'].forEach(function (key) {
    lifecycles[key] = function (props) {
      return ready.then(function (entry) { return entry[key](options(props)); });
    };
  });
  global[${json(name)}] = lifecycles;
  if (!global.__POWERED_BY_QIANKUN__) lifecycles.mount();
})(window);`
}

/**
 * Turn a document of the app into one qiankun can load: module scripts are
 * replaced with a loader, module preloads (which would resolve against the
 * master's origin) are removed. The document still works by itself.
 */
export function toQiankunDocument(html: string, name: string, mountElementId: string) {
  const scripts: ModuleScript[] = []
  html = html
    .replace(SCRIPT_RE, (tag, attrs: string, code: string) => {
      if (!MODULE_RE.test(attrs)) return tag
      const src = SRC_RE.exec(attrs)?.[1]
      scripts.push(src ? { src } : { code })
      return ''
    })
    .replace(MODULE_PRELOAD_RE, '')
  const loader = `<script>${renderLoader(name, mountElementId, scripts)}</script>\n`
  return html.includes('</body>') ? html.replace('</body>', `${loader}</body>`) : html + loader
}
