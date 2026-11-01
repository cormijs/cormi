<script lang="ts">
import { platform } from 'node:os'

/** Runs on the server only: it is removed from the client bundle, with node:os. */
export async function loader() {
  return { platform: platform(), time: new Date().toISOString().slice(0, 10) }
}
</script>

<script setup lang="ts">
import { useLoaderData } from '@cormi/vue/client'

const data = useLoaderData<Awaited<ReturnType<typeof loader>>>()
</script>

<template>
  <div>
    <h1>About</h1>
    <p id="loader">served by {{ data.platform }} on {{ data.time }}</p>
  </div>
</template>
