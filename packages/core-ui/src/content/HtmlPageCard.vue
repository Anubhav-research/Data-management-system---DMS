<script setup>
// The HTML page of a circular, as a card in the reading pane (product owner, 23 Nov 2026: "make it the best way").
// - A header names the page, so it is clearly a designed page, not loose content. No download (product owner, 23 Nov).
// - The preview shows the page at a comfortable height (a long page scrolls inside it). A small expand icon at the top
//   of the card shows the page at the whole window width, the way it was designed; a small cross (or Esc) closes it.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Button, Tooltip } from 'frappe-ui'
import HtmlFrame from './HtmlFrame.vue'
import { fmtSize } from './hub.js'
const props = defineProps({ page: { type: Object, required: true }, circularTitle: String })
const CAP = 560
const open = ref(false)
const size = computed(() => props.page.size || new Blob([props.page.html]).size)
const onKey = (e) => { if (e.key === 'Escape' && open.value) open.value = false }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
<template>
  <div class="overflow-hidden rounded-8 border border-outline-gray-2 bg-surface-base shadow-sm" data-testid="circ-page">
    <div class="flex items-center gap-2.5 border-b bg-surface-gray-1 px-3 py-2">
      <span class="flex size-7 shrink-0 items-center justify-center rounded-4 bg-surface-orange-1"><span class="lucide-file-code size-4 text-ink-orange-6" /></span>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium text-ink-gray-8">{{ page.name }}</div>
        <div class="text-xs text-ink-gray-5">HTML page · {{ fmtSize(size) }}</div>
      </div>
      <Tooltip text="View full page"><Button variant="ghost" icon="lucide-maximize-2" aria-label="View full page" data-testid="circ-page-more" @click="open = true" /></Tooltip>
    </div>
    <HtmlFrame :html="page.html" :title="page.name" :cap="CAP" />
  </div>

  <!-- full-screen reader -->
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex flex-col bg-black/60 p-0 sm:p-6" data-testid="circ-page-reader" @click.self="open = false">
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base shadow-2xl sm:rounded-10">
        <div class="flex items-center gap-2.5 border-b px-4 py-2.5">
          <span class="lucide-file-code size-4 shrink-0 text-ink-orange-6" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-base font-medium text-ink-gray-9">{{ circularTitle || page.name }}</div>
            <div class="truncate text-xs text-ink-gray-5">{{ page.name }} · {{ fmtSize(size) }}</div>
          </div>
          <Tooltip text="Close (Esc)"><Button variant="ghost" icon="lucide-x" aria-label="Close" data-testid="circ-page-close" @click="open = false" /></Tooltip>
        </div>
        <div class="min-h-0 flex-1 bg-white"><HtmlFrame fill :html="page.html" :title="page.name" /></div>
      </div>
    </div>
  </Teleport>
</template>
