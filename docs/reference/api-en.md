# English API Reference

This page is a concise English reference for the core APIs, conventions, CLI commands, and services of **Cormi**. Machine-readable summaries are also available at [`/llms.txt`](/llms.txt) and [`/llms-full.txt`](/llms-full.txt).

## 1. Project Conventions

| Path | Side | Role |
|---|---|---|
| `cormi.yml` | App | Declarative Cordis plugin tree (`@cormijs/preset`, bundler, UI framework, services, plugins) |
| `src/pages/**` | Pages | File-based page routes (`index.tsx` -> `/`, `users/[id].tsx` -> `/users/:id`) |
| `src/layouts/index.{tsx,vue}` | Pages | Global layout wrapping all page routes |
| `src/app.{ts,tsx}` | Pages | Browser-side Cordis runtime plugin |
| `src/.cormi/` | Generated | Generated routes, entry, `tsconfig.json`, and `api.d.ts` (RPC types) |
| `server/env.d.ts` | Server | Triple-slash `/// <reference types="..." />` lines for server services |
| `server/index.ts` | Server | Server-side Cordis plugin (e.g. middlewares) |
| `server/models/*.ts` | Server | Database table definitions (`ctx.model.extend`) |
| `server/api/**` | Server | File-based HTTP API routes (`todos/[id].ts` -> `/api/todos/:id`) |
| `plugins/*` | Workspace | Local plugin packages resolved directly from TypeScript source |

### Boundary Between `src/` and `server/`

Files in `src/` must **never** import runtime values from `server/`. The two sides communicate in three ways only:
1. **HTTP / Typed RPC**: Call `api` from `@cormijs/cormi/client` (or `@cormijs/react/client`, `@cormijs/vue/client`) or `fetch('/api/...')`.
2. **Server `loader`**: In `src/pages/**`, `export async function loader({ context })` runs on the server and reads services from `context.ctx` and request state from `context.state`.
3. **Types**: Import TypeScript types using `import type { Todo } from '../../server/models/todo'`.

---

## 2. CLI Commands (`cormi`)

| Command | Description |
|---|---|
| `cormi dev` | Start dev server (`http://localhost:8000`) and dev console (`/__cormi/`) |
| `cormi build` | Build page bundles (`dist/`) and compile server code (`dist/node/`) |
| `cormi start` | Run production server from `dist/` (alias: `preview`) |
| `cormi setup` | Generate `src/.cormi/` files and exit |
| `cormi info [--json]` | Print app kind, stack, page routes, API routes, plugins, and services |
| `cormi check [--json]` | Structured diagnostics: TypeScript, boundary imports, plugins, config, declarations |
| `cormi mcp [--url <url>]` | Start Model Context Protocol (MCP) stdio server for AI agents |
| `cormi g <type> <name>` | Run code generator (`page`, `component`, `api`, `model`, `mock`, `plugin`) |
| `cormi config [name]` | List plugin tree or print resolved config of matching plugins |
| `cormi plugin check` | Verify plugin compatibility declarations across bundlers and UI frameworks |

---

## 3. Server API (`@cormijs/cormi`)

### API Route Module (`server/api/**`)

```ts
import type { ApiContext, ApiRequest } from '@cormijs/cormi'
import { json } from '@cormijs/cormi'

// Declare injected services; route answers 503 until all are active
export const inject = ['database']

// Optional authentication rule (@cormijs/plugin-auth): true or (user, req) => boolean
export const auth = true

type Params = { id: string }

export async function GET(request: Request, { params, ctx, state, ip }: ApiContext<Params>) {
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo ?? Response.json({ error: 'not found' }, { status: 404 })
}

export async function PATCH(
  request: ApiRequest<{ title?: string; done?: boolean }>,
  { params, ctx }: ApiContext<Params>,
) {
  const body = await request.json()
  await ctx.database.set('todo', { id: Number(params.id) }, body)
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return json(todo, 200)
}
```

### In-Process Testing (`createApp` & `app.fetch`)

```ts
import { createApiClient, createApp } from '@cormijs/cormi'

const app = await createApp({ cwd: process.cwd() })
const response = await app.fetch('/api/todos')
const todos = await response.json()

// Or use the typed RPC client against app.fetch:
const client = createApiClient({ fetch: app.fetch })
const list = await client.get('/api/todos')

await app.close()
```

### Middlewares (`ctx.middleware`)

```ts
// server/index.ts
import type { Context } from '@cormijs/cormi'

declare module '@cormijs/cormi' {
  interface State {
    requestId: string
  }
}

export const inject = ['middleware']

export function apply(ctx: Context) {
  ctx.middleware.use(async (request, { state, ip }, next) => {
    state.requestId = crypto.randomUUID()
    const response = await next()
    response.headers.set('x-request-id', state.requestId)
    return response
  }, { order: -50, path: '/api' })
}
```

