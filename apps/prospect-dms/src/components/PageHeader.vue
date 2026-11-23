<script setup>
// Header line (GEN-012): "Module / List" on lists, "Module > List > Name" on records. Each crumb clickable except last.
// Right side: the page's own actions, then the Document Repository and Circulars icons (on every page).
import { useSlots } from 'vue'
import HeaderTools from '@mh/core-ui/content/HeaderTools.vue'
defineProps({ crumbs: { type: Array, default: () => [] }, separator: { type: String, default: '/' } })
const slots = useSlots()
</script>
<template>
  <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b bg-surface-base px-5">
    <nav class="flex min-w-0 items-center gap-1.5 text-lg text-ink-gray-5">
      <template v-for="(c, i) in crumbs" :key="i">
        <span v-if="i > 0" class="text-ink-gray-4">{{ separator }}</span>
        <router-link v-if="c.to && i < crumbs.length - 1" :to="c.to" class="truncate hover:text-ink-gray-8">{{ c.label }}</router-link>
        <span v-else class="flex items-center gap-1 truncate font-medium text-ink-gray-9">
          {{ c.label }}<span v-if="c.chevron" class="lucide-chevron-down size-3.5 text-ink-gray-6" />
        </span>
      </template>
    </nav>
    <div class="flex shrink-0 items-center gap-2"><slot name="right" /><span v-if="slots.right" class="mx-1 h-5 w-px bg-outline-gray-2" /><HeaderTools /></div>
  </header>
</template>
