<script setup>
// A column chart for a dashboard card (a headline number per day, calls by hour). Each column can be stacked
// (connected / not connected, Prospect DMS / Investor DMS); every part opens its records.
// Design review 27 Nov 2026 (data-viz mark specs): columns at most 24px wide with the rest of the band left as air,
// 4px rounded top, square at the baseline, a 2px gap between stacked parts; solid hairline guide lines and a compact
// scale; the average of the finished days as a dashed reference line with the best day named; the day still running
// marked "so far" (striped) so a half day is not read as a bad one; hovering a column shows a card with each part,
// the total and the share of the first part (e.g. the connect rate).
import { ref, computed } from 'vue'
import { toneColor, compact } from '../../dash/tones.js'
const props = defineProps({
  columns: { type: Array, default: () => [] }, // [{ key, label, title, partial, segments: [{ key, label, tone, value, drill, listCount }] }]
  legend: { type: Array, default: () => [] },
  height: { type: Number, default: 150 },
  unit: { type: String, default: '' },
  avg: Boolean, // show the average line and the best day
  per: { type: String, default: 'day' }, // what a column is: day or hour
})
const emit = defineEmits(['open'])
const clickable = (s) => !!(s.drill && s.drill.some((d) => d.count && d.to))
const total = (c) => c.segments.reduce((t, s) => t + (s.value || 0), 0)
// a rounded top for the scale (4 steps of 1, 2, 2.5, 5 or 10 × a power of ten), so the guide lines fall on round numbers
const scale = computed(() => {
  const m = Math.max(1, ...props.columns.map(total))
  const raw = m / 4; const mag = 10 ** Math.floor(Math.log10(raw)); const steps = mag >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]
  const step = Math.max(1, steps.map((x) => x * mag).find((x) => x >= raw))
  return { top: step * 4, ticks: [4, 3, 2, 1, 0].map((i) => i * step) }
})
const TOP = 10 // room above the tallest column, so the top of the scale is not cut
const plot = computed(() => props.height - TOP)
const px = (v) => (v / scale.value.top) * plot.value
const fmt = (v) => `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: props.unit || Math.abs(v) < 10 ? 1 : 0 })}${props.unit}`
const tick = (v) => (props.unit ? fmt(v) : compact(v))
const segLabel = (s, i) => s.label || props.legend[i]?.label || ''
// many columns (a 90-day period): label every n-th one so the labels never collide
const every = computed(() => Math.max(1, Math.ceil(props.columns.length / 16)))
const done = computed(() => props.columns.filter((c) => !c.partial))
const average = computed(() => (props.avg && done.value.length > 1 ? done.value.reduce((t, c) => t + total(c), 0) / done.value.length : null))
const best = computed(() => (props.avg && done.value.length > 1 ? done.value.reduce((b, c) => (total(c) > total(b) ? c : b), done.value[0]) : null))
const hover = ref(null)
const tipLeft = (i) => `clamp(0px, calc(${((i + 0.5) / props.columns.length) * 100}% - 104px), calc(100% - 208px))`
const share = (c) => { const t = total(c); return c.segments.length > 1 && t && !props.unit ? Math.round(((c.segments[0].value || 0) / t) * 1000) / 10 : null }
/** the parts drawn, bottom first; only the top one is rounded */
const drawn = (c) => c.segments.filter((s) => (s.value || 0) > 0)
</script>
<template>
  <div>
    <div v-if="legend.length || average != null" class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-gray-6">
      <span v-for="(l, i) in legend" :key="l.label" class="flex items-center gap-1.5"><span class="size-2.5 rounded-[3px]" :style="{ background: toneColor(l.tone, i) }" />{{ l.label }}</span>
      <span v-if="average != null" class="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="flex items-center gap-1.5"><span class="w-4 border-t-[1.5px] border-dashed" style="border-color: var(--viz-muted)" />Avg <b class="font-semibold tabular-nums text-ink-gray-8">{{ fmt(average) }}</b> / {{ per }}</span>
        <span v-if="best" class="flex items-center gap-1"><span class="lucide-trophy size-3 text-ink-gray-5" />Best <b class="font-semibold text-ink-gray-8">{{ best.title || best.label }}</b> · <b class="font-semibold tabular-nums text-ink-gray-8">{{ fmt(total(best)) }}</b></span>
      </span>
    </div>
    <div class="flex gap-2">
      <!-- number scale -->
      <div class="relative w-9 shrink-0 text-right text-[10px] tabular-nums text-ink-gray-5" :style="{ height: `${height}px` }" aria-hidden="true">
        <span v-for="t in scale.ticks" :key="t" class="absolute right-0 -translate-y-1/2 leading-none" :style="{ top: `${TOP + plot - px(t)}px` }" data-testid="dash-axis-tick">{{ tick(t) }}</span>
      </div>
      <div class="relative min-w-0 flex-1" @mouseleave="hover = null">
        <!-- guide lines: solid hairlines, the baseline one step stronger -->
        <div v-for="t in scale.ticks" :key="t" class="pointer-events-none absolute inset-x-0 h-px" :style="{ top: `${TOP + plot - px(t)}px`, background: t ? 'var(--viz-grid)' : 'var(--viz-axis)' }" />
        <!-- the average of the finished days (a reference line, so dashed) -->
        <div v-if="average != null" class="pointer-events-none absolute inset-x-0 z-[1] border-t-[1.5px] border-dashed" :style="{ top: `${TOP + plot - px(average)}px`, borderColor: 'var(--viz-muted)' }" data-testid="dash-col-avg" />
        <div class="relative flex items-end" :style="{ height: `${height}px` }">
          <div v-for="(c, i) in columns" :key="c.key" class="flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-t-md transition-colors" :class="hover === i && 'bg-surface-gray-1'" @mouseenter="hover = i">
            <div class="flex w-[62%] max-w-[24px] flex-col-reverse gap-[2px]" :class="c.partial && 'opacity-70'">
              <component :is="clickable(s) ? 'button' : 'div'" v-for="(s, si) in drawn(c)" :key="s.key" type="button" class="block w-full transition-[filter] hover:brightness-110"
                :class="[si === drawn(c).length - 1 && 'rounded-t-[4px]', c.partial && 'dash-stripes']"
                :style="{ height: `${Math.max(2, px(s.value || 0) - 2)}px`, background: toneColor(s.tone || 'dark', c.segments.indexOf(s)) }" :aria-label="`${c.title || c.label}: ${s.label || ''} ${fmt(s.value || 0)}`"
                :data-count="clickable(s) ? s.listCount ?? s.value : undefined" :data-testid="`dash-col-${c.key}-${s.key}`" @click="clickable(s) && emit('open', s.drill, $event)" />
            </div>
          </div>
        </div>
        <!-- the hover card -->
        <div v-if="hover != null && columns[hover]" class="pointer-events-none absolute top-0 z-10 w-52 rounded-xl border bg-surface-modal px-3 py-2.5 text-xs shadow-xl" :style="{ left: tipLeft(hover) }" data-testid="dash-col-tip">
          <div class="mb-1.5 flex items-center justify-between font-semibold text-ink-gray-9">{{ columns[hover].title || columns[hover].label }}<span v-if="columns[hover].partial" class="rounded-full bg-surface-gray-2 px-1.5 py-px text-[10px] font-medium text-ink-gray-6">so far</span></div>
          <div v-for="(s, i) in columns[hover].segments" :key="s.key" class="flex items-center gap-2 py-0.5">
            <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ background: toneColor(s.tone || 'dark', i) }" /><span class="flex-1 text-ink-gray-7">{{ segLabel(s, i) }}</span><b class="font-semibold tabular-nums text-ink-gray-9">{{ fmt(s.value || 0) }}</b>
          </div>
          <div v-if="columns[hover].segments.length > 1" class="mt-1.5 flex justify-between border-t pt-1.5 text-ink-gray-7"><span>Total</span><b class="font-semibold tabular-nums text-ink-gray-9">{{ fmt(total(columns[hover])) }}</b></div>
          <div v-if="share(columns[hover]) != null" class="flex justify-between text-ink-gray-5"><span>{{ segLabel(columns[hover].segments[0], 0) === 'Connected' ? 'Connect rate' : `${segLabel(columns[hover].segments[0], 0)} share` }}</span><span class="tabular-nums">{{ share(columns[hover]) }}%</span></div>
          <div v-if="columns[hover].segments.some(clickable)" class="mt-1.5 text-[10.5px] text-ink-gray-5">Click a part to open its records</div>
        </div>
        <div class="mt-1.5 flex">
          <span v-for="(c, i) in columns" :key="c.key" class="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px]" :class="c.partial ? 'font-semibold text-ink-gray-8' : 'text-ink-gray-5'">{{ c.partial && per === 'day' ? 'Today' : i % every === 0 ? c.label : '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
