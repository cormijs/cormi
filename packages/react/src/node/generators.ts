import { basename, join } from 'node:path'
import { createFile } from '@cormi/core'
import { Context } from 'cordis'

/** `users/order-list` -> `OrderList` */
export function toComponentName(name: string) {
  return basename(name).split(/[-_.\s]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

/** Generators of `cormi generate` for React: pages and components. */
export function Generators(ctx: Context) {
  ctx.cli.generator('page', {
    description: 'a page and its CSS module: src/pages/<name>.tsx',
    async run(name) {
      const file = join(ctx.router.pagesDir, name)
      const component = `${toComponentName(name)}Page`
      return [
        await createFile(`${file}.tsx`, [
          `import styles from './${basename(name)}.module.css'`,
          '',
          `export default function ${component}() {`,
          `  return <div className={styles.page}>${component}</div>`,
          `}`,
          '',
        ].join('\n')),
        await createFile(`${file}.module.css`, '.page {\n}\n'),
      ]
    },
  })

  ctx.cli.generator('component', {
    description: 'a component: src/components/<Name>/index.tsx',
    async run(name) {
      const component = toComponentName(name)
      return [await createFile(join(ctx.cormi.paths.src, 'components', name, 'index.tsx'), [
        `export interface ${component}Props {}`,
        '',
        `export default function ${component}(props: ${component}Props) {`,
        `  return <div />`,
        `}`,
        '',
      ].join('\n'))]
    },
  })
}

export namespace Generators {
  export const inject = ['router']
}
