<script setup>
// A headline number: what it is, the figure, its change against the comparison period (green when it moved the good
// way), a line of context, and the day-by-day trend. The whole card opens the records behind it.
import { computed } from 'vue'
import { inrShort } from '../../format.js'
const props = defineProps({ item: Object, caption: String })
defineEmits(['open'])
const fmtTalk = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` }
const shown = computed(() => {
  const v = props.item.value
  if (v == null) return '–'
  if (props.item.time) return fmtTalk(v)
  if (props.item.money) return v ? inrShort(v) : '₹0'
  return `${typeof v === 'number' ? v.toLocaleString('en-IN') : v}${props.item.suffix || ''}`
})
const good = computed(() => (props.item.delta == null || props.item.delta === 0 ? null : (props.item.delta > 0) !== !!props.item.negativeIsBetter))
// trend line: a small area under a line, scaled to the card
const path = computed(() => {
  const d = (props.item.spark || []).map((x) => (x == null ? null : x)); const pts = d.filter((x) => x != null)
  if (pts.length < 2) return null
  const max = Math.max(...pts, 1); const w = 100; const h = 28; const step = w / (d.length - 1 || 1)
  const xy = d.map((v, i) => (v == null ? null : [i * step, h - (v / max) * (h - 3) - 1.5])).filter(Boolean)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { line, area: `${line} L${xy[xy.length - 1][0].toFixed(1)},${h} L${xy[0][0].toFixed(1)},${h} Z` }
})
</script>
<template>
  <button type="button" class="group flex flex-col rounded-8 border bg-surface-base p-4 text-left transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-outline-gray-3" :data-testid="item.testid || `kpi-${item.key}`" @click="$emit('open', item, $event)">
    <div class="flex items-center justify-between gap-2">
      <span class="truncate text-sm text-ink-gray-6">{{ item.label }}</span>
      <span class="lucide-arrow-up-right size-3.5 text-ink-gray-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
    <div class="mt-1.5 flex items-baseline gap-2">
      <span class="text-2xl font-semibold tabular-nums text-ink-gray-9" data-value>{{ shown }}</span>
      <span v-if="item.delta != null" class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
        :class="good === null ? 'bg-surface-gray-2 text-ink-gray-6' : good ? 'bg-surface-green-1 text-ink-green-7' : 'bg-surface-red-1 text-ink-red-7'" :title="caption">
        <span :class="item.delta > 0 ? 'lucide-arrow-up' : item.delta < 0 ? 'lucide-arrow-down' : 'lucide-minus'" class="size-3" />{{ Math.abs(item.delta) }}%
      </span>
    </div>
    <div class="mt-0.5 h-4 truncate text-xs text-ink-gray-5">{{ item.sub || (item.delta != null ? caption : '') }}</div>
    <svg v-if="path" viewBox="0 0 100 28" preserveAspectRatio="none" class="mt-2 h-7 w-full text-ink-blue-5" aria-hidden="true">
      <path :d="path.area" fill="currentColor" fill-opacity="0.1" />
      <path :d="path.line" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
    <div v-else class="mt-2 h-7" />
  </button>
</template>
