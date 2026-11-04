/**
 * The files of a new app. An app has up to two sides, and its kind says which:
 *
 * - the pages (`src/`), bundled for the browser, rendered there or also on the server
 * - the server (`server/`), run by Node: the API routes, the database
 *
 * The files of each side are written by the same functions in every kind, so
 * a page or an API route reads the same in a frontend, a backend, or both.
 */

export type Kind = 'web' | 'api' | 'fullstack' | 'ssr'
export type UI = 'react' | 'vue'
export type BundlerName = 'vite' | 'rsbuild'
export type DatabaseName = 'sqlite' | 'postgres' | 'mysql' | 'mongo' | 'memory' | 'none'

export interface Options {
  /** the package name of the app */
  name: string
  kind: Kind
  /** the UI framework of the pages */
  ui: UI
  /** the bundler of the pages */
  bundler: BundlerName
  /** the database of the server */
  database: DatabaseName
  /** the version of the Cormi packages */
  version: string
  /** the package manager, for the commands of the README */
  pm: PackageManager
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** The command that runs a script of package.json. */
export function runScript(pm: PackageManager, script: string) {
  if (pm === 'npm') return script === 'start' ? 'npm start' : `npm run ${script}`
  return `${pm} ${script}`
}

export interface KindInfo {
  label: string
  hint: string
  /** where the pages render, if the app has pages */
  pages?: 'client' | 'server'
  /** whether the app has a server: `server/`, run by `cormi start` */
  server: boolean
}

export const KINDS: Record<Kind, KindInfo> = {
  web: { label: 'Frontend', hint: 'pages rendered in the browser, built into static files', pages: 'client', server: false },
  api: { label: 'Backend', hint: 'API routes and a database, no pages', server: true },
  fullstack: { label: 'Frontend + backend', hint: 'pages rendered in the browser, with API routes and a database', pages: 'client', server: true },
  ssr: { label: 'Server-side rendering', hint: 'pages rendered on the server, their loaders read the database', pages: 'server', server: true },
}

export const UIS: Record<UI, string> = { react: 'React', vue: 'Vue' }
export const BUNDLERS: Record<BundlerName, string> = { vite: 'Vite', rsbuild: 'Rsbuild' }

interface DatabaseInfo {
  label: string
  driver?: string
  version?: string
  /** the config of the driver in cormi.yml */
  config?: (name: string) => string[]
}

export const DATABASES: Record<DatabaseName, DatabaseInfo> = {
  sqlite: { label: 'SQLite', driver: '@minatojs/driver-sqlite', version: '^5.0.3', config: () => ['path: data/app.db'] },
  postgres: {
    label: 'PostgreSQL',
    driver: '@minatojs/driver-postgres',
    version: '^3.0.1',
    config: name => ['host: localhost', 'port: 5432', 'user: postgres', 'password: !!js process.env.DATABASE_PASSWORD', `database: ${toIdentifier(name)}`],
  },
  mysql: {
    label: 'MySQL',
    driver: '@minatojs/driver-mysql',
    version: '^4.0.1',
    config: name => ['host: localhost', 'port: 3306', 'user: root', 'password: !!js process.env.DATABASE_PASSWORD', `database: ${toIdentifier(name)}`],
  },
  mongo: { label: 'MongoDB', driver: '@minatojs/driver-mongo', version: '^4.0.1', config: name => ['host: localhost', 'port: 27017', `database: ${toIdentifier(name)}`] },
  memory: { label: 'In memory (gone on restart)', driver: '@minatojs/driver-memory', version: '^4.0.0' },
  none: { label: 'None' },
}

/** the versions of the dependencies that are not Cormi's */
const VERSIONS: Record<string, string> = {
  'react': '^19.3.1',
  'react-dom': '^19.3.1',
  '@types/react': '^19.3.0',
  '@types/react-dom': '^19.3.0',
  'vue': '^3.5.44',
  // Cormi is on Vite 7: plugin-react 6 needs Vite 8
  '@vitejs/plugin-react': '^5.2.0',
  '@vitejs/plugin-vue': '^6.0.10',
  '@rsbuild/plugin-react': '^2.1.1',
  '@rsbuild/plugin-vue': '^2.0.1',
  'minato': '^4.0.1',
  '@types/node': '^22.20.5',
  'typescript': '~5.9.3',
}

/** `my-app` -> `my_app`, a name for a database */
function toIdentifier(name: string) {
  return name.replace(/^@[^/]+\//, '').replace(/\W/g, '_')
}

/** A valid package name from a directory name. */
export function toPackageName(dir: string) {
  return dir.trim().toLowerCase().replace(/\s+/g, '-').replace(/^[._]/, '').replace(/[^a-z\d\-~]+/g, '-') || 'cormi-app'
}

function sortKeys(record: Record<string, string>) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

function hasDatabase(options: Options) {
  return KINDS[options.kind].server && options.database !== 'none'
}

/** The files of the app, by path. */
export function render(options: Options): Record<string, string> {
  const kind = KINDS[options.kind]
  const files: Record<string, string> = {
    'package.json': renderPackage(options),
    'cormi.yml': renderConfig(options),
    'tsconfig.json': renderTsconfig(options),
    '.gitignore': renderGitignore(options),
    'README.md': renderReadme(options),
  }
  if (kind.pages) Object.assign(files, options.ui === 'react' ? renderReactPages(options) : renderVuePages(options))
  if (kind.server) Object.assign(files, renderServer(options))
  return files
}

function renderPackage(options: Options) {
  const kind = KINDS[options.kind]
  const cormi = `^${options.version}`
  const dependencies: Record<string, string> = {
    '@cormijs/cormi': cormi,
    '@cormijs/preset': cormi,
  }
  const devDependencies: Record<string, string> = { typescript: VERSIONS.typescript }
  if (kind.pages) {
    dependencies[`@cormijs/${options.bundler}`] = cormi
    dependencies[`@cormijs/${options.ui}`] = cormi
    // the UI framework on the bundler
    const integration = options.bundler === 'vite' ? `@vitejs/plugin-${options.ui}` : `@rsbuild/plugin-${options.ui}`
    dependencies[integration] = VERSIONS[integration]
    if (options.ui === 'react') {
      dependencies.react = VERSIONS.react
      dependencies['react-dom'] = VERSIONS['react-dom']
      devDependencies['@types/react'] = VERSIONS['@types/react']
      devDependencies['@types/react-dom'] = VERSIONS['@types/react-dom']
    } else {
      dependencies.vue = VERSIONS.vue
    }
  }
  if (kind.server) devDependencies['@types/node'] = VERSIONS['@types/node']
  if (hasDatabase(options)) {
    const database = DATABASES[options.database]
    dependencies['@cormijs/database'] = cormi
    dependencies[database.driver!] = database.version!
    dependencies.minato = VERSIONS.minato
  }

  const scripts: Record<string, string> = { dev: 'cormi dev' }
  if (kind.pages) scripts.build = 'cormi build'
  // a frontend is static files: preview tries them; an app with a server runs in production with start
  scripts[kind.server ? 'start' : 'preview'] = kind.server ? 'cormi start' : 'cormi preview'
  if (kind.pages) scripts.setup = 'cormi setup'

  return JSON.stringify({
    name: options.name,
    private: true,
    type: 'module',
    scripts,
    dependencies: sortKeys(dependencies),
    devDependencies: sortKeys(devDependencies),
    engines: { node: '>=22.12.0' },
  }, null, 2) + '\n'
}

function renderConfig(options: Options) {
  const kind = KINDS[options.kind]
  const lines: string[] = []
  if (kind.pages) {
    lines.push(
      '# the app: routing, the HTML of the pages, the dev server and the console',
      `- name: '@cormijs/preset'`,
      '  config:',
      `    title: ${options.name}`,
    )
    if (kind.pages === 'server') lines.push('    ssr: true')
    lines.push(
      '# the pages: a bundler and a UI framework',
      `- name: '@cormijs/${options.bundler}'`,
      `- name: '@cormijs/${options.ui}'`,
    )
  } else {
    lines.push(
      '# the app, without a bundler and a UI framework: a backend, its code in server/',
      `- name: '@cormijs/preset'`,
    )
  }
  if (hasDatabase(options)) {
    const database = DATABASES[options.database]
    lines.push(
      '# the server: the database of server/, ctx.model and ctx.database',
      `- name: '@cormijs/database'`,
      `- name: '${database.driver}'`,
    )
    const config = database.config?.(options.name)
    if (config) lines.push('  config:', ...config.map(line => `    ${line}`))
  }
  return lines.join('\n') + '\n'
}

function renderTsconfig(options: Options) {
  const kind = KINDS[options.kind]
  // the pages have a generated config: the aliases, the types of the UI framework and the assets
  if (kind.pages) {
    return JSON.stringify({
      extends: './src/.cormi/tsconfig.json',
      ...kind.server && { include: ['src', 'server'] },
    }, null, 2) + '\n'
  }
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      types: ['node'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      isolatedModules: true,
      allowImportingTsExtensions: true,
    },
    include: ['server'],
  }, null, 2) + '\n'
}

