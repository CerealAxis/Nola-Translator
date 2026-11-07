<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { componentCatalog } from '../component-catalog'

const props = defineProps<{ library: keyof typeof componentCatalog }>()
const { isDark } = useData()
const cards = computed(() => componentCatalog[props.library])
</script>

<template>
  <div class="component-catalog">
    <a v-for="card in cards" :key="card.href" class="catalog-card" :href="withBase(card.href)">
      <span class="catalog-preview">
        <img
          :key="isDark ? 'dark' : 'light'"
          :src="withBase(`/component-previews/${library}/${card.slug}-${isDark ? 'dark' : 'light'}.webp`)"
          alt=""
          width="1440"
          height="1080"
          loading="lazy"
          decoding="async"
          @error="($event.currentTarget as HTMLImageElement).hidden = true"
        />
      </span>
      <span dir="auto">{{ card.title }}</span>
    </a>
  </div>
</template>

<style scoped>
:global(.VPDoc:has(.component-catalog) .content-container) {
  max-inline-size: 72rem;
}

.component-catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, max(12rem, calc((100% - 3rem) / 3))), 1fr));
  gap: 1.5rem;
  margin-block: 1rem 2rem;
}

.catalog-card {
  display: grid;
  min-inline-size: 0;
  gap: 0.5rem;
  align-content: start;
  border-radius: 0.75rem;
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;
}

.catalog-preview {
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: inherit;
  background: var(--vp-c-bg);
}

.catalog-preview img {
  inline-size: 100%;
  block-size: auto;
}

.catalog-card:hover,
.catalog-card:focus-visible {
  color: var(--vp-c-brand-1);
}

.catalog-card:hover .catalog-preview,
.catalog-card:focus-visible .catalog-preview {
  border-color: var(--vp-c-brand-1);
}
</style>
