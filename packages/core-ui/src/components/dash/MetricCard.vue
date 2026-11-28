<script setup>
// One dashboard card (docs/DASHBOARD_SPEC.md): a title with its (i) definition, then its figures in one of these
// layouts. Every number is a button that opens exactly the records behind it (§2.3).
//   figures - a few numbers as tiles (an icon, the change vs the previous period, status colours per §2.5)
//   steps   - a path from left to right (first call to deal), each step's share of the step before it
//   bars    - ranked bars, one per group (outcome, product, template, source ...); the count opens that group
//   donut   - a share of a whole with a few parts (DonutChart)
//   columns - a column chart, e.g. calls per day (ColumnChart)
//   heatmap - weekday × hour, coloured by connect rate or by calls (HeatmapChart)
//   gauge   - a rate against its target (GaugeChart)
//   table   - one row per person, A–Z, no sorting by numbers, totals at the bottom (§2.4)
//   list    - a short list of records
//   actions - "Focus today": things to act on (ActionList)
//   effort  - every IS as a dot, calls a day against a result, in four groups (EffortChart)
//   choice  - one of a few views picked with a switch (e.g. WhatsApp / Email); a view can have its own filter
// Design review 27 Nov 2026: soft 14px cards, a 15px title with an optional icon and a website / status badge, the
// numbers large with proportional digits, the charts per the data-viz mark specs (dash/theme.css).
import { ref, computed } from 'vue'
import ActionList from './ActionList.vue'
import ColumnChart from './ColumnChart.vue'
import BarList from './BarList.vue'
import DonutChart from './DonutChart.vue'
import TableCell from './TableCell.vue'
import EffortChart from './EffortChart.vue'
import HeatmapChart from './HeatmapChart.vue'
import GaugeChart from './GaugeChart.vue'
import { Tooltip, TextInput } from 'frappe-ui'
import { inrShort, fmtTalk } from '../../format.js'
import { cat } from '../../dash/tones.js'
const props = defineProps({ card: { type: Object, required: true }, caption: String })
const emit = defineEmits(['open', 'scope'])
const pickIx = ref(props.card.choice ?? 0)
// people lists: search by name or employee ID
const q = ref('')
const hit = (x) => { const t = q.value.toLowerCase().trim(); return !t || `${x.name} ${x.code || ''}`.toLowerCase().includes(t) }
const tableRows = computed(() => (props.card.rows || []).filter(hit))
// people tables grouped by team (200+ people): a team row with its totals, folded by default; a search opens them
const openTeams = ref(new Set())
const toggleTeam = (g) => { const s = new Set(openTeams.value); s.has(g) ? s.delete(g) : s.add(g); openTeams.value = s }
const teamBlocks = computed(() => {
  if (!props.card.grouped) return null
  const by = new Map(); for (const r of tableRows.value) { if (!by.has(r.group)) by.set(r.group, []); by.get(r.group).push(r) }
  return [...by.entries()].map(([g, rows]) => ({ g, rows, open: !!q.value.trim() || openTeams.value.has(g) || by.size === 1, total: props.card.groupTotals?.[g] }))
})
// each team keeps its colour (its place among the card's teams, which come in a fixed order); Management is grey
const teamOrder = computed(() => [...new Set((props.card.rows || []).map((r) => r.group))].filter((g) => g !== 'Management'))
const teamColor = (g) => (g === 'Management' ? 'var(--viz-axis)' : cat(Math.max(0, teamOrder.value.indexOf(g))))
// percentage cells drawn with a small bar, scaled to the largest value of the column (so 0.5% vs 5% is visible)
const colMax = (key) => Math.max(0.0001, ...(props.card.rows || []).map((r) => Number(r.cells[key]?.value) || 0))
// older cards give a bar's note as sub / subTone
const barItems = (l) => (l || []).map((it) => ({ ...it, note: it.note ?? it.sub, noteTone: it.noteTone ?? it.subTone, display: it.fmt && it.fmt !== 'n' ? show(it.value, it.fmt) : it.display }))
const variantIx = ref(0)
function pickChoice(i) { pickIx.value = i; variantIx.value = 0 }
const chosen = computed(() => {
  if (props.card.kind !== 'choice') return null
  const c = props.card.choices[pickIx.value]
  return c.variants ? { ...c, items: c.variants[variantIx.value]?.items || [] } : c
})
// table headers grouped two levels deep (e.g. Calling | Prospects | Investors)
const groups = computed(() => { const g = []; for (const c of props.card.columns || []) { const l = g[g.length - 1]; if (l && l.label === (c.group || '')) l.span++; else g.push({ label: c.group || '', span: 1 }) } return g.some((x) => x.label) ? g : null })
const firstOfGroup = (c, i) => i > 0 && (props.card.columns[i - 1].group || '') !== (c.group || '')

