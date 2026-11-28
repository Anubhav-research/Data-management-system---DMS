<script setup>
// One number in a dashboard table: a button that opens its records when it has any, its colour by the rules, and a
// small bar scaled to the largest value of the column - beside it for percentage-bar columns (fmt 'pctbar'), under
// it for columns marked `bar` (design review 27 Nov 2026: who does the most work reads at a glance, still A–Z).
import { inrShort, fmtTalk } from '../../format.js'
const props = defineProps({ cell: Object, fmt: String, max: { type: Number, default: 1 }, strong: Boolean, bar: Boolean })
const emit = defineEmits(['open'])
const TONE = { green: 'text-ink-green-7', amber: 'text-ink-amber-7', red: 'text-ink-red-6' }
function show(v, fmt) {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '–'
  if (fmt === 'pct' || fmt === 'pctbar') return `${v}%`
  if (fmt === 'time') return fmtTalk(v)
  if (fmt === 'money') return v ? inrShort(v) : '₹0'
  if (fmt === 'text') return v
  return typeof v === 'number' ? v.toLocaleString('en-IN') : v
}
const clickable = () => !!(props.cell?.drill && props.cell.drill.some((d) => d.count && d.to))
const counted = () => !props.fmt || props.fmt === 'n'
const share = () => Math.min(100, ((Number(props.cell?.value) || 0) / props.max) * 100)
</script>
<template>
  <span class="inline-flex flex-col items-end">
    <span class="inline-flex items-center justify-end gap-2">
      <span v-if="fmt === 'pctbar'" class="hidden h-1.5 w-16 overflow-hidden rounded-full sm:block" style="background: var(--viz-grid)"><span class="block h-full rounded-full" :style="{ width: `${share()}%`, background: 'var(--viz-accent)' }" /></span>
      <button v-if="clickable()" type="button" class="rounded px-1 hover:bg-surface-gray-2" :class="[TONE[cell.tone] || (strong ? 'text-ink-gray-9' : 'text-ink-gray-8'), strong && 'font-semibold']"
        :data-count="counted() ? cell.listCount ?? cell.value : undefined" @click="emit('open', cell.drill, $event)">{{ show(cell.value, fmt) }}<span v-if="cell.extra" class="ml-1 text-xs" :class="TONE[cell.extraTone]">{{ cell.extra }}</span></button>
      <span v-else class="px-1" :class="[TONE[cell?.tone] || (strong ? 'text-ink-gray-9' : 'text-ink-gray-5'), strong && 'font-semibold']">{{ show(cell?.value, fmt) }}</span>
    </span>
    <span v-if="bar && !strong" class="mr-1 mt-0.5 block h-[3px] w-12 overflow-hidden rounded-full" style="background: var(--viz-grid)"><span class="block h-full rounded-full" :style="{ width: `${share()}%`, background: 'var(--viz-accent-2)' }" /></span>
  </span>
</template>
