<script setup>
// Analyse (product owner, 21 Nov 2026: "analyse on multiple factors on a graph"): pick what to count, what to group it
// by and, optionally, a second factor to split it by; narrow it with filters; show it as bars, stacked bars, lines or a
// table. A click on any bar, point or cell opens the records behind it. Saved analyses stay in this browser.
import { ref, computed, watch } from 'vue'
import { Button, Dropdown, FormControl, Dialog, toast } from 'frappe-ui'
import { BarChart, LineChart } from 'frappe-ui/charts'
import DashCard from '@mh/core-ui/components/dash/DashCard.vue'
import { MEASURES, FACTORS, facts, groupFacts, drillFor } from '@/services/dashboard'

const props = defineProps({ period: Object, users: Array, periodLabel: String })
const emit = defineEmits(['drill'])

const STORE = 'pdms-dash-analyses'
const blank = () => ({ measure: 'calls', by: 'date', grain: 'day', split: '', chart: 'bar', top: 10, team: '', source: '', stage: '', language: '', advisor: '' })
const a = ref(blank())
const CHARTS = [['bar', 'Bars', 'lucide-chart-column'], ['stacked', 'Stacked', 'lucide-chart-column-stacked'], ['line', 'Lines', 'lucide-chart-line'], ['table', 'Table', 'lucide-table']]

const all = computed(() => facts(a.value.measure, props.period, props.users))
const distinct = (k) => [...new Set(all.value.map((f) => f[k]))].filter(Boolean).sort()
const FILTERS = [['team', 'Team'], ['advisor', 'IS'], ['source', 'Source'], ['stage', 'Stage'], ['language', 'Language']]
const filtered = computed(() => all.value.filter((f) => FILTERS.every(([k]) => !a.value[k] || f[k] === a.value[k])))
// with many people (150+ advisors) a chart draws only the biggest groups and splits; the rest sum into "Others". The table shows everything.
const SPLIT_MAX = 8
const g = computed(() => groupFacts(filtered.value, a.value.by, a.value.split, a.value.grain, a.value.chart === 'table' ? {} : { topX: Number(a.value.top) || 0, topS: SPLIT_MAX }))
const TOPS = [{ label: 'Top 10', value: 10 }, { label: 'Top 20', value: 20 }, { label: 'All', value: 0 }]
const horizontal = computed(() => a.value.by !== 'date' && g.value.rows.length > 8)
const chartH = computed(() => (horizontal.value ? Math.max(288, g.value.rows.length * 30 + 60) : 288))
const plural = (k) => ({ advisor: 'IS', team: 'teams', source: 'sources', stage: 'stages', outcome: 'outcomes', language: 'languages', direction: 'directions' }[k] || 'values')
const measure = computed(() => MEASURES.find((m) => m.value === a.value.measure))
const total = computed(() => Math.round(filtered.value.reduce((t, f) => t + f.value, 0) * 10) / 10)
const factorLabel = (v) => FACTORS.find((f) => f.value === v)?.label
const splitOptions = computed(() => [{ label: 'Nothing', value: '' }, ...FACTORS.filter((f) => f.value !== a.value.by && f.value !== 'date').map((f) => ({ label: f.label, value: f.value }))])
watch(() => a.value.by, (v) => { if (a.value.split === v) a.value.split = '' })
const fmtX = (x) => (a.value.by === 'date' ? new Date(`${x}T00:00:00`).toLocaleDateString('en-GB', a.value.grain === 'month' ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }) : x)
const label = (x, s) => `${measure.value.label}: ${a.value.by === 'date' ? fmtX(x) : x}${s && s !== 'Total' ? ` · ${s}` : ''} · ${props.periodLabel}`
function open(x, s) { const ids = g.value.ids[`${x}|${s}`] || []; if (ids.length) emit('drill', drillFor(a.value.measure, ids, label(x, s))) }
function onSelect(e) { open(e.row.x, e.name) }
const chartRows = computed(() => g.value.rows.map((r) => ({ ...r, x: r.x })))
const xAxis = computed(() => (a.value.by === 'date' ? { type: 'time' } : { type: 'category' }))

