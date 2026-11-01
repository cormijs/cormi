import { basename, join } from 'node:path'
import { createFile } from '@cormi/core'
import { Context } from 'cordis'

/** `users/order-list` -> `OrderList` */
export function toComponentName(name: string) {
  return basename(name).split(/[-_.\s]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

/** Generators of `cormi generate` for Vue: pages and components, as single-file components. */
export function Generators(ctx: Context) {
  ctx.cli.generator('page', {
    description: 'a page: src/pages/<name>.vue',
    async run(name) {
      const component = `${toComponentName(name)}Page`
      return [await createFile(`${join(ctx.router.pagesDir, name)}.vue`, [
        `<script setup lang="ts">`,
        `</script>`,
        '',
        `<template>`,
        `  <div class="page">${component}</div>`,
        `</template>`,
        '',
        `<style scoped>`,
        `.page {`,
        `}`,
        `</style>`,
        '',
      ].join('\n'))]
    },
  })

  ctx.cli.generator('component', {
    description: 'a component: src/components/<Name>.vue',
    async run(name) {
      const component = toComponentName(name)
      return [await createFile(join(ctx.cormi.paths.src, 'components', `${component}.vue`), [
        `<script setup lang="ts">`,
        `defineProps<{}>()`,
        `</script>`,
        '',
        `<template>`,
        `  <div />`,
        `</template>`,
        '',
      ].join('\n'))]
    },
  })
}

export namespace Generators {
  export const inject = ['router']
}
