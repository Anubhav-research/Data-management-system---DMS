<script setup>
// A line chart for comparing a few teams or people over the days of the period: one coloured line each, and an
// optional dashed line (e.g. the Money Honey average). A number scale with faint guide lines runs down the left;
// hovering shows every line's value for that day. Drawn in SVG at the real width, so lines stay sharp.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  labels: { type: Array, default: () => [] }, // x-axis labels (days or hours)
  titles: { type: Array, default: () => [] }, // full names of the x values, for the hover box
  lines: { type: Array, default: () => [] }, // [{ key, label, color, values: [number|null], dashed }]
  format: { type: Function, default: (v) => String(v) },
  height: { type: Number, default: 260 },
})

const box = ref(null); const width = ref(600)
let ro = null
onMounted(() => { ro = new ResizeObserver(([e]) => { width.value = Math.max(120, Math.round(e.contentRect.width)) }); ro.observe(box.value) })
onBeforeUnmount(() => ro?.disconnect())

const PAD = { left: 44, right: 12, top: 10, bottom: 22 }
const plotW = computed(() => width.value - PAD.left - PAD.right)
const plotH = computed(() => props.height - PAD.top - PAD.bottom)
// a rounded top for the scale (4 steps of 1, 2, 2.5, 5 or 10 × a power of ten), as in the column chart
const scale = computed(() => {
  let m = 0; for (const l of props.lines) for (const v of l.values) if (v != null && v > m) m = v
  const raw = Math.max(m, 1) / 4; const mag = 10 ** Math.floor(Math.log10(raw)); const steps = mag >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]
  const step = steps.map((x) => x * mag).find((x) => x >= raw) || raw
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => Math.round(i * step * 100) / 100) }
})
const n = computed(() => props.labels.length)
const x = (i) => PAD.left + (n.value <= 1 ? plotW.value / 2 : (i / (n.value - 1)) * plotW.value)
const y = (v) => PAD.top + plotH.value - (v / scale.value.top) * plotH.value
/** The path of a line; a day without a value (no calls, so no rate) breaks the line. */
function path(values) {
  let d = ''; let pen = false
  values.forEach((v, i) => { if (v == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true })
  return d
}
const every = computed(() => Math.max(1, Math.ceil(n.value / Math.max(2, Math.floor(plotW.value / 56)))))

// hover: the nearest day, with every line's value
const hover = ref(null)
function move(e) {
  const r = box.value.getBoundingClientRect(); const px = e.clientX - r.left
  if (px < PAD.left - 8 || px > width.value - PAD.right + 8 || !n.value) { hover.value = null; return }
  const i = n.value <= 1 ? 0 : Math.round(((px - PAD.left) / plotW.value) * (n.value - 1))
  hover.value = Math.max(0, Math.min(n.value - 1, i))
}
const tipLeft = computed(() => (hover.value == null ? 0 : Math.min(width.value - 210, Math.max(0, x(hover.value) + 12))))
</script>

<template>
  <div ref="box" class="relative w-full min-w-0 select-none" :style="{ height: `${height}px` }" data-testid="dash-line-chart" @mousemove="move" @mouseleave="hover = null">
    <svg :width="width" :height="height" class="absolute inset-0 overflow-visible" role="img" aria-label="Line chart">
      <!-- scale and guide lines -->
      <g v-for="t in scale.ticks" :key="t">
        <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(t)" :y2="y(t)" class="stroke-current" :class="t ? 'text-ink-gray-2' : 'text-ink-gray-3'" :stroke-dasharray="t ? '3 3' : null" />
        <text :x="PAD.left - 6" :y="y(t)" text-anchor="end" dominant-baseline="middle" class="fill-current text-[10px] tabular-nums text-ink-gray-5">{{ format(t) }}</text>
      </g>
      <text v-for="(l, i) in labels" v-show="i % every === 0" :key="`x${i}`" :x="x(i)" :y="height - 6" text-anchor="middle" class="fill-current text-[10px] text-ink-gray-5">{{ l }}</text>
      <!-- the day under the pointer -->
      <line v-if="hover != null" :x1="x(hover)" :x2="x(hover)" :y1="PAD.top" :y2="PAD.top + plotH" class="stroke-current text-ink-gray-4" />
      <!-- the lines -->
      <path v-for="l in lines" :key="l.key" :d="path(l.values)" fill="none" :stroke="l.color" :stroke-width="l.dashed ? 2 : 2.25" stroke-linejoin="round" stroke-linecap="round" :stroke-dasharray="l.dashed ? '6 5' : null" />
      <template v-if="hover != null">
        <circle v-for="l in lines.filter((z) => z.values[hover] != null)" :key="`d${l.key}`" :cx="x(hover)" :cy="y(l.values[hover])" r="3.5" :fill="l.color" />
      </template>
    </svg>
    <div v-if="hover != null" class="pointer-events-none absolute top-1 z-10 w-[200px] rounded-8 border bg-surface-modal px-2.5 py-2 text-xs shadow-lg" :style="{ left: `${tipLeft}px` }">
      <div class="mb-1 font-medium text-ink-gray-9">{{ titles[hover] || labels[hover] }}</div>
      <div v-for="l in lines" :key="l.key" class="flex items-center gap-1.5 py-px">
        <span class="h-0.5 w-3 shrink-0 rounded-full" :style="{ background: l.color }" />
        <span class="min-w-0 flex-1 truncate text-ink-gray-7">{{ l.label }}</span>
        <span class="font-medium tabular-nums text-ink-gray-9">{{ l.values[hover] == null ? '–' : format(l.values[hover]) }}</span>
      </div>
    </div>
  </div>
</template>