// saved analyses (this browser)
const saved = ref((() => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } })())
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved.value)) } catch {} }
const naming = ref({ open: false, name: '' })
function save() { naming.value = { open: true, name: `${measure.value.label} by ${factorLabel(a.value.by).toLowerCase()}${a.value.split ? ` and ${factorLabel(a.value.split).toLowerCase()}` : ''}` } }
function doSave() {
  const name = naming.value.name.trim(); if (!name) return
  saved.value = [...saved.value.filter((x) => x.name !== name), { name, a: { ...a.value } }]; persist(); naming.value.open = false; toast.success('Analysis saved')
}
const savedMenu = computed(() => [
  ...saved.value.map((s) => ({ label: s.name, icon: 'lucide-chart-column', onClick: () => { a.value = { ...blank(), ...s.a } } })),
  ...(saved.value.length ? [{ label: 'Delete all saved', icon: 'lucide-trash-2', theme: 'red', onClick: () => { saved.value = []; persist() } }] : []),
])
const sel = 'w-full'
</script>
<template>
  <DashCard title="Analyse" :sub="`Build your own chart · ${periodLabel} · click a bar to open its records`" testid="dash-analyse">
    <template #actions>
      <Dropdown v-if="saved.length" :options="savedMenu"><Button icon-left="lucide-bookmark" icon-right="lucide-chevron-down" label="Saved" /></Dropdown>
      <Button icon-left="lucide-bookmark-plus" label="Save" @click="save" />
      <Button variant="ghost" icon="lucide-rotate-ccw" title="Start again" @click="a = blank()" />
    </template>
    <div class="grid gap-3 md:grid-cols-[260px_1fr]">
      <!-- controls -->
      <div class="space-y-3 rounded-6 bg-surface-gray-1 p-3">
        <FormControl v-model="a.measure" type="select" label="Count" :options="MEASURES" :class="sel" data-testid="an-measure" />
        <div class="grid grid-cols-[1fr_auto] items-end gap-2">
          <FormControl v-model="a.by" type="select" label="Group by" :options="FACTORS" data-testid="an-by" />
          <FormControl v-if="a.by === 'date'" v-model="a.grain" type="select" :options="[{ label: 'Day', value: 'day' }, { label: 'Week', value: 'week' }, { label: 'Month', value: 'month' }]" />
        </div>
        <FormControl v-model="a.split" type="select" label="Split by" :options="splitOptions" data-testid="an-split" />
        <FormControl v-if="a.by !== 'date' && a.chart !== 'table'" v-model="a.top" type="select" label="Show" :options="TOPS" data-testid="an-top" />
        <div>
          <div class="mb-1.5 text-xs text-ink-gray-5">Show as</div>
          <div class="grid grid-cols-4 gap-1 rounded-4 bg-surface-gray-2 p-0.5">
            <button v-for="[v, l, i] in CHARTS" :key="v" type="button" :title="l" class="flex flex-col items-center gap-0.5 rounded-[5px] py-1 text-2xs" :class="a.chart === v ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" @click="a.chart = v"><span :class="i" class="size-4" />{{ l }}</button>
          </div>
        </div>
        <div class="border-t pt-3">
          <div class="mb-1.5 text-xs font-medium text-ink-gray-6">Only</div>
          <div class="space-y-2">
            <FormControl v-for="[k, l] in FILTERS" :key="k" v-model="a[k]" type="select" :options="[{ label: `Any ${l.toLowerCase()}`, value: '' }, ...distinct(k).map((v) => ({ label: v, value: v }))]" />
          </div>
        </div>
      </div>
      <!-- result -->
      <div class="min-w-0">
        <div class="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-gray-6">
          <span class="text-xl font-semibold tabular-nums text-ink-gray-9" data-testid="an-total">{{ total.toLocaleString('en-IN') }}</span>
          <span>{{ measure.unit }} · by {{ factorLabel(a.by).toLowerCase() }}<template v-if="a.split"> and {{ factorLabel(a.split).toLowerCase() }}</template></span>
        </div>
        <div v-if="!filtered.length" class="flex h-72 items-center justify-center rounded-6 border border-dashed text-sm text-ink-gray-5">Nothing to show for this period and these filters.</div>
        <div v-else-if="a.chart === 'table'" class="dms-scroll max-h-80 overflow-auto rounded-6 border">
          <table class="w-full text-sm tabular-nums">
            <thead class="sticky top-0 bg-surface-gray-1 text-xs text-ink-gray-5"><tr><th class="px-3 py-2 text-left font-medium">{{ factorLabel(a.by) }}</th><th v-for="s in g.series" :key="s" class="px-3 py-2 text-right font-medium">{{ s }}</th></tr></thead>
            <tbody>
              <tr v-for="r in g.rows" :key="r.x" class="border-t">
                <td class="px-3 py-1.5 text-ink-gray-8">{{ fmtX(r.x) }}</td>
                <td v-for="s in g.series" :key="s" class="px-3 py-1.5 text-right"><button v-if="r[s]" type="button" class="text-ink-blue-6 hover:underline" @click="open(r.x, s)">{{ r[s].toLocaleString('en-IN') }}</button><span v-else class="text-ink-gray-4">0</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="dms-scroll max-h-[560px] overflow-y-auto" data-testid="an-chart"><div :style="{ height: `${chartH}px` }">
          <LineChart v-if="a.chart === 'line'" :data="chartRows" x="x" :y="g.series" :x-axis="xAxis" show-data-points @select="onSelect" />
          <BarChart v-else :data="chartRows" x="x" :y="g.series" :x-axis="xAxis" :stacked="a.chart === 'stacked'" :horizontal="horizontal" @select="onSelect" />
        </div></div>
        <p v-if="filtered.length && a.chart !== 'table' && (g.hiddenX || g.hiddenS)" class="mt-1.5 text-xs text-ink-gray-5" data-testid="an-others">
          <template v-if="g.hiddenX">Showing the top {{ a.top }} {{ plural(a.by) }}; {{ g.hiddenX }} more are summed in "Others". </template>
          <template v-if="g.hiddenS">Split into the top {{ SPLIT_MAX }} {{ plural(a.split) }}; {{ g.hiddenS }} more are in "Others". </template>
          Switch to Table to see every one.
        </p>
      </div>
    </div>
    <Dialog v-model:open="naming.open" title="Save this analysis" size="sm">
      <FormControl v-model="naming.name" label="Name" placeholder="e.g. Referral calls by team" @keydown.enter="doSave" />
      <p class="mt-2 text-xs text-ink-gray-5">Saved in this browser. Open it again from "Saved".</p>
      <template #actions><div class="flex justify-end gap-2"><Button label="Cancel" @click="naming.open = false" /><Button variant="solid" label="Save" :disabled="!naming.name.trim()" @click="doSave" /></div></template>
    </Dialog>
  </DashCard>
</template>
