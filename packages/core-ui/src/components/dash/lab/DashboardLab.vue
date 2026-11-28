<script setup>
// The dashboard lab (#/dashboard-lab, Admin only, not in the sidebar; PROMPT_DASHBOARD_REDESIGN.md §2.4). Every
// dashboard component in every state, with the fixed sample data in fixtures.js, in light or dark and in either
// website's accent. Phase 0 shows today's components; each later phase swaps in the redesigned one under the same
// states, so the product owner reviews the design system without clicking through real data.
import { ref, onBeforeUnmount } from 'vue'
import MetricCard from '../MetricCard.vue'
import KpiStrip from '../KpiStrip.vue'
import '../../../dash/theme.css'
import * as F from './fixtures.js'

const props = defineProps({ accent: { type: String, default: 'p' } })
const acc = ref(props.accent)
// the theme switch here is for this page only: the reader's saved preference comes back when they leave
const html = document.documentElement
const saved = html.getAttribute('data-theme')
const theme = ref(saved || 'light')
function setTheme(t) { theme.value = t; html.setAttribute('data-theme', t) }
onBeforeUnmount(() => saved ? html.setAttribute('data-theme', saved) : html.removeAttribute('data-theme'))
const selected = ref({})
const groups = [
  { title: 'Rate against the 75% benchmark', list: F.gaugeStates },
  { title: 'Share of a whole', list: F.donutStates },
  { title: 'Breakdown bars', list: F.barStates },
  { title: 'Column chart (trend)', list: F.columnStates, wide: true },
  { title: 'Heat table', list: F.heatStates, wide: true },
  { title: 'Steps', list: F.stepStates, wide: true },
  { title: 'Figures', list: F.figureStates },
  { title: 'People table', list: F.tableStates, wide: true },
]
</script>
<template>
  <div class="dash-root dms-scroll h-full flex-1 overflow-y-auto bg-dms-page" :data-accent="acc" data-testid="dash-lab">
    <div class="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-dms-page px-6 py-3">
      <div class="mr-auto">
        <h1 class="text-lg font-semibold text-ink-gray-9">Dashboard lab</h1>
        <p class="text-xs text-ink-gray-6">Every dashboard component in every state, with fixed sample data. Phase 0: today's components, before the redesign.</p>
      </div>
      <div class="flex rounded-md border bg-surface-base text-xs">
        <button v-for="t in ['light', 'dark']" :key="t" type="button" class="px-3 py-1 capitalize" :class="theme === t ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'text-ink-gray-6'" :data-testid="`lab-theme-${t}`" @click="setTheme(t)">{{ t }}</button>
      </div>
      <div class="flex rounded-md border bg-surface-base text-xs">
        <button v-for="[k, l] in [['p', 'Prospect DMS accent'], ['i', 'Investor DMS accent']]" :key="k" type="button" class="px-3 py-1" :class="acc === k ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'text-ink-gray-6'" @click="acc = k">{{ l }}</button>
      </div>
    </div>

    <div class="mx-auto max-w-[1440px] space-y-10 px-6 py-6">
      <section>
        <h2 class="mb-3 text-[15px] font-semibold text-ink-gray-9">KPI row</h2>
        <div v-for="s in F.kpiStates" :key="s.state" class="mb-6">
          <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-gray-6">{{ s.state }}</p>
          <KpiStrip :items="s.items" caption="vs same days last month" :selected="selected[s.state] ?? s.items[0].key" @select="(k) => (selected = { ...selected, [s.state]: k })" />
        </div>
      </section>

      <section>
        <h2 class="mb-3 text-[15px] font-semibold text-ink-gray-9">Focus today</h2>
        <div class="grid gap-3 md:grid-cols-2">
          <div v-for="s in F.actionStates" :key="s.state">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-gray-6">{{ s.state }}</p>
            <MetricCard :card="{ key: `act-${s.state}`, title: 'Focus today', kind: 'actions', info: 'Sample', items: s.items }" />
          </div>
        </div>
      </section>

      <section v-for="g in groups" :key="g.title">
        <h2 class="mb-3 text-[15px] font-semibold text-ink-gray-9">{{ g.title }}</h2>
        <div class="grid gap-3" :class="g.wide ? 'grid-cols-1 xl:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-4'">
          <div v-for="s in g.list" :key="s.state" class="min-w-0">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-gray-6">{{ s.state }}</p>
            <MetricCard :card="{ info: 'Sample definition, one short line.', ...s.card }" caption="vs same days last month" />
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-3 text-[15px] font-semibold text-ink-gray-9">Page notices</h2>
        <div class="space-y-2">
          <div v-for="s in F.noticeStates" :key="s.state">
            <p class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-gray-6">{{ s.state }}</p>
            <div class="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm" :class="s.message.tone === 'amber' ? 'border-outline-amber-2 bg-surface-amber-1 text-ink-amber-8' : 'bg-surface-base text-ink-gray-6'">
              <span :class="s.message.icon" class="size-4 shrink-0" :data-spin="s.message.loading || undefined" />{{ s.message.text }}
            </div>
          </div>
        </div>
        <p class="mt-3 text-xs text-ink-gray-6">Not in today's components, to be added in the redesign: loading skeletons, an error state per card, and the Effort vs results and Compare charts with sample data (Phase 4).</p>
      </section>
    </div>
  </div>
</template>
