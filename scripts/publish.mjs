// Publish the packages whose version is not on npm yet, dependencies first: `pnpm pub`.
// Prereleases go to the `next` tag. In CI, the packages are published with provenance.
import { spawnSync } from 'node:child_process'
import { readPackages } from './packages.mjs'

const registry = 'https://registry.npmjs.org'
const dryRun = process.argv.includes('--dry-run')
const failed = []
for (const { dir, path, meta } of readPackages()) {
  const response = await fetch(`${registry}/${meta.name.replace('/', '%2f')}/${meta.version}`)
  if (response.ok) {
    console.log(`${meta.name}@${meta.version} is published already`)
    continue
  }
  const tag = meta.version.includes('-') ? 'next' : 'latest'
  console.log(`publishing ${meta.name}@${meta.version} (${tag}) from ${path}`)
  const args = ['publish', '--access', 'public', '--tag', tag, '--no-git-checks', ...process.env.CI ? ['--provenance'] : [], ...dryRun ? ['--dry-run'] : []]
  const result = spawnSync('pnpm', args, { cwd: dir, stdio: 'inherit' })
  if (result.status) failed.push(meta.name)
}
if (failed.length) {
  console.error(`failed to publish ${failed.join(', ')}`)
  process.exit(1)
}