function renderGitignore(options: Options) {
  const lines = ['node_modules', '.env']
  if (KINDS[options.kind].pages) lines.push('dist', 'src/.cormi')
  return lines.join('\n') + '\n'
}

function renderReadme(options: Options) {
  const kind = KINDS[options.kind]
  const database = hasDatabase(options) ? DATABASES[options.database] : undefined
  const tree: string[] = ['cormi.yml            the plugins of the app']
  if (kind.pages) {
    const ext = options.ui === 'react' ? 'tsx' : 'vue'
    tree.push(
      'src/                 the pages: bundled for the browser',
      `  layouts/index.${ext}  the layout of every page`,
      `  pages/             a file is a route: pages/about.${ext} is /about`,
    )
  }
  if (kind.server) {
    tree.push('server/              the server: run by Node, from the sources')
    tree.push('  index.ts           the plugin of the app on the server, e.g. its middlewares')
    if (database) tree.push('  models/            the tables of the database')
    tree.push('  api/               a file is an API route: api/todos/[id].ts is /api/todos/:id')
  }

  const command = (script: string, description: string) => runScript(options.pm, script).padEnd(21) + description
  const commands: string[] = [command('dev', 'the dev server, at http://localhost:8000; the console is at /__cormi/')]
  if (kind.pages) commands.push(command('build', 'the bundles of the pages, in dist/'))
  if (kind.server) commands.push(command('start', kind.pages ? 'the app in production: the built pages and the server code' : 'the app in production'))
  else commands.push(command('preview', 'try the build: dist/ is static files, for any static host'))

  const sections = [
    `# ${options.name}`,
    '',
    `A Cormi app: ${kind.label.toLowerCase()}, ${kind.hint}.`,
    '',
    '```',
    ...tree,
    '```',
    '',
    '```sh',
    ...commands,
    '```',
  ]
  if (kind.pages && kind.server) {
    sections.push(
      '',
      'The pages and the server meet in three places only: the pages call the API with fetch, the loaders of pages use the services of the server through `context.ctx`, and the pages import the types of the server with `import type`. Importing a value of `server/` from `src/` fails the build.',
    )
  }
  if (database && options.database !== 'sqlite' && options.database !== 'memory') {
    sections.push('', `The database is ${database.label}: its connection is in cormi.yml, the password in the \`DATABASE_PASSWORD\` variable of \`.env\`.`)
  }
  sections.push('', 'See https://cormi.js.org for the guide.')
  return sections.join('\n') + '\n'
}

