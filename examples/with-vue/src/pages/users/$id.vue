<script setup lang="ts">
import { useRoute } from '@cormi/vue/client'

const route = useRoute()
</script>

<template>
  <h1 id="user">User {{ route.params.id }}</h1>
</template>
