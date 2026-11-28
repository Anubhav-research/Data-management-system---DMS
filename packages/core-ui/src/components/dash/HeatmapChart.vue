<script setup>
// When do clients pick up? (design review 27 Nov 2026) A week-by-hour grid of the period's calls: each cell is a
// weekday and an hour, coloured by its connect rate (or, switched, by how many calls were made) on one hue from light
// to dark. Cells with too few calls to judge (under `min`) stay grey, so a lucky single call is not read as the best
// time. The best cell is outlined and named above the grid. Hover shows the numbers; a click opens the calls.
// card: { rows: [label], cols: [{ h, label }], cells: [[{ calls, conn, drill, listCount }]], min }
import { ref, computed } from 'vue'
const props = defineProps({ card: { type: Object, required: true } })
const emit = defineEmits(['open'])
const mode = ref('rate')
const min = computed(() => props.card.min ?? 5)
const rate = (c) => (c && c.calls ? (c.conn / c.calls) * 100 : null)
const maxCalls = computed(() => Math.max(1, ...props.card.cells.flat().map((c) => c?.calls || 0)))
/** six steps of the one hue, spread over this period's own range - from its lowest to its highest connect rate (cells
 *  with enough calls), or from few to the busiest cell - so the better hours stand out even when all are close */
const range = computed(() => { const l = props.card.cells.flat().filter((c) => c && c.calls >= min.value).map(rate); return l.length ? { lo: Math.min(...l), hi: Math.max(...l) } : { lo: 0, hi: 100 } })
function step(c) {
  if (!c || !c.calls) return null
  if (mode.value === 'calls') return Math.min(5, Math.ceil((c.calls / maxCalls.value) * 5))
  if (c.calls < min.value) return -1
  const { lo, hi } = range.value
  return hi - lo < 0.5 ? 3 : Math.min(5, Math.floor(((rate(c) - lo) / (hi - lo)) * 5.999))
}
const bg = (s) => (s == null ? 'var(--viz-grid)' : s < 0 ? 'repeating-linear-gradient(135deg, var(--viz-grid) 0 3px, transparent 3px 6px)' : `var(--viz-heat-${s})`)
const ink = (s) => (s != null && s >= 3 ? '#fff' : 'var(--ink-gray-7, #52514e)')
const best = computed(() => {
  let b = null
  props.card.rows.forEach((_, r) => props.card.cols.forEach((_, k) => { const c = props.card.cells[r][k]; if (c && c.calls >= min.value && (!b || rate(c) > b.rate || (rate(c) === b.rate && c.calls > b.calls))) b = { r, k, rate: rate(c), calls: c.calls } }))
  return b
})
const busiest = computed(() => {
  let b = null
  props.card.rows.forEach((_, r) => props.card.cols.forEach((_, k) => { const c = props.card.cells[r][k]; if (c && (!b || c.calls > b.calls)) b = { r, k, calls: c.calls } }))
  return b
})
const hover = ref(null)
const clickable = (c) => !!(c?.drill && c.drill.some((d) => d.count && d.to))
const pct = (v) => (v == null ? '–' : `${Math.round(v)}%`)
</script>
<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-ink-gray-7">
        <template v-if="mode === 'rate' && best">Best time to call: <b class="font-semibold text-ink-gray-9">{{ card.rows[best.r] }} {{ card.cols[best.k].label }}</b> · {{ pct(best.rate) }} picked up</template>
        <template v-else-if="mode === 'calls' && busiest">Busiest: <b class="font-semibold text-ink-gray-9">{{ card.rows[busiest.r] }} {{ card.cols[busiest.k].label }}</b> · {{ busiest.calls.toLocaleString('en-IN') }} calls</template>
        <template v-else>No calls in this period.</template>
      </p>
      <div class="inline-flex rounded-lg bg-surface-gray-2 p-0.5 text-xs" role="tablist" aria-label="Colour by">
        <button v-for="[k, l] in [['rate', 'Connect rate'], ['calls', 'Calls']]" :key="k" type="button" role="tab" :aria-selected="mode === k" class="rounded-md px-2.5 py-1"
          :class="mode === k ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`dash-heat-mode-${k}`" @click="mode = k">{{ l }}</button>
      </div>
    </div>
    <div class="dms-scroll overflow-x-auto pb-1">
      <div class="relative min-w-[560px]" @mouseleave="hover = null">
        <div class="grid gap-[3px]" :style="{ gridTemplateColumns: `2.5rem repeat(${card.cols.length}, minmax(0, 1fr))` }">
          <span />
          <span v-for="(c, k) in card.cols" :key="c.h" class="pb-1 text-center text-[10px] text-ink-gray-5">{{ k % 2 === 0 ? c.label : '' }}</span>
          <template v-for="(row, r) in card.rows" :key="row">
            <span class="flex items-center text-[11px] font-medium text-ink-gray-6">{{ row }}</span>
            <component :is="clickable(card.cells[r][k]) ? 'button' : 'div'" v-for="(c, k) in card.cols" :key="c.h" type="button"
              class="relative flex h-8 items-center justify-center rounded-[5px] text-[10px] font-medium tabular-nums transition-transform hover:z-[2] hover:scale-110"
              :style="{ background: bg(step(card.cells[r][k])), color: ink(step(card.cells[r][k])), boxShadow: best && mode === 'rate' && best.r === r && best.k === k ? '0 0 0 2px var(--surface-base, #fff), 0 0 0 4px var(--viz-heat-5)' : null }"
              :data-testid="`dash-heat-${r}-${c.h}`" :data-count="clickable(card.cells[r][k]) ? card.cells[r][k].listCount : undefined"
              @mouseenter="hover = { r, k }" @focus="hover = { r, k }" @click="clickable(card.cells[r][k]) && emit('open', card.cells[r][k].drill, $event)">
              <span v-if="best && mode === 'rate' && best.r === r && best.k === k" class="lucide-star size-3" />
            </component>
          </template>
        </div>
        <!-- hover card -->
        <div v-if="hover && card.cells[hover.r][hover.k]?.calls" class="pointer-events-none absolute z-10 w-44 rounded-xl border bg-surface-modal px-3 py-2 text-xs shadow-xl"
          :style="{ left: `clamp(0px, calc(2.5rem + ${((hover.k + 0.5) / card.cols.length) * 100}% - 88px), calc(100% - 176px))`, top: `${(hover.r + 1) * 35 + 22}px` }">
          <div class="mb-1 font-semibold text-ink-gray-9">{{ card.rows[hover.r] }} · {{ card.cols[hover.k].label }}</div>
          <div class="flex justify-between text-ink-gray-7"><span>Calls</span><b class="tabular-nums text-ink-gray-9">{{ card.cells[hover.r][hover.k].calls.toLocaleString('en-IN') }}</b></div>
          <div class="flex justify-between text-ink-gray-7"><span>Connected</span><b class="tabular-nums text-ink-gray-9">{{ card.cells[hover.r][hover.k].conn.toLocaleString('en-IN') }}</b></div>
          <div class="flex justify-between text-ink-gray-7"><span>Connect rate</span><b class="tabular-nums text-ink-gray-9">{{ pct(rate(card.cells[hover.r][hover.k])) }}</b></div>
          <div v-if="card.cells[hover.r][hover.k].calls < min" class="mt-1 text-[10.5px] text-ink-gray-5">Too few calls to judge</div>
        </div>
      </div>
    </div>
    <!-- the scale -->
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-gray-5">
      <span class="flex items-center gap-1.5">{{ mode === 'rate' ? 'Connect rate' : 'Calls' }}
        <span class="flex gap-[2px]"><span v-for="s in [0, 1, 2, 3, 4, 5]" :key="s" class="h-2.5 w-5 rounded-[2px]" :style="{ background: `var(--viz-heat-${s})` }" /></span>
        <template v-if="mode === 'rate'">{{ pct(range.lo) }} → {{ pct(range.hi) }}</template><template v-else>few → many</template>
      </span>
      <span v-if="mode === 'rate'" class="flex items-center gap-1.5"><span class="h-2.5 w-5 rounded-[2px]" :style="{ background: bg(-1) }" />under {{ min }} calls</span>
      <span v-if="mode === 'rate' && best" class="flex items-center gap-1"><span class="lucide-star size-3 text-ink-gray-7" />best slot</span>
    </div>
  </div>
</template>
