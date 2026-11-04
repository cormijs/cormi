# @cormijs/storage-s3

[![npm](https://img.shields.io/npm/v/@cormijs/storage-s3/next?style=flat-square)](https://www.npmjs.com/package/@cormijs/storage-s3)

The file storage of a Cormi app (ctx.storage) in S3 or a compatible service: AWS, Cloudflare R2, MinIO, Aliyun OSS…

```yaml
- name: '@cormijs/storage-s3'
  config:
    endpoint: https://s3.us-east-1.amazonaws.com
    bucket: uploads
    accessKeyId: !!js process.env.S3_ACCESS_KEY_ID
    secretAccessKey: !!js process.env.S3_SECRET_ACCESS_KEY
```

这是 [Cormi](https://github.com/cormijs/cormi) 的一部分：以 Cordis 为插件宿主的全栈框架。文档见 [文件存储](https://cormi.js.org/guide/storage)。
