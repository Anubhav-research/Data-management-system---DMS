<script setup>
// Prospect DMS dashboard (docs/DASHBOARD_SPEC.md, product owner 24 and 27 Nov 2026). The page keeps the filters, asks
// Investor DMS for the same people's numbers (flow F5) and lays out what services/dashboard.js builds (business rules
// stay in services). Frame and cards: @mh/core-ui.
import { ref, computed, watch } from 'vue'
import { useDb } from '@/stores/db'
import * as D from '@/services/dashboard'
import { fetchInvestorFigures, recentInvestorFigures } from '@/services/investorFigures'
import { DEFAULT_RANGE } from '@mh/core-ui/dash/rules.js'
import PageHeader from '@/components/PageHeader.vue'
import DashboardShell from '@mh/core-ui/components/dash/DashboardShell.vue'

const db = useDb()
// the period and person stay chosen when the reader comes back from a list (§2.3)
const KEY = 'pdms-dash-v2'
const read = () => { try { return { range: DEFAULT_RANGE, from: '', to: '', scope: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { range: DEFAULT_RANGE, from: '', to: '', scope: '' } } }
const f = ref(read())
function change(v) { f.value = v; try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }

// Investor DMS figures: asked again when the period or the people change (the latest answer wins). A recent answer
// for the very same request is shown at once (coming back from a list), then refreshed in the background.
const inv = ref({ state: 'loading' })
const req = computed(() => D.figuresRequest(f.value))
let seq = 0
/** The same figures (the time of the answer aside)? Building the dashboard again for Admin takes about two seconds. */
const sameNumbers = (a, b) => JSON.stringify({ ...a, asOf: 0 }) === JSON.stringify({ ...b, asOf: 0 })
watch(() => JSON.stringify(req.value), async () => {
  const n = ++seq
  const kept = recentInvestorFigures(req.value)
  inv.value = kept ? { state: 'ok', data: kept.data } : { state: 'loading' } // never the last period's numbers under a new period
  const r = await fetchInvestorFigures(req.value)
  if (kept && !r.ok && r.reason !== 'off') return // a failed background refresh keeps the recent numbers; Admin's off switch does not
  if (kept && r.ok && sameNumbers(kept.data, r.data)) return // nothing changed: no second build of the whole page
  if (n !== seq) return
  inv.value = r.ok ? { state: 'ok', data: r.data } : { state: r.reason, message: r.message }
}, { immediate: true })

const dash = computed(() => D.buildDashboard(f.value, inv.value))
const opts = computed(() => D.scopeOptions())
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Dashboard' }]" />
    <DashboardShell :filters="f" :sections="dash.sections" :caption="dash.caption" :scope-options="opts" :requests="dash.requests" :show-scope="D.showScope()" :name="db.me?.name?.split(' ')[0]" :insights="dash.insights" accent="p" @change="change" />
  </div>
</template>
