import { Schema } from '@cormijs/core'
import { checkKey, encodeKey, type PutOptions, resolveContentType, Storage, type StorageBody, type StorageEntry, type StorageFile, type StorageObject } from '@cormijs/storage'
import { AwsClient } from 'aws4fetch'
import { Context } from 'cordis'

export interface Config {
  /** e.g. `https://s3.us-east-1.amazonaws.com`, `https://<account>.r2.cloudflarestorage.com`, `http://localhost:9000` */
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** `<endpoint>/<bucket>/<key>`; otherwise `<bucket>.<host>/<key>` */
  pathStyle: boolean
  /** the prefix of the keys in the bucket, e.g. `app/` */
  prefix: string
  /** where browsers fetch the files, e.g. a CDN or the public domain of a bucket; the bucket itself by default */
  publicUrl?: string
  /** the files are not public: `url()` is `undefined` */
  private: boolean
}

export const Config: Schema<Config> = Schema.object({
  endpoint: Schema.string().description('the endpoint of the service, e.g. https://s3.us-east-1.amazonaws.com'),
  region: Schema.string().default('us-east-1').description('auto for Cloudflare R2'),
  bucket: Schema.string(),
  accessKeyId: Schema.string(),
  secretAccessKey: Schema.string().role('secret'),
  pathStyle: Schema.boolean().default(true).description('<endpoint>/<bucket>/<key>; otherwise <bucket>.<host>/<key>'),
  prefix: Schema.string().default('').description('the prefix of the keys in the bucket'),
  publicUrl: Schema.string().description('where browsers fetch the files, e.g. a CDN'),
  private: Schema.boolean().default(false).description('the files are not public'),
})

/** `&amp;` -> `&` in the text of the XML of S3 */
function unescapeXml(text: string) {
  return text.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[\da-f]+);/gi, (_, entity: string) => {
    const names: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: '\'', amp: '&' }
    if (entity[0] !== '#') return names[entity.toLowerCase()]
    return String.fromCodePoint(entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
  })
}

function readTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? unescapeXml(match[1]) : undefined
}

/**
 * The files in a bucket of S3 or a compatible service (Cloudflare R2, MinIO,
 * Aliyun OSS, Tencent COS…), by signed requests (AWS Signature V4). A file is
 * uploaded whole, from memory.
 */
export class S3Storage extends Storage {
  private _client: AwsClient
  private _base: string

  constructor(ctx: Context, public config: Config) {
    super(ctx)
    this._client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region, service: 's3' })
    const endpoint = new URL(config.endpoint)
    this._base = config.pathStyle
      ? `${endpoint.origin}/${config.bucket}`
      : `${endpoint.protocol}//${config.bucket}.${endpoint.host}`
  }

  private _url(key: string) {
    return `${this._base}/${encodeKey(this.config.prefix + key)}`
  }

  private async _request(url: string, init: RequestInit = {}) {
    const response = await this._client.fetch(url, init)
    if (response.ok || response.status === 404 || response.status === 304) return response
    const text = await response.text()
    throw new Error(`S3 ${init.method ?? 'GET'} ${response.status}: ${readTag(text, 'Code') ?? response.statusText} ${readTag(text, 'Message') ?? ''}`.trim())
  }

  url(key: string) {
    if (this.config.private) return
    if (this.config.publicUrl) return `${this.config.publicUrl.replace(/\/$/, '')}/${encodeKey(key)}`
    return this._url(key)
  }

  private _object(key: string, response: Response): StorageObject {
    return {
      key,
      size: Number(response.headers.get('content-length') ?? 0),
      lastModified: new Date(response.headers.get('last-modified') ?? Date.now()),
      etag: response.headers.get('etag')?.replace(/^(W\/)?"|"$/g, '') ?? '',
      contentType: resolveContentType(key, response.headers.get('content-type') ?? undefined),
      cacheControl: response.headers.get('cache-control') ?? undefined,
      url: this.url(key),
    }
  }

  async put(key: string, body: StorageBody, options: PutOptions = {}) {
    checkKey(key)
    // S3 needs the length of the content beforehand
    const content = new Uint8Array(await new Response(body as BodyInit).arrayBuffer())
    const contentType = resolveContentType(key, options.contentType)
    const headers: Record<string, string> = { 'content-type': contentType }
    if (options.cacheControl) headers['cache-control'] = options.cacheControl
    const response = await this._request(this._url(key), { method: 'PUT', body: content, headers })
    return {
      key,
      size: content.byteLength,
      lastModified: new Date(),
      etag: response.headers.get('etag')?.replace(/^(W\/)?"|"$/g, '') ?? '',
      contentType,
      cacheControl: options.cacheControl,
      url: this.url(key),
    }
  }

  async head(key: string) {
    checkKey(key)
    const response = await this._request(this._url(key), { method: 'HEAD' })
    if (response.status === 404) return
    return this._object(key, response)
  }

  async get(key: string): Promise<StorageFile | undefined> {
    checkKey(key)
    const response = await this._request(this._url(key))
    if (response.status === 404) {
      await response.body?.cancel()
      return
    }
    return { ...this._object(key, response), body: response.body! }
  }

  async delete(key: string) {
    checkKey(key)
    await this._request(this._url(key), { method: 'DELETE' })
  }

  async list(prefix = '') {
    const entries: StorageEntry[] = []
    let token: string | undefined
    do {
      const query = new URLSearchParams({ 'list-type': '2', 'prefix': this.config.prefix + prefix })
      if (token) query.set('continuation-token', token)
      const xml = await (await this._request(`${this._base}?${query}`)).text()
      for (const [, contents] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = readTag(contents, 'Key')!.slice(this.config.prefix.length)
        entries.push({
          key,
          size: Number(readTag(contents, 'Size')),
          lastModified: new Date(readTag(contents, 'LastModified')!),
          etag: readTag(contents, 'ETag')?.replace(/^"|"$/g, '') ?? '',
          url: this.url(key),
        })
      }
      token = readTag(xml, 'IsTruncated') === 'true' ? readTag(xml, 'NextContinuationToken') : undefined
    } while (token)
    return entries.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  }
}

export const name = 'storage-s3'

/** `ctx.storage` in S3 or a compatible service, when the app serves (`cormi dev`, `cormi start`). */
export function apply(ctx: Context, config: Config) {
  if (!ctx.cormi.serving) return
  // required when the app serves: a build, or a check of the plugin, has no service to connect to
  const missing = (['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const).filter(key => !config[key])
  if (missing.length) throw new Error(`@cormijs/storage-s3 needs ${missing.join(', ')} in its config`)
  ctx.plugin(S3Storage, config)
}