function show(v, fmt) {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '–'
  if (fmt === 'pct') return `${v}%`
  if (fmt === 'time') return fmtTalk(v)
  if (fmt === 'money') return v ? inrShort(v) : '₹0'
  if (fmt === 'text') return v
  return typeof v === 'number' ? v.toLocaleString('en-IN') : v
}
const TONE = { green: 'text-ink-green-7', amber: 'text-ink-amber-7', red: 'text-ink-red-6' }
const ICON_STYLE = { amber: { background: 'var(--viz-warn-wash)', color: 'var(--viz-warn)' }, red: { background: 'var(--viz-crit-wash)', color: 'var(--viz-crit)' } }
const iconStyle = (it) => ICON_STYLE[it.tone] || (it.site === 'I' ? { background: 'var(--viz-i-wash)', color: 'var(--viz-i)' } : it.site === 'P' ? { background: 'var(--viz-p-wash)', color: 'var(--viz-p)' } : { background: 'var(--viz-accent-wash)', color: 'var(--viz-accent)' })
const SITE = { P: { label: 'Prospect DMS', color: 'var(--viz-p)' }, I: { label: 'Investor DMS', color: 'var(--viz-i)' } }
const good = (it) => (it.delta == null || it.delta === 0 ? null : (it.delta > 0) !== !!it.bad)
const clickable = (it) => !!(it?.drill && it.drill.some((d) => d.count && d.to))
function open(it, e) { if (clickable(it)) emit('open', it.drill, e) }
const tid = (it, i) => `dash-${props.card.key}-${it.key ?? i}`
// steps: the ratio to the step before (a card can switch it off with ratios: false)
// only between steps that count the same thing (records → records, deals → deals): people and deals do not divide
const ratio = (i) => { const pa = props.card.items[i - 1]; const pb = props.card.items[i]; if (!pa?.unit || pa.unit !== pb?.unit) return null; const a = Number(pa.value); const b = Number(pb.value); return a && !Number.isNaN(b) ? Math.round((b / a) * 1000) / 10 : null }
</script>
<template>
  <section class="dash-card flex min-w-0 flex-col border bg-surface-base" :data-testid="`dash-card-${card.key}`">
    <header class="flex items-start justify-between gap-2 px-5 pt-4">
      <div class="min-w-0">
        <h3 class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-ink-gray-9">
          <span v-if="card.icon" class="flex size-6 items-center justify-center rounded-md" style="background: var(--viz-accent-wash); color: var(--viz-accent)"><span :class="card.icon" class="size-3.5" /></span>{{ card.title }}
          <span v-if="card.count != null" class="rounded-full bg-surface-gray-2 px-1.5 text-xs font-medium tabular-nums text-ink-gray-7">{{ card.count }}</span>
          <span v-if="card.site" class="inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10.5px] font-medium text-ink-gray-6"><span class="size-1.5 rounded-full" :style="{ background: SITE[card.site].color }" />{{ SITE[card.site].label }}</span>
          <span v-if="card.badge" class="rounded-full bg-surface-gray-2 px-2 py-px text-[10.5px] font-medium text-ink-gray-6">{{ card.badge }}</span>
        </h3>
        <p v-if="card.sub" class="mt-0.5 text-xs text-ink-gray-5">{{ card.sub }}</p>
      </div>
      <Tooltip v-if="card.info" :text="card.info" placement="top">
        <button type="button" class="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-gray-4 hover:bg-surface-gray-2 hover:text-ink-gray-8" :aria-label="`About: ${card.info}`" data-testid="dash-info">
          <span class="lucide-info size-4" />
        </button>
      </Tooltip>
    </header>

    <div class="min-h-0 flex-1 px-5 pb-5 pt-3" :class="card.kind === 'actions' && 'dms-scroll overflow-y-auto'">
      <ActionList v-if="card.kind === 'actions'" :items="card.items" @open="(d, e) => emit('open', d, e)" />
      <EffortChart v-else-if="card.kind === 'effort'" :card="card" @scope="(id) => emit('scope', id)" />
      <ColumnChart v-else-if="card.kind === 'columns'" :columns="card.columns" :legend="card.legend || []" :height="card.height || 150" :unit="card.unit || ''" :avg="!!card.avg" :per="card.per || 'day'" @open="(d, e) => emit('open', d, e)" />
      <HeatmapChart v-else-if="card.kind === 'heatmap'" :card="card" @open="(d, e) => emit('open', d, e)" />
      <GaugeChart v-else-if="card.kind === 'gauge'" :card="card" @open="(d, e) => emit('open', d, e)" />
      <template v-else-if="card.kind === 'choice'">
        <div class="mb-4 inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-gray-2 p-0.5" role="tablist">
          <button v-for="(c, i) in card.choices" :key="c.label" type="button" role="tab" :aria-selected="pickIx === i" class="whitespace-nowrap rounded-md px-3 py-1 text-xs"
            :class="pickIx === i ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`dash-choice-${card.key}-${i}`" @click="pickChoice(i)">{{ c.label }}</button>
        </div>
        <div v-if="card.choices[pickIx].variants" class="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
          <button v-for="(v, i) in card.choices[pickIx].variants" :key="v.label" type="button" role="tab" :aria-selected="variantIx === i" class="rounded-full border px-2.5 py-0.5 text-xs"
            :class="variantIx === i ? 'border-outline-gray-4 bg-surface-gray-2 font-medium text-ink-gray-9' : 'text-ink-gray-6 hover:bg-surface-gray-1'" :data-testid="`dash-variant-${card.key}-${i}`" @click="variantIx = i">{{ v.label }}</button>
        </div>
        <BarList v-if="chosen.kind === 'bars'" :items="barItems(chosen.items)" :legend="chosen.legend || []" :empty="chosen.empty" :tone="chosen.tone" @open="(d, e) => emit('open', d, e)" />
        <DonutChart v-else-if="chosen.kind === 'donut'" :slices="chosen.items" :caption="chosen.caption" :empty="chosen.empty" @open="(d, e) => emit('open', d, e)" />
        <div v-else class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${Math.min(chosen.items.length, card.cols || 3)}, minmax(0, 1fr))` }">
          <component :is="clickable(it) ? 'button' : 'div'" v-for="(it, i) in chosen.items" :key="it.key ?? i" type="button" class="min-w-0 rounded-xl bg-surface-gray-1 px-3 py-2.5 text-left" :class="clickable(it) && 'hover:bg-surface-gray-2'"
            :data-testid="tid(it, i)" :data-count="clickable(it) ? it.listCount ?? it.value : undefined" @click="open(it, $event)">
            <div class="text-xs leading-tight text-ink-gray-6">{{ it.label }}</div>
            <div class="dash-num mt-1 text-xl font-semibold text-ink-gray-9" data-value>{{ show(it.value, it.fmt) }}</div>
            <div v-if="it.sub" class="truncate text-xs text-ink-gray-5">{{ it.sub }}</div>
          </component>
        </div>
      </template>
      <!-- steps: a path from left to right; the coloured edge says which website a step is in; between two steps, the
           second's share of the first (counts in the period, not the same people) -->
      <ol v-else-if="card.kind === 'steps'" class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:gap-x-11 lg:[grid-template-columns:repeat(var(--steps),minmax(0,1fr))]" :style="{ '--steps': card.items.length }">
        <li v-for="(it, i) in card.items" :key="it.key" class="relative min-w-0">
          <component :is="clickable(it) ? 'button' : 'div'" type="button" class="group relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface-base px-4 pb-3.5 pt-4 text-left transition-all"
            :class="clickable(it) && 'hover:-translate-y-0.5 hover:border-outline-gray-3 hover:shadow-md'" :data-testid="tid(it, i)" :data-count="clickable(it) ? it.listCount ?? it.value : undefined" @click="open(it, $event)">
            <span class="absolute inset-x-0 top-0 h-[3px]" :style="{ background: SITE[it.site]?.color || 'var(--viz-accent)' }" aria-hidden="true" />
            <span class="flex items-center gap-2 text-xs font-medium text-ink-gray-6">
              <span class="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white" :style="{ background: SITE[it.site]?.color || 'var(--viz-accent)' }">{{ i + 1 }}</span>{{ it.label }}
            </span>
            <span class="dash-num mt-2 text-[26px] font-semibold leading-none text-ink-gray-9" data-value>{{ show(it.value, it.fmt) }}</span>
            <span v-if="it.sub" class="mt-1 truncate text-xs text-ink-gray-5" :title="it.sub">{{ it.sub }}</span>
            <span v-if="clickable(it)" class="mt-3 flex items-center gap-1 text-[11px] font-medium text-ink-gray-5 transition-colors group-hover:text-ink-gray-9">Open list<span class="lucide-arrow-right size-3 transition-transform group-hover:translate-x-0.5" /></span>
          </component>
          <span v-if="card.ratios === false && i > 0" class="absolute -left-[22px] top-1/2 z-[1] hidden -translate-x-1/2 -translate-y-1/2 text-ink-gray-4 lg:block" aria-hidden="true"><span class="lucide-chevron-right size-4" /></span>
          <span v-if="card.ratios !== false && i > 0 && ratio(i) != null" class="absolute -left-[22px] top-1/2 z-[1] hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center text-[10px] font-semibold tabular-nums text-ink-gray-7 lg:flex" :title="`${it.label}: ${ratio(i)}% of ${card.items[i - 1].label}`"><span class="lucide-arrow-right size-3.5 text-ink-gray-4" /><span class="rounded-full border bg-surface-base px-1.5 py-px shadow-sm">{{ ratio(i) >= 100 ? '≥100' : ratio(i) }}%</span></span>
        </li>
      </ol>
      <!-- figures: number tiles -->
      <div v-else-if="card.kind === 'figures'" class="grid gap-2.5" :style="{ gridTemplateColumns: `repeat(${Math.min(card.items.length, card.cols || 3)}, minmax(0, 1fr))` }">
        <component :is="clickable(it) ? 'button' : 'div'" v-for="(it, i) in card.items" :key="it.key ?? i" type="button"
          class="group relative min-w-0 overflow-hidden rounded-xl bg-surface-gray-1 px-3.5 py-3 text-left transition-colors" :class="clickable(it) && 'hover:bg-surface-gray-2'"
          :data-testid="tid(it, i)" :data-count="clickable(it) && (!it.fmt || it.fmt === 'n') ? it.listCount ?? it.value : undefined" :data-tone="it.tone || undefined" @click="open(it, $event)">
          <span v-if="it.tone === 'amber' || it.tone === 'red'" class="absolute inset-y-0 left-0 w-[3px]" :style="{ background: it.tone === 'red' ? 'var(--viz-crit)' : 'var(--viz-warn)' }" aria-hidden="true" />
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs leading-snug text-ink-gray-6">{{ it.label }}</span>
            <span v-if="it.icon" class="flex size-6 shrink-0 items-center justify-center rounded-md" :style="iconStyle(it)"><span :class="it.icon" class="size-3.5" /></span>
          </div>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5">
            <span class="dash-num text-2xl font-semibold" :class="TONE[it.tone] || 'text-ink-gray-9'" data-value>{{ show(it.value, it.fmt) }}</span>
            <span v-if="it.delta != null" class="flex items-center gap-0.5 text-xs font-medium tabular-nums" :title="caption"
              :class="good(it) === null ? 'text-ink-gray-5' : good(it) ? 'text-ink-green-7' : 'text-ink-red-6'">
              <span :class="it.delta > 0 ? 'lucide-arrow-up' : it.delta < 0 ? 'lucide-arrow-down' : 'lucide-minus'" class="size-3" />{{ Math.abs(it.delta) }}%
            </span>
          </div>
          <div v-if="it.sub" class="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-gray-5"><span v-if="it.site" class="size-1.5 shrink-0 rounded-full" :style="{ background: SITE[it.site].color }" />{{ it.sub }}</div>
        </component>
      </div>

      <!-- bars -->
      <TextInput v-if="card.kind === 'bars' && card.searchable && card.items.length > 6" v-model="q" class="mb-3 sm:w-72" placeholder="Search name or employee ID" data-testid="dash-search"><template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template></TextInput>
      <div v-if="card.kind === 'bars'" :class="card.scroll && 'dms-scroll -mr-2 max-h-72 overflow-y-auto pr-2'">
        <BarList :items="barItems(card.items.filter((it) => hit({ name: it.label, code: it.code })))" :legend="card.legend || []" :empty="card.empty" :tone="card.tone" @open="(d, e) => emit('open', d, e)" />
      </div>
      <!-- donut -->
      <DonutChart v-else-if="card.kind === 'donut'" :slices="card.items" :caption="card.caption" :empty="card.empty" @open="(d, e) => emit('open', d, e)" />

      <!-- list of records -->
      <div v-else-if="card.kind === 'list'" class="divide-y">
        <p v-if="!card.items.length" class="py-3 text-center text-sm text-ink-gray-5">{{ card.empty || 'Nothing to show.' }}</p>
        <button v-for="(it, i) in card.items" :key="it.key ?? i" type="button" class="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:bg-surface-gray-1"
          :data-testid="tid(it, i)" @click="open(it, $event)">
          <span class="min-w-0"><span class="block truncate text-ink-gray-8">{{ it.label }}</span><span v-if="it.sub" class="block truncate text-xs text-ink-gray-5">{{ it.sub }}</span></span>
          <span class="shrink-0 font-semibold tabular-nums" :class="TONE[it.tone] || 'text-ink-gray-9'" :data-tone="it.tone || undefined">{{ show(it.value, it.fmt) }}</span>
        </button>
      </div>

      <!-- team table: A–Z, no numeric sorting, totals -->
      <TextInput v-if="card.kind === 'table' && card.searchable && card.rows.length > 4" v-model="q" class="mb-3 sm:w-72" placeholder="Search name or employee ID" data-testid="dash-search"><template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template></TextInput>
      <div v-if="card.kind === 'table'" class="dms-scroll -mx-5 overflow-x-auto">
        <p v-if="!tableRows.length" class="px-5 py-3 text-center text-sm text-ink-gray-5">{{ q ? 'Nobody matches.' : card.empty || 'Nobody in this view.' }}</p>
        <table v-else class="w-full text-sm" data-testid="dash-team-table">
          <thead>
            <tr v-if="groups" class="text-[11px]"><th class="sticky left-0 bg-surface-base" /><th v-for="(g, gi) in groups" :key="gi" :colspan="g.span" class="px-2 pb-1 pt-1 text-center font-semibold uppercase tracking-wide text-ink-gray-6" :class="g.label && 'border-l'"><span v-if="g.label" class="border-b-2 px-2 pb-0.5" style="border-color: var(--viz-accent-soft)">{{ g.label }}</span></th></tr>
            <tr class="border-b text-[11px] text-ink-gray-5">
              <th class="sticky left-0 bg-surface-base px-5 py-2 text-left font-medium uppercase tracking-wide">Name</th>
              <th v-for="(c, ci) in card.columns" :key="c.key" class="whitespace-nowrap px-2.5 py-2 text-right font-medium" :class="firstOfGroup(c, ci) && 'border-l'"><Tooltip v-if="c.hint" :text="c.hint" placement="top"><span class="cursor-help border-b border-dashed border-outline-gray-3">{{ c.label }}</span></Tooltip><template v-else>{{ c.label }}</template></th>
            </tr>
          </thead>
          <tbody>
            <template v-if="teamBlocks">
              <template v-for="b in teamBlocks" :key="b.g">
                <tr class="border-b bg-surface-gray-1/70 hover:bg-surface-gray-2" data-testid="dash-team-group">
                  <td class="sticky left-0 bg-surface-gray-1 px-5 py-2">
                    <button type="button" class="flex items-center gap-2 text-left font-semibold text-ink-gray-9" :aria-expanded="b.open" @click="toggleTeam(b.g)">
                      <span :class="b.open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 text-ink-gray-5" />
                      <span class="flex size-5 items-center justify-center rounded-md text-[10px] font-bold text-white" :style="{ background: teamColor(b.g) }">{{ b.g[0] }}</span>{{ b.g }}<span class="rounded-full bg-surface-base px-1.5 text-[11px] font-medium text-ink-gray-5">{{ b.rows.length }}</span>
                    </button>
                  </td>
                  <td v-for="(c, ci) in card.columns" :key="c.key" class="whitespace-nowrap px-2.5 py-2 text-right tabular-nums" :class="firstOfGroup(c, ci) && 'border-l'"><TableCell v-if="b.total" :cell="b.total[c.key]" :fmt="c.fmt" :max="colMax(c.key)" strong @open="(d, e) => emit('open', d, e)" /></td>
                </tr>
                <template v-if="b.open">
                  <tr v-for="r in b.rows" :key="r.id" class="border-b last:border-b-0 hover:bg-surface-gray-1" data-testid="dash-team-row">
                    <td class="sticky left-0 bg-surface-base py-2 pl-12 pr-4">
                      <button type="button" class="text-left font-medium text-ink-gray-8 hover:underline" :title="`Show the dashboard for ${r.name}`" data-testid="dash-team-name" @click="emit('scope', r.id)">{{ r.name }}</button>
                      <span v-if="r.code" class="block text-[11px] text-ink-gray-5">{{ r.code }}</span>
                    </td>
                    <td v-for="(c, ci) in card.columns" :key="c.key" class="whitespace-nowrap px-2.5 py-2 text-right tabular-nums" :class="firstOfGroup(c, ci) && 'border-l'"><TableCell :cell="r.cells[c.key]" :fmt="c.fmt" :max="colMax(c.key)" :bar="c.bar" @open="(d, e) => emit('open', d, e)" /></td>
                  </tr>
                </template>
              </template>
            </template>
            <template v-else>
              <tr v-for="r in tableRows" :key="r.id" class="border-b last:border-b-0 hover:bg-surface-gray-1" data-testid="dash-team-row">
                <td class="sticky left-0 bg-surface-base px-5 py-2">
                  <span v-if="r.noScope" class="font-medium text-ink-gray-8">{{ r.name }}</span>
                  <button v-else type="button" class="text-left font-medium text-ink-gray-8 hover:underline" :title="`Show the dashboard for ${r.name}`" data-testid="dash-team-name" @click="emit('scope', r.id)">{{ r.name }}</button>
                  <span v-if="r.code || r.role" class="block text-[11px] text-ink-gray-5">{{ r.code || r.role }}</span>
                </td>
                <td v-for="(c, ci) in card.columns" :key="c.key" class="whitespace-nowrap px-2.5 py-2 text-right tabular-nums" :class="firstOfGroup(c, ci) && 'border-l'"><TableCell :cell="r.cells[c.key]" :fmt="c.fmt" :max="colMax(c.key)" :bar="c.bar" @open="(d, e) => emit('open', d, e)" /></td>
              </tr>
            </template>
          </tbody>
          <tfoot v-if="card.total && !q"><tr class="border-t-2 bg-surface-gray-1/60 font-semibold" data-testid="dash-team-total">
            <td class="sticky left-0 bg-surface-gray-1 px-5 py-2.5 text-ink-gray-9">Total</td>
            <td v-for="(c, ci) in card.columns" :key="c.key" class="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums" :class="firstOfGroup(c, ci) && 'border-l'">
              <button v-if="clickable(card.total[c.key])" type="button" class="rounded px-1 hover:bg-surface-gray-2" :class="TONE[card.total[c.key].tone] || 'text-ink-gray-9'" @click="open(card.total[c.key], $event)">{{ show(card.total[c.key].value, c.fmt) }}</button>
              <span v-else :class="TONE[card.total[c.key]?.tone]">{{ show(card.total[c.key]?.value, c.fmt) }}</span>
            </td>
          </tr></tfoot>
        </table>
      </div>
      <p v-if="card.note" class="mt-2 text-xs text-ink-gray-5">{{ card.note }}</p>
    </div>
  </section>
</template>
