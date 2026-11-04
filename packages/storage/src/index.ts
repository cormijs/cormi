import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {} from '@cordisjs/plugin-server'
import { Schema, winPath } from '@cormijs/core'
import { getContentType, toRequest } from '@cormijs/server'
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    storage: Storage
  }
}

/** The content of a file to store: what a fetch API `Response` takes, e.g. a `File` of a form. */
export type StorageBody = string | Blob | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>

export interface PutOptions {
  /** e.g. `image/png`; by default from the extension of the key */
  contentType?: string
  /** the `Cache-Control` of the file when it is served */
  cacheControl?: string
}

/** A file in a list. */
export interface StorageEntry {
  key: string
  size: number
  lastModified: Date
  /** changes with the content, for `ETag` */
  etag: string
  /** where browsers fetch the file, if the files are public */
  url?: string
}

export interface StorageObject extends StorageEntry {
  contentType: string
  cacheControl?: string
}

export interface StorageFile extends StorageObject {
  body: ReadableStream<Uint8Array>
}

/**
 * A key of a file is a path below the storage: `avatars/1.png`. Its segments
 * are not empty and do not begin with a dot, so a key cannot leave the
 * storage (`../`) or name a hidden file.
 */
export function checkKey(key: string) {
  if (typeof key !== 'string' || !key || key.length > 1024 || key.includes('\\') || key.split('/').some(segment => !segment || segment.startsWith('.'))) {
    throw new TypeError(`invalid key of a file: ${JSON.stringify(key)}`)
  }
  return key
}

/** `photos/a b.png` -> `photos/a%20b.png` */
export function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/')
}

/** The content type of a file: the given one, or by the extension of its key. */
export function resolveContentType(key: string, contentType?: string) {
  return contentType || getContentType(key) || 'application/octet-stream'
}

/**
 * The file storage of the app (`ctx.storage`): files by key, with their
 * content type. Implementations: on the local disk (`@cormijs/storage`) and
 * in S3 or a compatible service (`@cormijs/storage-s3`).
 */
export abstract class Storage extends Service {
  constructor(ctx: Context) {
    super(ctx, 'storage')
  }

  /** Store a file under a key, replacing the file of that key. */
  abstract put(key: string, body: StorageBody, options?: PutOptions): Promise<StorageObject>

  /** A file with its content, or `undefined`. */
  abstract get(key: string): Promise<StorageFile | undefined>

  /** A file without its content, or `undefined`. */
  abstract head(key: string): Promise<StorageObject | undefined>

  /** Delete a file; nothing happens if there is none. */
  abstract delete(key: string): Promise<void>

  /** The files whose keys begin with `prefix` (e.g. `avatars/`), sorted by key. */
  abstract list(prefix?: string): Promise<StorageEntry[]>

  /** Where browsers fetch a file: `undefined` if the files are not public. */
  abstract url(key: string): string | undefined

  /**
   * A response with a file, e.g. for an API route that serves private files:
   * 404 without the file, 304 when the request has its version already.
   */
  async response(key: string, request?: Request) {
    const file = await this.get(key).catch((error) => {
      if (error instanceof TypeError) return undefined
      throw error
    })
    if (!file) return new Response(null, { status: 404 })
    const etag = `"${file.etag}"`
    const headers = new Headers({
      'content-type': file.contentType,
      'content-length': String(file.size),
      'etag': etag,
      'last-modified': file.lastModified.toUTCString(),
    })
    if (file.cacheControl) headers.set('cache-control', file.cacheControl)
    if (request?.headers.get('if-none-match') === etag) {
      await file.body.cancel()
      return new Response(null, { status: 304, headers })
    }
    if (request?.method === 'HEAD') await file.body.cancel()
    return new Response(request?.method === 'HEAD' ? null : file.body, { headers })
  }
}

interface Meta {
  contentType: string
  cacheControl?: string
}

/**
 * The files on the local disk, in `root` (default `data/storage`), and their
 * content types in `root/.meta`. With `path`, they are public at that path of
 * the app (default `/storage/<key>`).
 */
export class LocalStorage extends Storage {
  readonly root: string

  constructor(ctx: Context, public config: LocalStorage.Config) {
    super(ctx)
    this.root = ctx.cormi.resolve(config.root)
    const path = config.path && config.path.replace(/\/$/, '')
    if (path) {
      ctx.inject(['server'], (ctx) => {
        ctx.server.get(`${path}/*key`, async (req) => {
          const key = [req.params.key ?? []].flat().join('/')
          return this.response(key, toRequest(req))
        })
      })
    }
  }

