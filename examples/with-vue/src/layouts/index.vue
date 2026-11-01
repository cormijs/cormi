<script setup lang="ts">
import { RouterLink, RouterView } from '@cormijs/vue/client'
</script>

<template>
  <div class="layout">
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/about">About</RouterLink>
      <RouterLink to="/users/2">User 2</RouterLink>
    </nav>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
nav {
  display: flex;
  gap: 16px;
  padding: 16px;
}

nav a {
  color: #42b883;
}

main {
  padding: 0 16px;
}
</style>
