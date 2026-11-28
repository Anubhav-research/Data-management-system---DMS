<script setup>
// The headline row (design review 27 Nov 2026): the few numbers a person looks at first. Each card: an icon and the
// label, the number (large, proportional digits), its change against the previous period of the same length as a pill
// (green = better, red = worse - a rise in something bad is red), one line of context, a small trend, and - when the
// number adds both websites - a thin split bar (Prospect DMS blue, Investor DMS aqua) with each part's count.
// Clicking a card shows its trend in the big chart below (the selected card carries the accent); the small arrow
// opens the records behind the number.
import { computed } from 'vue'
import { inrShort, fmtTalk } from '../../format.js'
import { toneColor } from '../../dash/tones.js'
const props = defineProps({ items: { type: Array, default: () => [] }, caption: String, selected: String })
const emit = defineEmits(['open', 'select'])
const show = (it, v = it.value) => (v == null ? '–' : it.fmt === 'pct' ? `${v}%` : it.fmt === 'time' ? fmtTalk(v) : it.fmt === 'money' ? inrShort(v) : Number(v).toLocaleString('en-IN'))
const good = (it) => (it.delta == null || it.delta === 0 ? null : (it.delta > 0) !== !!it.bad)
const TONE = { green: 'text-ink-green-7', amber: 'text-ink-amber-7', red: 'text-ink-red-6' }
const clickable = (it) => !!(it.drill && it.drill.some((d) => d.count && d.to))
function spark(d) {
  const pts = (d || []).map((v) => (v == null ? null : v)); const vals = pts.filter((v) => v != null)
  if (vals.length < 2) return null
  const max = Math.max(...vals, 1); const w = 100; const h = 28; const step = w / (pts.length - 1)
  const xy = pts.map((v, i) => (v == null ? null : [i * step, h - (v / max) * (h - 4) - 2])).filter(Boolean)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { line, area: `${line} L${xy[xy.length - 1][0].toFixed(1)},${h} L${xy[0][0].toFixed(1)},${h} Z` }
}
const sparks = computed(() => props.items.map((it) => spark(it.spark)))
const anyParts = computed(() => props.items.some((it) => it.parts))
const partsTotal = (it) => Math.max(1, (it.parts || []).reduce((t, p) => t + (p.value || 0), 0))
</script>
<template>
  <div>
  <!-- one legend for the website split under the cards -->
  <div v-if="anyParts" class="mb-2 flex items-center justify-end gap-4 text-[11px] text-ink-gray-5">
    <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" :style="{ background: toneColor('p') }" />Prospect DMS</span>
    <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" :style="{ background: toneColor('i') }" />Investor DMS</span>
  </div>
  <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label="Headline numbers" data-testid="dash-kpis">
    <div v-for="(it, i) in items" :key="it.key" role="tab" tabindex="0" :aria-selected="selected === it.key"
      class="dash-card group relative flex min-w-0 cursor-pointer flex-col overflow-hidden border bg-surface-base px-4 pb-3 pt-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
      :class="selected === it.key ? 'border-transparent' : 'hover:border-outline-gray-3'" :style="selected === it.key ? { boxShadow: '0 0 0 1.5px var(--viz-accent), var(--card-shadow-hover)' } : null"
      :data-testid="`dash-kpi-${it.key}`" @click="emit('select', it.key)" @keydown.enter="emit('select', it.key)">
      <span v-if="selected === it.key" class="absolute inset-x-0 top-0 h-[3px]" style="background: var(--viz-accent)" aria-hidden="true" />
      <div class="flex items-center justify-between gap-1">
        <span class="flex min-w-0 items-center gap-2">
          <span v-if="it.icon" class="flex size-6 shrink-0 items-center justify-center rounded-md" :style="{ background: 'var(--viz-accent-wash)', color: 'var(--viz-accent)' }"><span :class="it.icon" class="size-3.5" /></span>
          <span class="truncate text-[13px] font-medium text-ink-gray-6">{{ it.label }}</span>
        </span>
        <button v-if="clickable(it)" type="button" class="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-gray-4 opacity-60 transition group-hover:opacity-100 hover:bg-surface-gray-2 hover:text-ink-gray-8" :title="`Open the records (${it.listCount ?? it.value})`"
          :aria-label="`Open the records behind ${it.label}`" :data-testid="`dash-kpi-open-${it.key}`" :data-count="!it.fmt ? it.listCount ?? it.value : undefined" @click.stop="emit('open', it.drill, $event)">
          <span class="lucide-arrow-up-right size-3.5" />
        </button>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="dash-num whitespace-nowrap text-[26px] font-semibold leading-none" :class="TONE[it.tone] || 'text-ink-gray-9'" data-value><template v-if="/ hrs$/.test(show(it))">{{ show(it).replace(/ hrs$/, '') }}<span class="ml-0.5 text-sm font-medium text-ink-gray-5">hrs</span></template><template v-else>{{ show(it) }}</template></span>
        <span v-if="it.delta != null" class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" :title="caption"
          :class="good(it) === null ? 'bg-surface-gray-2 text-ink-gray-6' : good(it) ? 'bg-surface-green-1 text-ink-green-7' : 'bg-surface-red-1 text-ink-red-6'">
          <span :class="it.delta > 0 ? 'lucide-trending-up' : it.delta < 0 ? 'lucide-trending-down' : 'lucide-minus'" class="size-3" />{{ Math.abs(it.delta) > 999 ? '999+' : Math.abs(it.delta) }}%
        </span>
      </div>
      <div class="mt-1.5 h-4 truncate text-xs text-ink-gray-5">{{ it.sub || caption }}</div>
      <svg v-if="sparks[i]" viewBox="0 0 100 28" preserveAspectRatio="none" class="mt-2 h-7 w-full" aria-hidden="true" :style="{ color: selected === it.key ? 'var(--viz-accent)' : 'var(--viz-axis)' }">
        <path :d="sparks[i].area" fill="currentColor" fill-opacity="0.12" />
        <path :d="sparks[i].line" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div v-else class="mt-2 h-7" />
      <!-- the split between the two websites, when the number adds both -->
      <div v-if="anyParts" class="mt-2 h-[18px]">
        <template v-if="it.parts">
          <div class="flex h-1 gap-[2px] overflow-hidden rounded-full" :title="it.parts.map((p) => `${p.label} ${show(it, p.value)}`).join(' · ')">
            <span v-for="p in it.parts.filter((x) => x.value)" :key="p.label" class="h-full rounded-full" :style="{ width: `${(p.value / partsTotal(it)) * 100}%`, background: toneColor(p.tone === 'green' ? 'i' : 'p') }" />
          </div>
          <div class="mt-1 flex justify-between gap-2 text-[10.5px] text-ink-gray-5">
            <span v-for="p in it.parts" :key="p.label" class="flex min-w-0 items-center gap-1 truncate"><span class="size-1.5 shrink-0 rounded-full" :style="{ background: toneColor(p.tone === 'green' ? 'i' : 'p') }" /><span class="sr-only">{{ p.label }} </span><b class="font-semibold tabular-nums text-ink-gray-7">{{ show(it, p.value) }}</b></span>
          </div>
        </template>
      </div>
    </div>
  </div>
  </div>
</template>
