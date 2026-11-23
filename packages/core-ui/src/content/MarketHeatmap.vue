<script setup>
// Market heat map at the top of a Market Update (product owner, 19 Nov 2026: "like NSE"): one tile per index /
// instrument of a group, coloured by the day's % change: deeper green for a bigger rise, deeper red for a bigger
// fall, grey for no change. One group at a time (Index, Sectoral, Thematic, Metals ...), like NSE's heat map.
// Yields (bps) are coloured by their move in percentage points.
import { ref, computed, watch } from 'vue'
import { cell } from './market.js'

const props = defineProps({ market: { type: Object, required: true } })
const t = computed(() => props.market.tables?.[0])
const val = computed(() => t.value?.columns.find((c) => c.type === 'num'))
const pc = computed(() => t.value?.columns.find((c) => c.type === 'chgpct'))
const groups = computed(() => (t.value && val.value && pc.value ? t.value.sections.filter((s) => s.rows.some((r) => cell(r, pc.value).v != null)) : []))
const pick = ref(0)
watch(() => props.market, () => { if (pick.value >= groups.value.length) pick.value = 0 })
const tiles = computed(() => (groups.value[pick.value]?.rows || []).map((r) => {
  const p = cell(r, pc.value); const pct = p.v == null ? null : r.unit === 'bps' ? p.v / 100 : p.v
  return { name: r.name, value: cell(r, val.value).text, pct: p.text, tone: shade(pct), tip: `${r.name}: ${cell(r, val.value).text} (${p.text || 'no change'})${r.old?.[val.value.key] ? ` · as of ${r.old[val.value.key]}` : ''}`, old: !!r.old?.[val.value.key] }
}))
// steps like NSE's heat map; dark tiles get white text
function shade(p) {
  if (p == null) return 'bg-surface-gray-2 text-ink-gray-7'
  const a = Math.abs(p); const up = p > 0
  if (a < 0.005) return 'bg-surface-gray-2 text-ink-gray-8'
  if (a >= 2) return up ? 'bg-surface-green-8 text-white' : 'bg-surface-red-8 text-white'
  if (a >= 1) return up ? 'bg-surface-green-5 text-ink-green-9' : 'bg-surface-red-5 text-ink-red-9'
  if (a >= 0.5) return up ? 'bg-surface-green-3 text-ink-green-9' : 'bg-surface-red-3 text-ink-red-9'
  return up ? 'bg-surface-green-2 text-ink-green-9' : 'bg-surface-red-2 text-ink-red-9'
}
</script>
<template>
  <section v-if="groups.length" class="rounded-6 border p-3" data-testid="market-heatmap">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <div class="dms-scroll flex min-w-0 gap-1 overflow-x-auto">
        <button v-for="(g, i) in groups" :key="g.name" type="button" class="shrink-0 rounded-4 px-2.5 py-1 text-sm"
          :class="pick === i ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'text-ink-gray-6 hover:bg-surface-gray-2'" :data-testid="`heat-group-${g.name}`" @click="pick = i">{{ g.name }}</button>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      <div v-for="x in tiles" :key="x.name" :title="x.tip" class="flex min-h-[64px] flex-col justify-between rounded-4 px-3 py-2" :class="[x.tone, x.old && 'opacity-60']" data-testid="heat-tile">
        <div class="truncate text-sm font-medium">{{ x.name.replace(/\s*\(.*\)$/, '') }}</div>
        <div class="flex items-end justify-between gap-2">
          <span class="text-base font-semibold tabular-nums">{{ x.value }}</span>
          <span class="text-sm font-semibold tabular-nums">{{ x.pct }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
