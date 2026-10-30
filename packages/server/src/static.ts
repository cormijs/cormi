import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import type {} from '@cordisjs/plugin-server'
import type {} from '@cormi/vite'
import { Context } from 'cordis'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
}

/** Directories of the build output that are not served. */
const PRIVATE = ['server', '.vite']

/**
 * Serve the build output (preview mode). Hashed assets below `static/` are
 * cached forever; everything else is revalidated.
 */
export function Static(ctx: Context) {
  const root = ctx.vite.outDir
  const prefix = ctx.vite.config.publicPath.replace(/\/$/, '')

  ctx.server.use(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (!pathname.startsWith(prefix + '/')) return next()
    pathname = pathname.slice(prefix.length)
    const file = join(root, normalize(pathname))
    if (!file.startsWith(root + sep) || PRIVATE.some(dir => file.startsWith(join(root, dir) + sep))) return next()
    const stats = await stat(file).catch(() => undefined)
    if (!stats?.isFile()) return next()
    res.status = 200
    res.headers.set('content-type', TYPES[extname(file)] ?? 'application/octet-stream')
    res.headers.set('content-length', String(stats.size))
    res.headers.set('cache-control', pathname.startsWith('/static/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    res.body = req.method === 'HEAD' ? null : Readable.toWeb(createReadStream(file)) as ReadableStream
  })
}

export namespace Static {
  export const inject = ['server', 'vite']
}
