<script setup>
// Status with dot (Figma Investor list "● Active", "○ Inactive"). theme maps to semantic colours.
const props = defineProps({ label: String, theme: { type: String, default: 'gray' }, hollow: Boolean })
const dot = { green: 'bg-surface-green-7', red: 'bg-surface-red-7', amber: 'bg-surface-amber-7', blue: 'bg-surface-blue-7', gray: 'bg-surface-gray-7', violet: 'bg-surface-violet-7', orange: 'bg-surface-orange-7' }
</script>
<template>
  <span v-if="label" class="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span class="size-2 rounded-full" :class="hollow ? 'border border-outline-gray-5 bg-transparent' : dot[theme]" />{{ label }}
  </span>
  <span v-else class="text-ink-gray-4">-</span>
</template>
