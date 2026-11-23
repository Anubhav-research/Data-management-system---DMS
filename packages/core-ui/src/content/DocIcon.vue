<script setup>
// File-type tile: the same icon and colour for a type everywhere (Documents, Circulars, WhatsApp chat).
import { computed } from 'vue'
import { kindOf, KIND_ICON, KIND_COLOR } from './hub.js'
const props = defineProps({ mime: String, name: String, folder: Boolean, size: { type: String, default: 'md' } })
const kind = computed(() => kindOf(props.mime, props.name))
</script>
<template>
  <span class="inline-flex shrink-0 items-center justify-center rounded-4"
    :class="[folder ? 'bg-surface-amber-1 text-ink-amber-6' : KIND_COLOR[kind], size === 'lg' ? 'size-10' : size === 'sm' ? 'size-6' : 'size-8']">
    <span :class="[folder ? 'lucide-folder' : KIND_ICON[kind], size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4']" />
  </span>
</template>
