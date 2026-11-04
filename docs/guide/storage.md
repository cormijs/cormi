# 文件存储

`ctx.storage` 按键存取文件，例如上传的头像、附件。它和缓存一样只有一个接口，实现可以替换：

| 实现 | `cormi.yml` | 适用于 |
|---|---|---|
| 本地磁盘 | `@cormijs/storage` | 开发，或只有一台机器的应用；文件在 `data/storage`，公开在 `/storage/<key>` |
| S3 兼容服务 | `@cormijs/storage-s3` | AWS S3、Cloudflare R2、MinIO、阿里云 OSS、腾讯云 COS…… |

```yaml
- name: '@cormijs/storage'
```

```yaml
- name: '@cormijs/storage-s3'
  config:
    endpoint: https://<account>.r2.cloudflarestorage.com
    region: auto
    bucket: uploads
    accessKeyId: !!js process.env.S3_ACCESS_KEY_ID
    secretAccessKey: !!js process.env.S3_SECRET_ACCESS_KEY
    publicUrl: https://files.example.com      # 浏览器取文件的地址，例如 CDN
```

```sh
pnpm add @cormijs/storage                          # 本地磁盘
pnpm add @cormijs/storage @cormijs/storage-s3      # S3：@cormijs/storage 提供接口与类型
```

存储属于服务端，只在应用提供服务时运行；`server/env.d.ts` 中引用 `@cormijs/storage`，`ctx.storage` 就有了类型。

## 上传

表单中的文件就是 `File`，可以直接存入：

::: code-group

```ts [server/api/avatar.ts]
import type { ApiContext } from '@cormijs/cormi'

export const inject = ['storage']
export const auth = true

export async function POST(request: Request, { ctx, state }: ApiContext) {
  const file = (await request.formData()).get('avatar')
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return Response.json({ error: 'an image is required' }, { status: 400 })
  }
  const { url } = await ctx.storage.put(`avatars/${state.user!.id}`, file, { contentType: file.type })
  return { url }
}
```

:::

| 方法 | 作用 |
|---|---|
| `put(key, body, options?)` | 存入文件，替换同一个键的文件；`body` 是字符串、`Blob`/`File`、`ArrayBuffer`、`Uint8Array` 或流。`options` 有 `contentType`（默认按扩展名）与 `cacheControl` |
| `get(key)` | 文件与它的内容 `body`（流）；不存在时为 `undefined` |
| `head(key)` | 文件的信息，不含内容 |
| `delete(key)` | 删除文件 |
| `list(prefix?)` | 键以 `prefix` 开头的文件，按键排序 |
| `url(key)` | 浏览器取文件的地址；文件不公开时为 `undefined` |
| `response(key, request?)` | 带着文件的响应：不存在时 404，请求已有这个版本时 304 |

文件的信息有 `key`、`size`、`contentType`、`lastModified`、`etag`（内容变化时改变）与 `url`。

键是存储中的路径，如 `avatars/1.png`。它的每一段不能为空、不能以 `.` 开头，所以 `../`、`.env` 这样的键会被拒绝，文件不会写到存储之外。上传的文件名要清理之后才能作为键的一部分，见 `examples/with-api` 的 `server/api/files/index.ts`。

## 公开与私有

- 本地磁盘：文件公开在应用的 `/storage/<key>`（配置 `path`），带有 `ETag` 与 `Cache-Control`。`path: false` 时不公开；前面有 CDN 时，用 `baseUrl` 让 `url()` 指向它。
- S3：`url()` 是 `publicUrl` 下的地址；没有 `publicUrl` 时是存储桶本身的地址，要求存储桶允许公开读取。`private: true` 时不公开。

私有的文件由接口发出，接口先检查权限：

```ts
export const auth = true

export async function GET(request: Request, { ctx, params, state }: ApiContext<{ id: string }>) {
  const invoice = await ctx.database.get('invoice', { id: Number(params.id), owner: state.user!.id })
  if (!invoice.length) return new Response(null, { status: 404 })
  return ctx.storage.response(`invoices/${params.id}.pdf`, request)
}
```

## 配置

`@cormijs/storage`：

| 配置 | 默认值 | 说明 |
|---|---|---|
| `root` | `data/storage` | 文件所在的目录，相对于应用根目录；内容类型记在其中的 `.meta` |
| `path` | `/storage` | 文件公开的路径，`false` 不公开 |
| `baseUrl` | — | 代替 `path` 的地址，例如 CDN |
| `cacheControl` | `public, max-age=3600` | 文件没有设置时的 `Cache-Control` |

`@cormijs/storage-s3`：

| 配置 | 默认值 | 说明 |
|---|---|---|
| `endpoint` | — | 服务的地址，如 `https://s3.us-east-1.amazonaws.com`、`http://localhost:9000` |
| `region` | `us-east-1` | Cloudflare R2 用 `auto` |
| `bucket` | — | 存储桶 |
| `accessKeyId`、`secretAccessKey` | — | 访问密钥，从环境变量读取 |
| `pathStyle` | `true` | `<endpoint>/<bucket>/<key>`；`false` 时是 `<bucket>.<host>/<key>` |
| `prefix` | `''` | 存储桶中键的前缀，几个应用共用一个存储桶时使用 |
| `publicUrl` | — | 浏览器取文件的地址 |
| `private` | `false` | 文件不公开 |

S3 的请求用 AWS Signature V4 签名（[aws4fetch](https://github.com/mhart/aws4fetch)），不依赖 AWS SDK。上传的文件先读入内存，再整个上传。

两个实现运行同一组测试（`packages/storage/tests/contract.ts`），S3 的测试在 MinIO 上运行。
