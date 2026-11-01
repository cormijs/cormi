// The packages published to npm: those of packages/ and plugins/ that are not private, dependencies first.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('..', import.meta.url))

export function readPackages() {
  const packages = []
  for (const group of ['packages', 'plugins']) {
    for (const name of readdirSync(`${root}${group}`)) {
      const dir = `${root}${group}/${name}`
      if (!existsSync(`${dir}/package.json`)) continue
      const meta = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'))
      if (!meta.private) packages.push({ dir, path: `${group}/${name}`, meta })
    }
  }
  // a package after the workspace packages it depends on
  const byName = new Map(packages.map(pkg => [pkg.meta.name, pkg]))
  const sorted = []
  const visit = (pkg, seen = new Set()) => {
    if (sorted.includes(pkg) || seen.has(pkg)) return
    seen.add(pkg)
    const deps = { ...pkg.meta.dependencies, ...pkg.meta.peerDependencies }
    for (const name of Object.keys(deps)) if (byName.has(name)) visit(byName.get(name), seen)
    sorted.push(pkg)
  }
  packages.forEach(pkg => visit(pkg))
  return sorted
}