// --- pages ---

/** The page at `/`: what the app shows first, by its kind and database. */
type HomePage = 'counter' | 'todos-fetch' | 'todos-loader' | 'hello-fetch' | 'hello-loader'

function getHomePage(options: Options): HomePage {
  const kind = KINDS[options.kind]
  if (!kind.server) return 'counter'
  const database = hasDatabase(options)
  if (kind.pages === 'server') return database ? 'todos-loader' : 'hello-loader'
  return database ? 'todos-fetch' : 'hello-fetch'
}

const CSS = `:root {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: #1f2328;
}

body {
  margin: 0;
}

nav {
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #d0d7de;
}

main {
  max-width: 640px;
  padding: 24px;
}

ul {
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}

.done {
  text-decoration: line-through;
  color: #8c959f;
}
`

function renderReactPages(options: Options): Record<string, string> {
  return {
    'src/global.css': CSS,
    'src/layouts/index.tsx': `import { Link, Outlet } from '@cormijs/react/client'

export default function Layout() {
  return (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  )
}
`,
    'src/pages/index.tsx': REACT_HOME[getHomePage(options)](options),
    'src/pages/about.tsx': `export default function About() {
  return (
    <>
      <h1>About</h1>
      <p>A file of <code>src/pages</code> is a route: this one is <code>src/pages/about.tsx</code>.</p>
    </>
  )
}
`,
  }
}

