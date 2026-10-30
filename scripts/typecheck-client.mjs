// Type-check the browser code of the plugins (`plugins/*/client`), which `tsc -b` does not cover.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc')
const projects = readdirSync('plugins')
  .map(name => `plugins/${name}/client/tsconfig.json`)
  .filter(existsSync)
let failed = false
for (const project of projects) {
  try {
    execFileSync(process.execPath, [tsc, '-p', project], { stdio: 'inherit' })
    console.log(`ok ${project}`)
  } catch {
    failed = true
  }
}
process.exit(failed ? 1 : 0)
