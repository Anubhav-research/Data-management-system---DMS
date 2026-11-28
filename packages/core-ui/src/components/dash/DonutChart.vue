<script setup>
// A donut with its legend, for a share of a whole with a few parts (services keep it to about six; longer lists are
// ranked bars). Design review 27 Nov 2026: a thin ring with a 2px surface gap between parts, the total and what it
// counts in the middle, the legend with each part's number and share. Colours: the part's tone when it means
// something (a website, a status), otherwise the categorical slots in a fixed order. Each part and legend row opens
// its records.
import { ref, computed } from 'vue'
import { toneColor } from '../../dash/tones.js'
const props = defineProps({ slices: { type: Array, default: () => [] }, center: String, caption: String, empty: String })
const emit = defineEmits(['open'])
const total = computed(() => props.slices.reduce((t, s) => t + (s.value || 0), 0))
const clickable = (s) => !!(s.drill && s.drill.some((d) => d.count && d.to))
const color = (s, i) => toneColor(s.tone, i)
const R = 15.915 // circumference 100
const GAP = 0.9 // the surface gap between parts, in % of the ring
const arcs = computed(() => {
  let off = 0
  return props.slices.map((s, i) => { const share = total.value ? (s.value / total.value) * 100 : 0; const a = { ...s, i, share, off }; off += share; return a })
    .filter((a) => a.share > 0).map((a, _, l) => ({ ...a, len: l.length > 1 ? Math.max(a.share - GAP, 0.3) : 100 }))
})
const hover = ref(null)
const big = (n) => (n >= 1e5 ? `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)}L` : n.toLocaleString('en-IN'))
</script>
<template>
  <p v-if="!total" class="flex flex-col items-center gap-1 py-8 text-center text-sm text-ink-gray-5"><span class="lucide-circle-dashed size-6 text-ink-gray-4" />{{ empty || 'Nothing in this period.' }}</p>
  <div v-else class="flex flex-wrap items-center justify-center gap-x-5 gap-y-4">
    <div class="relative size-32 shrink-0">
      <svg viewBox="0 0 42 42" class="size-full -rotate-90" aria-hidden="true">
        <circle cx="21" cy="21" :r="R" fill="none" stroke="var(--viz-grid)" stroke-width="4.2" />
        <circle v-for="a in arcs" :key="a.key" cx="21" cy="21" :r="R" fill="none" :stroke="color(a, a.i)" :stroke-width="hover === a.i ? 5.4 : 4.2" class="transition-all" :class="clickable(a) && 'cursor-pointer'"
          :stroke-dasharray="`${a.len} ${100 - a.len}`" :stroke-dashoffset="-a.off" @mouseenter="hover = a.i" @mouseleave="hover = null" @click="clickable(a) && emit('open', a.drill, $event)"><title>{{ a.label }}: {{ a.value }}</title></circle>
      </svg>
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <template v-if="hover != null && slices[hover]">
          <span class="dash-num text-xl font-semibold leading-none text-ink-gray-9">{{ Math.round((slices[hover].value / total) * 100) }}%</span>
          <span class="mt-1 max-w-[5.5rem] truncate text-[10px] text-ink-gray-5">{{ slices[hover].label }}</span>
        </template>
        <template v-else>
          <span class="dash-num text-xl font-semibold leading-none text-ink-gray-9">{{ big(total) }}</span>
          <span class="mt-1 text-[10px] uppercase tracking-wide text-ink-gray-5">{{ caption || 'total' }}</span>
        </template>
      </div>
    </div>
    <ul class="min-w-[12rem] flex-1 space-y-0.5">
      <li v-for="(s, i) in slices" :key="s.key" @mouseenter="hover = i" @mouseleave="hover = null">
        <component :is="clickable(s) ? 'button' : 'div'" type="button" class="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm" :class="[clickable(s) && 'hover:bg-surface-gray-2', hover === i && 'bg-surface-gray-1']"
          :data-testid="`dash-slice-${s.key}`" :data-count="clickable(s) ? s.listCount ?? s.value : undefined" @click="clickable(s) && emit('open', s.drill, $event)">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ background: color(s, i) }" />
          <span class="min-w-0 flex-1 truncate leading-tight text-ink-gray-7" :title="s.label">{{ s.label }}</span>
          <span class="ml-2 shrink-0 font-semibold tabular-nums text-ink-gray-9">{{ s.value.toLocaleString('en-IN') }}</span>
          <span class="w-10 shrink-0 text-right text-xs tabular-nums text-ink-gray-5">{{ total ? Math.round((s.value / total) * 100) : 0 }}%</span>
        </component>
      </li>
    </ul>
    <p v-if="center" class="sr-only">{{ center }}</p>
  </div>
</template>
