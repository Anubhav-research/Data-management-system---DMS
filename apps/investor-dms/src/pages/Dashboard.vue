<script setup>
// Investor DMS dashboard (docs/DASHBOARD_SPEC.md, version 3: product owner 27 Nov 2026). The page only keeps the filters
// and lays out what services/dashboard.js builds (business rules stay in services). Frame and cards: @mh/core-ui.
// A link from the Prospect DMS dashboard (its "Investor DMS" part) arrives as
//   #/dashboard?range=…&from=…&to=…&people=<employee IDs>|teams=<names>&open=<what was clicked>
// The same period and people are chosen here, then the list behind the number opens (this website's own access rules
// apply: someone outside the reader's view is simply not chosen).
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDb } from '@/stores/db'
import * as D from '@/services/dashboard'
import { DEFAULT_RANGE, RANGES } from '@mh/core-ui/dash/rules.js'
import { visibleUserIds } from '@/services/access'
import PageHeader from '@/components/PageHeader.vue'
import DashboardShell from '@mh/core-ui/components/dash/DashboardShell.vue'

const db = useDb()
const route = useRoute()
const router = useRouter()
// the period and person stay chosen when the reader comes back from a list (§2.3)
const KEY = 'idms-dash-v2'
const read = () => { try { return { range: DEFAULT_RANGE, from: '', to: '', scope: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { range: DEFAULT_RANGE, from: '', to: '', scope: '' } } }
const f = ref(read())
function change(v) { f.value = v; try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
const dash = computed(() => D.buildDashboard(f.value))
const opts = computed(() => D.scopeOptions())

/** The filters a Prospect DMS link asks for, in this website's terms. */
function fromLink(q) {
  const range = RANGES.includes(q.range) ? q.range : f.value.range
  const vis = visibleUserIds()
  let scope = ''
  if (q.people) {
    const ids = String(q.people).split(',').map((m) => db.users.find((u) => u.mhf_id === m)?.id).filter((id) => id && vis.includes(id))
    scope = ids.length === 1 ? `user:${ids[0]}` : ids.length ? `users:${ids.join(',')}` : ''
  } else if (q.teams) {
    const t = String(q.teams).split(',').filter(Boolean)
    scope = t.length === 1 ? `team:${t[0]}` : t.length ? `teams:${t.join(',')}` : ''
  }
  return { range, from: range === 'Custom' ? String(q.from || '') : '', to: range === 'Custom' ? String(q.to || '') : '', scope }
}
/** The figure a link names: a headline or to-do key ('won', 'dealsToday'), '<card>.<item key or label>', or '#<section>'. */
function findFigure(key) {
  const [card, item] = key.includes('.') ? key.split('.') : [null, key]
  for (const s of dash.value.sections) {
    if (!card && s.kind === 'overview') { const it = [...s.items, ...(s.side?.items || [])].find((x) => x.key === item); if (it) return it }
    for (const c of s.cards || []) if (c.key === card) { const it = (c.items || []).find((x) => String(x.key) === item || x.label === item); if (it) return it }
  }
  return null
}
onMounted(async () => {
  const q = route.query
  if (!q.range && !q.people && !q.teams && !q.open) return
  change(fromLink(q))
  const open = String(q.open || '')
  await router.replace({ path: route.path }) // the link is used once; the address is the plain dashboard again
  await nextTick()
  if (open.startsWith('#')) { setTimeout(() => document.querySelector(`[data-testid=dash-section-${open.slice(1)}]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); return }
  const links = (findFigure(open)?.drill || D.extraDrill(open, f.value) || []).filter((d) => d.count && d.to)
  if (links.length === 1) router.push(links[0].to)
})
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Dashboard' }]" />
    <DashboardShell :filters="f" :sections="dash.sections" :caption="dash.caption" :scope-options="opts" :requests="dash.requests" :show-scope="D.showScope()" :name="db.me?.name?.split(' ')[0]" :insights="dash.insights" accent="i" @change="change" />
  </div>
</template>
