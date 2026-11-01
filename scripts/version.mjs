// Set the version of every published package: `pnpm bump 0.1.0-rc.1`.
import { writeFileSync } from 'node:fs'
import { readPackages } from './packages.mjs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error('usage: pnpm bump <version>, e.g. 0.1.0-rc.1')
  process.exit(1)
}
for (const { dir, meta } of readPackages()) {
  meta.version = version
  writeFileSync(`${dir}/package.json`, JSON.stringify(meta, null, 2) + '\n')
}
console.log(`the packages are at ${version}`)