  private _file(key: string) {
    return join(this.root, ...checkKey(key).split('/'))
  }

  private _meta(key: string) {
    return join(this.root, '.meta', ...key.split('/')) + '.json'
  }

  url(key: string) {
    const base = this.config.baseUrl || (this.config.path && this.config.path.replace(/\/$/, ''))
    return base ? `${base.replace(/\/$/, '')}/${encodeKey(key)}` : undefined
  }

  async put(key: string, body: StorageBody, options: PutOptions = {}) {
    const file = this._file(key)
    await mkdir(dirname(file), { recursive: true })
    // written whole, then renamed: a request never reads half a file
    const temp = join(dirname(file), `.${randomBytes(8).toString('hex')}.tmp`)
    try {
      const stream = new Response(body as BodyInit).body
      if (stream) await pipeline(Readable.fromWeb(stream as any), createWriteStream(temp))
      else await writeFile(temp, '')
      await rename(temp, file)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    const meta: Meta = { contentType: resolveContentType(key, options.contentType), cacheControl: options.cacheControl }
    await mkdir(dirname(this._meta(key)), { recursive: true })
    await writeFile(this._meta(key), JSON.stringify(meta))
    return (await this.head(key))!
  }

  private async _entry(key: string, file: string): Promise<StorageEntry | undefined> {
    const stats = await stat(file).catch(() => undefined)
    if (!stats?.isFile()) return
    return {
      key,
      size: stats.size,
      lastModified: stats.mtime,
      etag: `${stats.size.toString(36)}-${Math.floor(stats.mtimeMs).toString(36)}`,
      url: this.url(key),
    }
  }

  async head(key: string) {
    const entry = await this._entry(key, this._file(key))
    if (!entry) return
    const meta: Partial<Meta> = JSON.parse(await readFile(this._meta(key), 'utf8').catch(() => '{}'))
    return { ...entry, contentType: resolveContentType(key, meta.contentType), cacheControl: meta.cacheControl ?? this.config.cacheControl }
  }

  async get(key: string) {
    const object = await this.head(key)
    if (!object) return
    return { ...object, body: Readable.toWeb(createReadStream(this._file(key))) as ReadableStream<Uint8Array> }
  }

  async delete(key: string) {
    await rm(this._file(key), { force: true })
    await rm(this._meta(key), { force: true })
  }

  async list(prefix = '') {
    const files = await readdir(this.root, { recursive: true, withFileTypes: true }).catch(() => [])
    const entries: StorageEntry[] = []
    for (const dirent of files) {
      if (!dirent.isFile()) continue
      const file = join(dirent.parentPath, dirent.name)
      const key = winPath(relative(this.root, file))
      // the metadata, the files being written
      if (!key.startsWith(prefix) || key.split('/').some(segment => segment.startsWith('.'))) continue
      const entry = await this._entry(key, file)
      if (entry) entries.push(entry)
    }
    return entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  }
}

export namespace LocalStorage {
  export interface Config {
    /** the directory of the files, relative to the app root */
    root: string
    /** the path of the app where the files are public, or `false` for private files */
    path: string | false
    /** the URL of the files instead of `path`, e.g. a CDN in front of the app */
    baseUrl?: string
    /** the `Cache-Control` of the files that do not set one */
    cacheControl: string
  }

  export const Config: Schema<Config> = Schema.object({
    root: Schema.string().default('data/storage').description('the directory of the files, relative to the app root'),
    path: Schema.union([String, Schema.const(false)]).default('/storage').description('where the files are public, or false'),
    baseUrl: Schema.string().description('the URL of the files instead of path, e.g. a CDN'),
    cacheControl: Schema.string().default('public, max-age=3600').description('the Cache-Control of the files that do not set one'),
  })
}

export const name = 'storage'

export const Config = LocalStorage.Config

/**
 * The files on the local disk. Like every implementation of the storage, it
 * provides `ctx.storage` when the app serves (`cormi dev`, `cormi start`).
 */
export function apply(ctx: Context, config: LocalStorage.Config) {
  if (!ctx.cormi.serving) return
  ctx.plugin(LocalStorage, config)
}
