<script setup lang="ts">
defineProps<{ url: string; title: string; description?: string; logo?: string }>()
</script>

<template>
  <div class="linkcard">
    <a :href="url">
      <div v-if="logo" class="logo"><img :src="logo" alt="" loading="lazy" /></div>
      <div class="description">{{ title }}<br v-if="description" /><span v-if="description">{{ description }}</span></div>
      <span aria-hidden="true">↗</span>
    </a>
  </div>
</template>
