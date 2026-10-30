import { Context, Service } from 'cordis'
import { Awaitable, Dict } from 'cosmokit'
import Schema from 'schemastery'

declare module 'cordis' {
  interface Context {
    html: Html
  }
}

const VOID_TAGS = ['meta', 'link', 'base']

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Render a tag; `content` is inserted verbatim (it is code for `script` / `style`). */
export function renderTag({ tag, attrs = {}, content }: Html.Tag) {
  const attributes = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => value === true ? ` ${key}` : ` ${key}="${escapeHtml(String(value))}"`)
    .join('')
  if (VOID_TAGS.includes(tag)) return `<${tag}${attributes}>`
  return `<${tag}${attributes}>${content ?? ''}</${tag}>`
}

function toScript(value: string | Html.Tag): Html.Tag {
  return typeof value === 'string' ? { tag: 'script', attrs: { src: value } } : value
}

function toStyle(value: string | Html.Tag): Html.Tag {
  return typeof value === 'string' ? { tag: 'link', attrs: { rel: 'stylesheet', href: value } } : value
}

/**
 * The HTML document of the app (`ctx.html`).
 *
 * Plugins add tags with `head()` / `body()` and rewrite the final markup with
 * `transform()`; each registration is an effect of the calling plugin.
 * `render()` is used by the dev server, the build and server-side rendering.
 */
export class Html extends Service {
  private _head = new Set<Html.Tag>()
  private _body = new Set<Html.Tag>()
  private _transforms = new Set<Html.Transform>()

  constructor(ctx: Context, public config: Html.Config) {
    super(ctx, 'html')
  }

  /** Add a tag to `<head>`. */
  head(tag: Html.Tag) {
    return this._register(this._head, tag, 'ctx.html.head()')
  }

  /** Add a tag at the end of `<body>`, after the app scripts. */
  body(tag: Html.Tag) {
    return this._register(this._body, tag, 'ctx.html.body()')
  }

  /** Rewrite the rendered document. Transforms run in registration order. */
  transform(transform: Html.Transform) {
    return this._register(this._transforms, transform, 'ctx.html.transform()')
  }

  async render(options: Html.RenderOptions = {}) {
    const { config } = this
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ]
    if (config.title) head.push(`<title>${escapeHtml(config.title)}</title>`)
    for (const href of config.favicons) head.push(renderTag({ tag: 'link', attrs: { rel: 'icon', href } }))
    for (const attrs of config.metas) head.push(renderTag({ tag: 'meta', attrs }))
    for (const attrs of config.links) head.push(renderTag({ tag: 'link', attrs }))
    for (const style of config.styles) head.push(renderTag(toStyle(style)))
    for (const href of options.styles ?? []) head.push(renderTag(toStyle(href)))
    for (const href of options.preloads ?? []) head.push(renderTag({ tag: 'link', attrs: { rel: 'modulepreload', href } }))
    for (const script of config.headScripts) head.push(renderTag(toScript(script)))
    for (const tag of this._head) head.push(renderTag(tag))
    if (options.head) head.push(options.head)

    const body = [`<div id="${escapeHtml(config.mountElementId)}">${options.content ?? ''}</div>`]
    if (options.body) body.push(options.body)
    for (const src of options.scripts ?? []) body.push(renderTag({ tag: 'script', attrs: { type: 'module', src } }))
    for (const script of config.scripts) body.push(renderTag(toScript(script)))
    for (const tag of this._body) body.push(renderTag(tag))

    let html = [
      '<!DOCTYPE html>',
      `<html lang="${escapeHtml(config.lang)}">`,
      '<head>',
      ...head,
      '</head>',
      '<body>',
      ...body,
      '</body>',
      '</html>',
      '',
    ].join('\n')
    for (const transform of this._transforms) html = await transform(html, options)
    return html
  }

  private _register<T>(set: Set<T>, value: T, label: string) {
    return this.ctx.effect(() => {
      set.add(value)
      return () => set.delete(value)
    }, label)
  }
}

export namespace Html {
  export type Attrs = Dict<string | number | boolean | undefined | null>

  export interface Tag {
    tag: string
    attrs?: Attrs
    /** inner markup, inserted verbatim */
    content?: string
  }

  export interface Config {
    title?: string
    lang: string
    /** id of the element the app is mounted into */
    mountElementId: string
    favicons: string[]
    metas: Attrs[]
    links: Attrs[]
    /** stylesheets: a URL or a tag */
    styles: (string | Tag)[]
    /** scripts at the end of `<body>`: a URL or a tag */
    scripts: (string | Tag)[]
    /** scripts in `<head>`: a URL or a tag */
    headScripts: (string | Tag)[]
  }

  export interface RenderOptions {
    /** URL of the request being rendered */
    url?: string
    /** server-rendered markup of the app */
    content?: string
    /** entry modules */
    scripts?: string[]
    /** entry stylesheets */
    styles?: string[]
    /** modules to preload */
    preloads?: string[]
    /** extra markup at the end of `<head>` */
    head?: string
    /** extra markup after the mount element, e.g. hydration data */
    body?: string
  }

  export type Transform = (html: string, options: RenderOptions) => Awaitable<string>

  const tag: Schema<string | Tag> = Schema.union([Schema.string(), Schema.object({
    tag: Schema.string().required(),
    attrs: Schema.dict(Schema.any()),
    content: Schema.string(),
  }) as Schema<Tag>])

  export const Config: Schema<Config> = Schema.object({
    title: Schema.string().description('document title'),
    lang: Schema.string().default('en').description('`lang` of `<html>`'),
    mountElementId: Schema.string().default('root').description('id of the element the app is mounted into'),
    favicons: Schema.array(String).default([]),
    metas: Schema.array(Schema.dict(Schema.any())).default([]),
    links: Schema.array(Schema.dict(Schema.any())).default([]),
    styles: Schema.array(tag).default([]),
    scripts: Schema.array(tag).default([]),
    headScripts: Schema.array(tag).default([]),
  })
}