const REACT_TODO_ITEM = `<li key={todo.id}>
            <input type="checkbox" checked={todo.done} onChange={() => toggle(todo)} />
            <span className={todo.done ? 'done' : undefined}>{todo.title}</span>
            <button onClick={() => remove(todo)}>Delete</button>
          </li>`

const REACT_HOME: Record<HomePage, (options: Options) => string> = {
  'counter': options => `import { useState } from 'react'

export default function Home() {
  const [count, setCount] = useState(0)
  return (
    <>
      <h1>${options.name}</h1>
      <p>Edit <code>src/pages/index.tsx</code> and save: the page updates.</p>
      <button onClick={() => setCount(count => count + 1)}>clicked {count}</button>
    </>
  )
}
`,
  'hello-fetch': () => `import { useEffect, useState } from 'react'

export default function Home() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    // server/api/hello.ts
    fetch('/api/hello').then(res => res.json()).then(data => setMessage(data.message))
  }, [])
  return (
    <>
      <h1>Hello</h1>
      <p id="message">{message || 'loading…'}</p>
    </>
  )
}
`,
  'hello-loader': () => `import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData } from '@cormijs/react/client'

/** Runs on the server, when it renders the page and for client navigations; \`context.ctx\` has its services. */
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  return { message: \`Hello from the server, in \${context.ctx.cormi.mode} mode\` }
}

export default function Home() {
  const { message } = useLoaderData<typeof loader>()
  return (
    <>
      <h1>Hello</h1>
      <p id="message">{message}</p>
    </>
  )
}
`,
  'todos-fetch': () => `import { type FormEvent, useEffect, useState } from 'react'
// types only: the code of server/ runs in Node, the pages call its API
import type { Todo } from '../../server/models/todo'

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')

  const load = () => fetch('/api/todos').then(res => res.json()).then(setTodos)
  useEffect(() => {
    load()
  }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    await fetch('/api/todos', { method: 'POST', body: JSON.stringify({ title }) })
    setTitle('')
    await load()
  }

  async function toggle(todo: Todo) {
    await fetch(\`/api/todos/\${todo.id}\`, { method: 'PATCH', body: JSON.stringify({ done: !todo.done }) })
    await load()
  }

  async function remove(todo: Todo) {
    await fetch(\`/api/todos/\${todo.id}\`, { method: 'DELETE' })
    await load()
  }

  return (
    <>
      <h1>Todos</h1>
      <form onSubmit={add}>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" required />
        <button type="submit">Add</button>
      </form>
      <ul id="todos">
        {todos.map(todo => (
          ${REACT_TODO_ITEM}
        ))}
      </ul>
    </>
  )
}
`,
  'todos-loader': () => `import type { LoaderContext } from '@cormijs/cormi'
import { type LoaderFunctionArgs, useLoaderData, useRevalidator } from '@cormijs/react/client'
import { type FormEvent, useState } from 'react'
// types only: the code of server/ runs in Node
import type { Todo } from '../../server/models/todo'

/** Runs on the server, when it renders the page and for client navigations; \`context.ctx\` has its services. */
export async function loader({ context }: LoaderFunctionArgs<LoaderContext>) {
  return context.ctx.database.get('todo', {}, { sort: { id: 'asc' } })
}

export default function Home() {
  const todos = useLoaderData<typeof loader>()
  // the changes go through the API, then the loader runs again
  const { revalidate } = useRevalidator()
  const [title, setTitle] = useState('')

  async function add(event: FormEvent) {
    event.preventDefault()
    await fetch('/api/todos', { method: 'POST', body: JSON.stringify({ title }) })
    setTitle('')
    await revalidate()
  }

  async function toggle(todo: Todo) {
    await fetch(\`/api/todos/\${todo.id}\`, { method: 'PATCH', body: JSON.stringify({ done: !todo.done }) })
    await revalidate()
  }

  async function remove(todo: Todo) {
    await fetch(\`/api/todos/\${todo.id}\`, { method: 'DELETE' })
    await revalidate()
  }

  return (
    <>
      <h1>Todos</h1>
      <form onSubmit={add}>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" required />
        <button type="submit">Add</button>
      </form>
      <ul id="todos">
        {todos.map(todo => (
          ${REACT_TODO_ITEM}
        ))}
      </ul>
    </>
  )
}
`,
}

