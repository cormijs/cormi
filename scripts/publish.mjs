// Publish the packages whose version is not on npm yet, dependencies first: `pnpm pub`.
// Prereleases go to the `next` tag. In CI, the packages are published with provenance.
import { spawnSync } from 'node:child_process'
import { readPackages } from './packages.mjs'

const registry = 'https://registry.npmjs.org'
const dryRun = process.argv.includes('--dry-run')
/** Whether a version is on npm; the request is tried again when the network fails. */
async function isPublished(name, version) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${registry}/${name.replace('/', '%2f')}/${version}`)
      if (response.ok || response.status === 404) return response.ok
      throw new Error(`the registry answered ${response.status}`)
    } catch (error) {
      if (attempt === 3) throw error
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
  }
}

const failed = []
for (const { dir, path, meta } of readPackages()) {
  if (await isPublished(meta.name, meta.version)) {
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
