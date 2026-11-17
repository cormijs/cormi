---
name: cormi
description: Build, modify, debug, and verify Cormi full-stack applications (adding API routes, database tables, authentication, AI endpoints, and running diagnostics).
---

# Cormi Framework Skill

Use this skill when working in a **Cormi** application (`cormi.yml` present).

## Core Rules

1. **Two Sides (`src/` vs `server/`)**:
   - `src/` is bundled for the browser (`src/pages/**`, `src/layouts/**`, `src/app.tsx`).
   - `server/` runs in Node (`server/index.ts`, `server/models/*.ts`, `server/api/**`, `server/env.d.ts`).
   - **Never** import runtime values from `server/` inside `src/`. Use `import type` for types, `api` from `@cormijs/cormi/client` (or `fetch`) for HTTP calls, and `context.ctx` / `context.state` inside page `loader` functions.
2. **Service Injection (`inject`)**:
   - Every plugin and every `server/api/**` module that accesses `ctx.<service>` must export `export const inject = ['database']` (or `['model', 'database']`, `['cache']`, `['storage']`, `['auth']`, `['ai']`).
3. **`server/env.d.ts` & Declaration Merging**:
   - Whenever a service plugin is in `cormi.yml`, add `/// <reference types="<package>" />` to `server/env.d.ts`.
   - Augment database tables on `@cormijs/database` (`interface Tables`), cache tables on `@cormijs/cache` (`interface Tables`), auth user on `@cormijs/plugin-auth` (`interface User`), and request state on `@cormijs/cormi` (`interface State`).

## Task Playbooks

### 1. Add an API Route (`server/api/**`)

1. Create `server/api/<path>.ts` (e.g. `server/api/todos/[id].ts` -> `/api/todos/:id`).
2. Declare `export const inject = [...]` for any `ctx.*` services used.
3. Export `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `default`:
   ```ts
   import type { ApiContext, ApiRequest } from '@cormijs/cormi'

   export const inject = ['database']

   export async function POST(request: ApiRequest<{ title: string }>, { ctx }: ApiContext) {
     const { title } = await request.json()
     const todo = await ctx.database.create('todo', { title, done: false, createdAt: new Date() })
     return Response.json(todo, { status: 201 })
   }
   ```
4. Call from `src/` using the typed RPC client:
   ```ts
   import { api } from '@cormijs/cormi/client'
   const todo = await api.post('/api/todos', { title: 'New item' })
   ```

### 2. Add a Database Table (`server/models/*.ts`)

1. Ensure `@cormijs/database` and a `@minatojs/driver-*` plugin are in `cormi.yml`.
2. Ensure `/// <reference types="@cormijs/database" />` is in `server/env.d.ts`.
3. Create `server/models/<name>.ts`:
   ```ts
   import type { Context } from '@cormijs/cormi'

   export interface Item {
     id: number
     name: string
   }

   declare module '@cormijs/database' {
     interface Tables {
       item: Item
     }
   }

   export const inject = ['model']

   export function apply(ctx: Context) {
     ctx.model.extend('item', { id: 'unsigned', name: 'string' }, { autoInc: true })
   }
   ```

### 3. Add Authentication (`@cormijs/plugin-auth`)

1. Enable `@cormijs/cache`, `@cormijs/plugin-session`, and `@cormijs/plugin-auth` in `cormi.yml`.
2. Reference all three in `server/env.d.ts` and augment `declare module '@cormijs/plugin-auth' { interface User { ... } }`.
3. Use `ctx.auth.hash(pw)`, `ctx.auth.verify(pw, hash)`, `ctx.auth.login(state, user)`, and `ctx.auth.logout(state)` in login/logout routes.
4. Export `export const auth = true` (or `(user: User) => boolean`) on protected `server/api` routes.

## Verification Checklist

1. Run `npx cormi check` (or `npx cormi check --json`) and fix all diagnostics.
2. Test routes in-process without binding a port using `const app = await createApp(); const res = await app.fetch('/api/...'); await app.close()`.
3. Use `npx cormi info --json` or `cormi mcp` tools (`overview`, `diagnostics`, `request`, `logs`, `database_query`) to inspect state.
