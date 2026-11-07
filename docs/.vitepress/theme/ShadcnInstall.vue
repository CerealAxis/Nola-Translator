<script setup lang="ts">
import { ref, useId } from 'vue'

const id = useId()
const options = [{ key: 'cli', label: '命令行' }, { key: 'manual', label: '手动安装' }] as const
const selected = ref<'cli' | 'manual'>('cli')

function onKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'Home' ? 'cli' : event.key === 'End' ? 'manual' :
    selected.value === 'cli' ? 'manual' : 'cli'
  document.getElementById(`${id}-${selected.value}`)?.focus()
}
</script>

<template>
  <div class="shadcn-install">
    <div role="tablist" aria-label="安装方式" @keydown="onKey">
      <button
        v-for="option in options"
        :id="`${id}-${option.key}`"
        :key="option.key"
        type="button"
        role="tab"
        :aria-selected="selected === option.key"
        :aria-controls="`${id}-panel-${option.key}`"
        :tabindex="selected === option.key ? 0 : -1"
        @click="selected = option.key"
      >{{ option.label }}</button>
    </div>
    <div
      v-for="option in options"
      v-show="selected === option.key"
      :id="`${id}-panel-${option.key}`"
      :key="option.key"
      role="tabpanel"
      :aria-labelledby="`${id}-${option.key}`"
    ><slot :name="option.key" /></div>
  </div>
</template>