function renderVuePages(options: Options): Record<string, string> {
  return {
    'src/global.css': CSS,
    'src/layouts/index.vue': `<script setup lang="ts">
import { RouterLink, RouterView } from '@cormijs/vue/client'
</script>

<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/about">About</RouterLink>
  </nav>
  <main>
    <RouterView />
  </main>
</template>
`,
    'src/pages/index.vue': VUE_HOME[getHomePage(options)](options),
    'src/pages/about.vue': `<template>
  <h1>About</h1>
  <p>A file of <code>src/pages</code> is a route: this one is <code>src/pages/about.vue</code>.</p>
</template>
`,
  }
}

const VUE_TODO_LIST = `<template>
  <h1>Todos</h1>
  <form @submit.prevent="add">
    <input v-model="title" placeholder="What needs doing?" required>
    <button type="submit">Add</button>
  </form>
  <ul id="todos">
    <li v-for="todo in todos" :key="todo.id">
      <input type="checkbox" :checked="todo.done" @change="toggle(todo)">
      <span :class="{ done: todo.done }">{{ todo.title }}</span>
      <button @click="remove(todo)">Delete</button>
    </li>
  </ul>
</template>
`

const VUE_TODO_ACTIONS = `async function add() {
  const res = await fetch('/api/todos', { method: 'POST', body: JSON.stringify({ title: title.value }) })
  todos.value.push(await res.json())
  title.value = ''
}

async function toggle(todo: Todo) {
  const res = await fetch(\`/api/todos/\${todo.id}\`, { method: 'PATCH', body: JSON.stringify({ done: !todo.done }) })
  Object.assign(todo, await res.json())
}

async function remove(todo: Todo) {
  await fetch(\`/api/todos/\${todo.id}\`, { method: 'DELETE' })
  todos.value = todos.value.filter(item => item !== todo)
}`

const VUE_HOME: Record<HomePage, (options: Options) => string> = {
  'counter': options => `<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <h1>${options.name}</h1>
  <p>Edit <code>src/pages/index.vue</code> and save: the page updates.</p>
  <button @click="count++">clicked {{ count }}</button>
</template>
`,
  'hello-fetch': () => `<script setup lang="ts">
import { onMounted, ref } from 'vue'

const message = ref('')
onMounted(async () => {
  // server/api/hello.ts
  const data = await fetch('/api/hello').then(res => res.json())
  message.value = data.message
})
</script>

<template>
  <h1>Hello</h1>
  <p id="message">{{ message || 'loading…' }}</p>
</template>
`,
  'hello-loader': () => `<script lang="ts">
import type { LoaderContext } from '@cormijs/cormi'
import type { LoaderArgs } from '@cormijs/vue/client'

/** Runs on the server, when it renders the page and for client navigations; \`context.ctx\` has its services. */
export async function loader({ context }: LoaderArgs<LoaderContext>) {
  return { message: \`Hello from the server, in \${context.ctx.cormi.mode} mode\` }
}
</script>

<script setup lang="ts">
import { useLoaderData } from '@cormijs/vue/client'

const data = useLoaderData<Awaited<ReturnType<typeof loader>>>()
</script>

<template>
  <h1>Hello</h1>
  <p id="message">{{ data.message }}</p>
</template>
`,
  'todos-fetch': () => `<script setup lang="ts">
import { onMounted, ref } from 'vue'
// types only: the code of server/ runs in Node, the pages call its API
import type { Todo } from '../../server/models/todo'

const todos = ref<Todo[]>([])
const title = ref('')

onMounted(async () => {
  todos.value = await fetch('/api/todos').then(res => res.json())
})

${VUE_TODO_ACTIONS}
</script>

${VUE_TODO_LIST}`,
  'todos-loader': () => `<script lang="ts">
import type { LoaderContext } from '@cormijs/cormi'
import type { LoaderArgs } from '@cormijs/vue/client'

/** Runs on the server, when it renders the page and for client navigations; \`context.ctx\` has its services. */
export async function loader({ context }: LoaderArgs<LoaderContext>) {
  return context.ctx.database.get('todo', {}, { sort: { id: 'asc' } })
}
</script>

<script setup lang="ts">
import { useLoaderData } from '@cormijs/vue/client'
import { ref } from 'vue'
// types only: the code of server/ runs in Node
import type { Todo } from '../../server/models/todo'

// the rendered todos, then the changes through the API
const data = useLoaderData<Todo[]>()
const todos = ref<Todo[]>([...data.value])
const title = ref('')

${VUE_TODO_ACTIONS}
</script>

${VUE_TODO_LIST}`,
}