### Cookies (`getCookies` & `setCookie`)

```ts
import { getCookies, setCookie } from '@cormijs/cormi'

const cookies = getCookies(request)
const response = Response.json({ ok: true })
setCookie(response, 'theme', 'dark', { httpOnly: true, sameSite: 'lax', maxAge: 86400 })
```

---

## 4. Client & Typed RPC API (`@cormijs/cormi/client`)

`src/.cormi/api.d.ts` automatically augments `ApiRoutes` with the types of every module in `server/api/**`.

```ts
import { api, createApiClient } from '@cormijs/cormi/client'

// Path-based calls (route path, method, params, body, and return type are all inferred)
const todos = await api.get('/api/todos')
const created = await api.post('/api/todos', { title: 'Ship feature' })
const updated = await api.patch(`/api/todos/${created.id}`, { done: true })
await api.delete('/api/todos/:id', { params: { id: created.id } })

// Hono-style RPC chains ($get/$post return TypedResponse<T>; get/post return parsed data T)
const res = await api.todos.$get()
const data = await res.json()
const item = await api.todos[':id'].patch({ done: true }, { param: { id: 1 } })
```

### Page Loaders (React & Vue)

```tsx
// React: src/pages/index.tsx
import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData } from '@cormijs/react/client'

export async function loader({ context, params, request }: LoaderFunctionArgs<LoaderContext>) {
  return context.ctx.database.get('todo', {}, { sort: { id: 'asc' } })
}

export default function Home() {
  const todos = useLoaderData<typeof loader>()
  return <ul>{todos.map(t => <li key={t.id}>{t.title}</li>)}</ul>
}
```

---

## 5. Server Services Reference

Always reference active server service packages in `server/env.d.ts`:

```ts
/// <reference types="@cormijs/database" />
/// <reference types="@cormijs/cache" />
/// <reference types="@cormijs/storage" />
/// <reference types="@cormijs/plugin-session" />
/// <reference types="@cormijs/plugin-auth" />
/// <reference types="@cormijs/ai" />
```

### `ctx.model` & `ctx.database` (`@cormijs/database`)

- `ctx.model.extend(name, fields, { primary?, autoInc?, unique?, indexes? })`
- `ctx.database.get(table, query, { sort?, limit?, offset?, fields? })`
- `ctx.database.create(table, row)`
- `ctx.database.set(table, query, data)`
- `ctx.database.upsert(table, rows, keys?)`
- `ctx.database.remove(table, query)`
- `ctx.database.eval(table, expr, query?)`

### `ctx.cache` (`@cormijs/cache`, `@cormijs/cache-redis`, `@cormijs/cache-database`)

- `ctx.cache.get(table, key)`
- `ctx.cache.set(table, key, value, maxAgeMs?)`
- `ctx.cache.getOrSet(table, key, factory, maxAgeMs?)`
- `ctx.cache.increment(table, key, delta?, maxAgeMs?)`
- `ctx.cache.delete(table, key)` / `ctx.cache.clear(table)` / `ctx.cache.keys(table)`

### `ctx.storage` (`@cormijs/storage`, `@cormijs/storage-s3`)

- `ctx.storage.put(key, body, { contentType?, cacheControl? })`
- `ctx.storage.get(key)` / `ctx.storage.head(key)` / `ctx.storage.delete(key)`
- `ctx.storage.list(prefix?)` / `ctx.storage.url(key)` / `ctx.storage.response(key, request?)`

### `ctx.auth` (`@cormijs/plugin-auth` + `@cormijs/plugin-session`)

- `ctx.auth.hash(password)` / `ctx.auth.verify(password, hash)`
- `ctx.auth.login(state, user)` / `ctx.auth.logout(state)`
- `state.user` / `state.session`

### `ctx.ai` (`@cormijs/ai`, `@cormijs/ai-openai`, `@cormijs/ai-anthropic`)

- `ctx.ai.chat(promptOrMessages, { system?, model?, temperature?, maxTokens?, tools?, maxSteps? })`
- `ctx.ai.stream(promptOrMessages, options)` -> `ChatStream` (`for await`, `.textStream`, `.text()`, `.toResponse()`, `.toTextResponse()`)
- `ctx.ai.tool(name, { description, input, handler })`
- `ctx.ai.tools()` / `ctx.ai.callTool(name, args)`
- Automatic HTTP MCP endpoint at `POST /mcp` exposing `server/api/**` routes and `ctx.ai` tools.
