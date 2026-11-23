<script setup>
// One Market Update table, read by the team. Two ways to look at the prices table (product owner left the design to
// us, 19 Nov 2026):
//   Today   - CMP, previous close, change and change % (for calls: "what did the market do today?")
//   Returns - 1D ... 15Y as a heat map, green up / red down, deeper for bigger moves ("how has it done?")
// Tables without both kinds of columns (FII / DII) always show every column. The name column stays fixed when the
// table scrolls sideways. A figure older than the update shows a small clock ("as of 17 Nov"); Admin sees each
// row's source on hover (from the automation's run log). A figure the automation did not bring this time keeps the last
// one, faded with a clock ("as of 20 Nov", r.old; 21 Nov 2026).
import { computed } from 'vue'
import { Tooltip } from 'frappe-ui'
import { cell, isPct, isAuto, inputColumns } from './market.js'

const props = defineProps({
  table: { type: Object, required: true },
  view: { type: String, default: 'today' }, // today | returns
  find: { type: String, default: '' },
  day: { type: String, default: '' }, // YYYY-MM-DD of the update, to flag older figures
  admin: Boolean,
  anchor: { type: String, default: '' }, // id prefix for the group chips
})
const t = computed(() => props.table)
const twoViews = computed(() => t.value.columns.some((c) => c.group) && t.value.columns.some((c) => !c.group))
const cols = computed(() => {
  const all = t.value.columns
  if (!twoViews.value) return all
  if (props.view === 'returns') { const first = all.find((c) => c.type === 'num'); return all.filter((c) => c.group || c === first) }
  return all.filter((c) => !c.group || c.type === 'chgpct')
})
const label = (c) => (props.view === 'today' && twoViews.value && c.type === 'chgpct' ? 'Change %' : c.label)
// group heading row: runs of columns under the same group
// first heading row: a group spans its columns; a column without a group spans both heading rows
const groups = computed(() => {
  if (twoViews.value && props.view === 'today') return []
  const out = []
  for (const c of cols.value) {
    const last = out[out.length - 1]
    if (c.group && last?.name === c.group) last.span++
    else out.push(c.group ? { name: c.group, span: 1 } : { col: c })
  }
  return out.some((g) => g.name) ? out : []
})
const words = computed(() => props.find.toLowerCase().split(/\s+/).filter(Boolean))
const sections = computed(() => t.value.sections.map((s) => ({ ...s, rows: words.value.length ? s.rows.filter((r) => words.value.every((w) => `${r.name} ${s.name}`.toLowerCase().includes(w))) : s.rows })).filter((s) => s.rows.length))
const heatOn = computed(() => props.view === 'returns' || !twoViews.value)
function heat(c, v) {
  if (!heatOn.value || !isPct(c) || v == null || !twoViews.value) return ''
  const a = Math.abs(v); const up = v > 0
  return a >= 15 ? (up ? 'bg-surface-green-3' : 'bg-surface-red-3') : a >= 5 ? (up ? 'bg-surface-green-2' : 'bg-surface-red-2') : a > 0 ? (up ? 'bg-surface-green-1' : 'bg-surface-red-1') : ''
}
const compact = computed(() => twoViews.value && props.view === 'today')
// whole row not updated this time: one clock on the name (instead of one per figure)
const allOld = (r) => { const ks = inputColumns(t.value).map((c) => c.key).filter((k) => r.v?.[k] != null && r.v[k] !== ''); return ks.length > 0 && ks.every((k) => r.old?.[k]) }
const rowDay = (r) => (allOld(r) ? Object.values(r.old).sort()[0] : r.asOf)
const stale = (r) => allOld(r) || (r.asOf && props.day && r.asOf < props.day && !r.old)
const fmtDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const sticky = 'sticky left-0 z-[1]'
// day a carried figure is from ('' = fresh); a worked-out column is old when a figure it uses is
const oldOf = (r, c) => (isAuto(c) ? (c.of || []).map((k) => r.old?.[k]).filter(Boolean).sort()[0] : r.old?.[c.key]) || ''
</script>
<template>
  <section class="space-y-1.5">
    <h3 v-if="t.title" class="text-base font-semibold text-ink-gray-8">{{ t.title }}</h3>
    <div class="dms-scroll overflow-x-auto rounded-6 border" :class="compact && 'max-w-[860px]'" data-testid="market-table">
      <table class="w-full border-separate border-spacing-0 text-base tabular-nums">
        <thead class="text-xs text-ink-gray-5">
          <tr v-if="groups.length">
            <th :rowspan="2" :class="sticky" class="min-w-[200px] border-b bg-surface-gray-1 px-4 py-2 text-left align-bottom font-medium uppercase tracking-wide">{{ t.firstLabel }}</th>
            <template v-for="(g, i) in groups" :key="i">
              <th v-if="g.col" rowspan="2" class="whitespace-nowrap border-b bg-surface-gray-1 px-3 py-2 text-right align-bottom font-medium uppercase tracking-wide">{{ label(g.col) }}</th>
              <th v-else :colspan="g.span" class="border-l bg-surface-gray-1 px-3 pt-2 text-center font-medium uppercase tracking-wide">{{ g.name }}</th>
            </template>
          </tr>
          <tr>
            <th v-if="!groups.length" :class="sticky" class="min-w-[200px] border-b bg-surface-gray-1 px-4 py-2 text-left font-medium uppercase tracking-wide">{{ t.firstLabel }}</th>
            <template v-for="(c, i) in cols" :key="c.key">
              <th v-if="!groups.length || c.group" class="whitespace-nowrap border-b bg-surface-gray-1 px-3 py-2 text-right font-medium"
                :class="[groups.length && (i === 0 || c.group !== cols[i - 1].group) ? 'border-l' : '', !groups.length && 'uppercase tracking-wide']">{{ label(c) }}</th>
            </template>
          </tr>
        </thead>
        <tbody v-for="(s, si) in sections" :key="si">
          <tr v-if="s.name" :id="anchor ? `${anchor}-${si}` : undefined" class="scroll-mt-28">
            <td :class="sticky" class="border-b bg-surface-gray-1 px-4 pb-1.5 pt-3 text-sm font-semibold text-ink-gray-8">{{ s.name }}</td>
            <td :colspan="cols.length" class="border-b bg-surface-gray-1" />
          </tr>
          <tr v-for="(r, ri) in s.rows" :key="ri" class="group" data-testid="market-row">
            <td :class="sticky" class="border-b bg-surface-base px-4 py-2 text-ink-gray-8 group-hover:bg-surface-gray-1">
              <div class="flex items-center gap-1.5">
                <Tooltip v-if="admin && r.src" :text="`Source: ${r.src}${r.asOf ? ` · ${fmtDay(r.asOf)}` : ''}`"><span class="truncate">{{ r.name }}</span></Tooltip>
                <span v-else class="truncate">{{ r.name }}</span>
                <Tooltip v-if="stale(r)" :text="allOld(r) ? `Not updated this time: figures as of ${fmtDay(rowDay(r))}` : `Figure as of ${fmtDay(r.asOf)}`"><span class="lucide-clock size-3.5 shrink-0 text-ink-amber-6" data-testid="market-stale" /></Tooltip>
              </div>
            </td>
            <td v-for="c in cols" :key="c.key" class="whitespace-nowrap border-b py-2 text-right group-hover:bg-surface-gray-1"
              :class="[cell(r, c).cls, compact ? 'px-4' : 'px-2.5', c.type === 'num' && c === cols[0] ? 'font-medium text-ink-gray-9' : '', c.type === 'diff' && 'font-medium', heat(c, cell(r, c).v), oldOf(r, c) && 'opacity-60']" :title="oldOf(r, c) ? `Not updated this time: figure as of ${fmtDay(oldOf(r, c))}` : undefined" :data-old="oldOf(r, c) || undefined"><span v-if="oldOf(r, c) && cell(r, c).text && !allOld(r)" class="lucide-clock mr-1 inline-block size-3 align-[-1px] text-ink-amber-6" /><span v-if="compact && c.type === 'chgpct' && cell(r, c).v" class="rounded px-1.5 py-0.5 font-medium" :class="cell(r, c).v > 0 ? 'bg-surface-green-1' : 'bg-surface-red-1'">{{ cell(r, c).text }}</span><template v-else>{{ cell(r, c).text || '–' }}</template></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!sections.length" class="px-4 py-6 text-center text-sm text-ink-gray-5">No row matches "{{ find }}".</p>
    </div>
    <p v-if="t.note" class="text-xs text-ink-gray-5">{{ t.note }}</p>
  </section>
</template>
