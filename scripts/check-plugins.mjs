// `cormi plugin check` in every official plugin: what each supports, compared with its package.json.
//
//   node scripts/check-plugins.mjs [--write]
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = `${root}packages/cormi/bin/cormi.js`
const args = process.argv.includes('--write') ? ['--write'] : []
const failed = []
for (const name of readdirSync(`${root}plugins`)) {
  const result = spawnSync(process.execPath, [cli, 'plugin', 'check', ...args], { cwd: `${root}plugins/${name}`, stdio: 'inherit' })
  if (result.status) failed.push(name)
  console.log()
}
if (failed.length) console.log(`the declarations of ${failed.join(', ')} differ from the checks`)
process.exit(failed.length ? 1 : 0)
