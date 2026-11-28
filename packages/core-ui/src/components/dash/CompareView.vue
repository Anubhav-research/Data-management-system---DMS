<script setup>
// Compare: two or more teams (or people) ticked in the picker, side by side (product owner, 25 Nov 2026).
//  - a line per team or person over the days of the period, for the chosen measure, with the Money Honey average
//    per IS as a dashed line;
//  - a scorecard of every measure, each with how far it is from the Money Honey average (and, for people, from
//    their own team's average).
// Teams are compared in total, against the average team (product owner, 26 Nov 2026); people against the average IS.
import { ref, computed } from 'vue'
import LineChart from './LineChart.vue'
import { fmtTalk, inrShort } from '../../format.js'

const props = defineProps({ section: { type: Object, required: true } }) // services/dashboard.js compareSection()
const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d']
const MH = '#64748b'
const teams = computed(() => props.section.mode === 'teams')
const metric = ref('calls')
const lineMetrics = computed(() => props.section.metrics.filter((m) => m.line))
const M = computed(() => props.section.metrics.find((m) => m.key === metric.value) || lineMetrics.value[0])
const mhLabel = computed(() => (teams.value ? 'Money Honey avg (per team)' : 'Money Honey avg (per IS)'))

function fmt(v, m) {
  if (v == null) return '–'
  if (m.fmt === 'pct') return `${v}%`
  if (m.fmt === 'time') return fmtTalk(v)
  if (m.fmt === 'money') return inrShort(v)
  return Number(v).toLocaleString('en-IN', { maximumFractionDigits: teams.value ? 0 : 1 }) // team totals are whole numbers
}
const lineFmt = (v) => (M.value.fmt === 'pct' ? `${v}%` : M.value.fmt === 'money' ? inrShort(v) : M.value.lineUnit === 'min' ? `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 })}m` : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }))
/** How far from an average: points for rates, per cent otherwise; green when better. */
function diff(v, base, m) {
  if (v == null || base == null) return null
  const d = m.fmt === 'pct' ? Math.round((v - base) * 10) / 10 : base ? Math.round(((v - base) / base) * 100) : null
  if (d == null) return null
  return { text: d === 0 ? 'same' : `${d > 0 ? '+' : '−'}${Math.abs(d)}${m.fmt === 'pct' ? ' pts' : '%'}`, tone: d === 0 ? 'text-ink-gray-5' : (m.lowerBetter ? d < 0 : d > 0) ? 'text-ink-green-7' : 'text-ink-red-6' }
}
const lines = computed(() => {
  const k = M.value.key
  const out = props.section.entities.map((e, i) => ({ key: e.key, label: e.label, color: COLORS[i % COLORS.length], values: e.line[k] || [] }))
  out.push({ key: '__mh', label: mhLabel.value, color: MH, dashed: true, values: props.section.mh.line[k] || [] })
  return out
})
</script>

<template>
  <div class="min-w-0 rounded-10 border bg-surface-base p-4" data-testid="dash-compare">
    <!-- who is compared, and how -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <span v-for="(e, i) in section.entities" :key="e.key" class="inline-flex items-center gap-2 rounded-8 border border-outline-gray-2 px-2.5 py-1.5" data-testid="dash-compare-entity">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ background: COLORS[i % COLORS.length] }" />
          <span class="leading-tight"><span class="block text-sm font-medium text-ink-gray-9">{{ e.label }}</span><span class="block text-xs text-ink-gray-5">{{ e.sub }}</span></span>
        </span>
      </div>
    </div>

    <!-- the chosen measure over the days -->
    <div class="dms-scroll -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Measure">
      <button v-for="m in lineMetrics" :key="m.key" type="button" role="tab" :aria-selected="metric === m.key" class="shrink-0 rounded-full border px-3 py-1 text-sm"
        :class="metric === m.key ? 'border-outline-gray-4 bg-surface-gray-2 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-6 hover:bg-surface-gray-1'" :data-testid="`dash-compare-metric-${m.key}`" @click="metric = m.key">{{ m.label }}</button>
    </div>
    <p class="mt-2 text-xs text-ink-gray-5">{{ M.label }}{{ M.lineUnit === 'min' ? ' (minutes)' : '' }} per day{{ teams && M.fmt !== 'pct' ? ', team total' : '' }}</p>
    <LineChart class="mt-1" :labels="section.labels" :titles="section.titles" :lines="lines" :format="lineFmt" :height="260" />
    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-gray-6">
      <span v-for="l in lines" :key="l.key" class="inline-flex items-center gap-1.5">
        <span class="w-4 shrink-0" :style="{ borderTop: `2px ${l.dashed ? 'dashed' : 'solid'} ${l.color}` }" />{{ l.label }}
      </span>
    </div>

    <!-- every measure, against the Money Honey average (and, for people, their own team) -->
    <div class="dms-scroll mt-5 overflow-x-auto">
      <table class="w-full min-w-[36rem] text-sm" data-testid="dash-compare-table">
        <thead><tr class="border-b border-outline-gray-2 text-left text-xs text-ink-gray-5">
          <th class="py-2 pr-3 font-normal">Measure</th>
          <th v-for="(e, i) in section.entities" :key="e.key" class="px-3 py-2 text-right font-medium text-ink-gray-8">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="size-2 rounded-full" :style="{ background: COLORS[i % COLORS.length] }" />{{ e.label }}</span>
          </th>
          <th class="py-2 pl-3 text-right font-normal">{{ mhLabel }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="m in section.metrics" :key="m.key" class="border-b border-outline-gray-1 last:border-0" :class="[m.line && 'cursor-pointer hover:bg-surface-gray-1', metric === m.key && 'bg-surface-gray-1']" @click="m.line && (metric = m.key)">
            <td class="py-2 pr-3 text-ink-gray-8">{{ m.label }}<span v-if="m.hint || m.lowerBetter" class="block text-[11px] text-ink-gray-5">{{ m.lowerBetter ? 'lower is better' : m.hint }}</span></td>
            <td v-for="e in section.entities" :key="e.key" class="px-3 py-2 text-right align-top">
              <span class="block font-medium tabular-nums text-ink-gray-9">{{ fmt(e.total[m.key], m) }}</span>
              <span class="block whitespace-nowrap text-[11px] tabular-nums">
                <template v-if="diff(e.total[m.key], section.mh.total[m.key], m)">
                  <span :class="diff(e.total[m.key], section.mh.total[m.key], m).tone">MH {{ diff(e.total[m.key], section.mh.total[m.key], m).text }}</span>
                </template>
                <template v-if="!teams && diff(e.total[m.key], section.teamAvg[e.team]?.[m.key], m)">
                  <span class="text-ink-gray-4"> · </span><span :class="diff(e.total[m.key], section.teamAvg[e.team]?.[m.key], m).tone" :title="`${e.team} average: ${fmt(section.teamAvg[e.team]?.[m.key], m)}`">team {{ diff(e.total[m.key], section.teamAvg[e.team]?.[m.key], m).text }}</span>
                </template>
              </span>
            </td>
            <td class="py-2 pl-3 text-right align-top tabular-nums text-ink-gray-6">{{ fmt(section.mh.total[m.key], m) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
