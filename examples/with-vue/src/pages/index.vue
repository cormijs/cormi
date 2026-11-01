<script setup lang="ts">
import { inject, ref } from 'vue'

const greeting = inject<string>('greeting')
const count = ref(0)
</script>

<template>
  <div>
    <h1 id="title">Hello Vue</h1>
    <p id="greeting">{{ greeting }}</p>
    <button @click="count++">clicked {{ count }}</button>
  </div>
</template>