// --- server ---

function renderServer(options: Options): Record<string, string> {
  const database = hasDatabase(options)
  const files: Record<string, string> = {
    'server/index.ts': `import type { Context } from '@cormijs/cormi'

export const inject = ['middleware']

/** The plugin of the app on the server: here, a middleware that times the API routes. */
export function apply(ctx: Context) {
  ctx.middleware.use(async (request, context, next) => {
    const start = performance.now()
    const response = await next()
    response.headers.set('server-timing', \`app;dur=\${(performance.now() - start).toFixed(1)}\`)
    return response
  }, { path: '/api' })
}
`,
  }
  if (!database) {
    files['server/api/hello.ts'] = `import type { ApiContext } from '@cormijs/cormi'

/** GET /api/hello */
export function GET(request: Request, { ctx }: ApiContext) {
  return { message: \`Hello from the server, in \${ctx.cormi.mode} mode\` }
}
`
    return files
  }
  files['server/env.d.ts'] = [
    '// The types of the services the server code uses: a line for each plugin of cormi.yml that provides one',
    '/// <reference types="@cormijs/database" />',
    '',
  ].join('\n')
  if (options.database === 'sqlite') files['data/.gitignore'] = '# the database file\n*\n!.gitignore\n'
  if (['postgres', 'mysql'].includes(options.database)) files['.env'] = 'DATABASE_PASSWORD=\n'
  files['server/models/todo.ts'] = `import type { Context } from '@cormijs/cormi'

export interface Todo {
  id: number
  title: string
  done: boolean
  createdAt: Date
}

declare module '@cormijs/database' {
  interface Tables {
    todo: Todo
  }
}

export const inject = ['model', 'database']

/** The table of todos, created or migrated when the app starts. */
export async function apply(ctx: Context) {
  ctx.model.extend('todo', {
    id: 'unsigned',
    title: 'string',
    done: 'boolean',
    createdAt: 'timestamp',
  }, { autoInc: true })
  // a first todo in an empty database
  if (!(await ctx.database.get('todo', {}, { limit: 1 })).length) {
    await ctx.database.create('todo', { title: 'Try Cormi', done: false, createdAt: new Date() })
  }
}
`
  files['server/api/todos/index.ts'] = `import type { ApiContext } from '@cormijs/cormi'

// the services of the handlers: until the database is there, the route answers 503
export const inject = ['database']

/** GET /api/todos */
export async function GET(request: Request, { ctx }: ApiContext) {
  return ctx.database.get('todo', {}, { sort: { id: 'asc' } })
}

/** POST /api/todos \`{ title }\` */
export async function POST(request: Request, { ctx }: ApiContext) {
  const { title } = await request.json()
  if (typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'title is required' }, { status: 400 })
  }
  const todo = await ctx.database.create('todo', { title: title.trim(), done: false, createdAt: new Date() })
  return Response.json(todo, { status: 201 })
}
`
  files['server/api/todos/[id].ts'] = `import type { ApiContext } from '@cormijs/cormi'

export const inject = ['database']

type Params = { id: string }

/** GET /api/todos/:id */
export async function GET(request: Request, { params, ctx }: ApiContext<Params>) {
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo ?? Response.json({ error: 'not found' }, { status: 404 })
}

/** PATCH /api/todos/:id \`{ title?, done? }\` */
export async function PATCH(request: Request, { params, ctx }: ApiContext<Params>) {
  const { title, done } = await request.json()
  const { matched } = await ctx.database.set('todo', { id: Number(params.id) }, {
    ...typeof title === 'string' && { title },
    ...typeof done === 'boolean' && { done },
  })
  if (!matched) return Response.json({ error: 'not found' }, { status: 404 })
  const [todo] = await ctx.database.get('todo', { id: Number(params.id) })
  return todo
}

/** DELETE /api/todos/:id */
export async function DELETE(request: Request, { params, ctx }: ApiContext<Params>) {
  const { removed } = await ctx.database.remove('todo', { id: Number(params.id) })
  return new Response(null, { status: removed ? 204 : 404 })
}
`
  return files
}
