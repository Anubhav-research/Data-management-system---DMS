<script setup>
// Prospect DMS dashboard (product owner, 21 Nov 2026): one page for every level - an advisor sees their own work, a
// team leader and above their teams (one team or one person on request), Admin everything. Read top to bottom:
//   1. headline numbers with the change against the same days of the period before, and a daily trend
//   2. what needs doing now  |  calls per day
//   3. pipeline (where records stand, how many moved this period)  |  records going cold
//   4. how calls end  |  best time to call
//   5. sources  |  messages and documents
//   6. team (team leaders and above; no ranking, by name)
//   7. Analyse: build your own chart
// Every number, bar and row opens the list showing exactly those records ("From Dashboard: ..." on top of the list).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button, FormControl, Popover, TextInput } from 'frappe-ui'
import { BarChart, HeatmapChart } from 'frappe-ui/charts'
import { useDb } from '@/stores/db'
import { isAdmin, isSupervisor } from '@/services/access'
import * as D from '@/services/dashboard'
import PageHeader from '@/components/PageHeader.vue'
import DashCard from '@mh/core-ui/components/dash/DashCard.vue'
import KpiCard from '@mh/core-ui/components/dash/KpiCard.vue'
import AnalyseCard from '@/components/dashboard/AnalyseCard.vue'

const db = useDb(); const router = useRouter()
const KEY = 'pdms-dash-filters'
const f = ref((() => { try { return { range: 'This month', from: '', to: '', scope: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { range: 'This month', from: '', to: '', scope: '' } } })())
const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(f.value)) } catch {} }
const p = computed(() => D.periodOf(f.value))
const prev = computed(() => D.previousOf(f.value, p.value))
const users = computed(() => D.scopeUsers(f.value.scope))
const lead = computed(() => isSupervisor() || isAdmin())
const scopeOpts = computed(() => D.scopeOptions())
const scopeLabel = computed(() => scopeOpts.value.find((o) => o.value === f.value.scope)?.label || scopeOpts.value[0].label)
// who to look at: searchable, because a company has 150+ advisors
const scopeQ = ref('')
const scopeList = computed(() => {
  const q = scopeQ.value.toLowerCase().trim(); const hit = (o) => !q || o.label.toLowerCase().includes(q)
  return [['', scopeOpts.value.filter((o) => !o.group && hit(o))], ['Teams', scopeOpts.value.filter((o) => o.group === 'Teams' && hit(o))], ['People', scopeOpts.value.filter((o) => o.group === 'People' && hit(o))]].filter(([, l]) => l.length)
})
function pickScope(v, close) { f.value.scope = v; remember(); scopeQ.value = ''; close?.() }
const fmtD = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const periodLabel = computed(() => (f.value.range === 'Today' ? 'Today' : `${fmtD(p.value.from)} – ${fmtD(Math.min(p.value.to, Date.now()) - 1)}`))
const hello = computed(() => { const h = new Date().getHours(); return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${db.me?.name?.split(' ')[0] || ''}` })
function setRange(r) { f.value.range = r; remember() }

// numbers
const kpis = computed(() => D.headline(p.value, prev.value, users.value))
const todo = computed(() => D.attention(users.value))
const daily = computed(() => D.callsByDay(p.value, users.value))
const pipe = computed(() => D.funnel(p.value, users.value))
const pipeMax = computed(() => Math.max(1, ...pipe.value.map((s) => s.count)))
const cold = computed(() => D.ageing(users.value))
const ends = computed(() => D.outcomes(p.value, users.value))
const hours = computed(() => D.bestHours(users.value))
const srcs = computed(() => D.sources(users.value))
const srcMax = computed(() => Math.max(1, ...srcs.value.map((s) => s.total)))
const eng = computed(() => D.engagement(p.value, users.value))
const team = computed(() => (lead.value ? D.teamTable(p.value, users.value) : []))
const hs = computed(() => (isAdmin() ? D.handoverStatus(p.value) : null))
const AGE_DOT = ['bg-surface-green-7', 'bg-surface-amber-5', 'bg-surface-orange-6', 'bg-surface-red-7', 'bg-surface-gray-6'] // 0-30, 31-60, 61-90, over 90, never

// team table sort (no ranking: by name unless the reader sorts a column)
const sort = ref({ key: 'name', dir: 1 })
const teamRows = computed(() => [...team.value].sort((a, b) => { const k = sort.value.key; const x = a[k] ?? -1; const y = b[k] ?? -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.value.dir }))
const sortBy = (k) => { sort.value = sort.value.key === k ? { key: k, dir: -sort.value.dir } : { key: k, dir: k === 'name' ? 1 : -1 } }
const COLS = [['calls', 'Calls'], ['connect', 'Connected'], ['talk', 'Talk time'], ['followups', 'Followups'], ['overdue', 'Overdue'], ['leads', 'New Leads'], ['conv', 'Converted']]
// team table grouped by team (150+ advisors): team rows with totals, opened to their people; search opens matches
const teamQ = ref(''); const opened = ref([])
const teamGroups = computed(() => {
  const q = teamQ.value.toLowerCase().trim(); const by = new Map()
  for (const r of teamRows.value) { if (q && !r.name.toLowerCase().includes(q)) continue; if (!by.has(r.team)) by.set(r.team, []); by.get(r.team).push(r) }
  const tot = (l) => { const s = (k) => l.reduce((t, r) => t + (r[k] || 0), 0); const calls = s('calls'); return { calls, connect: calls ? Math.round((s('connected') / calls) * 1000) / 10 : null, talk: s('talk'), followups: s('followups'), overdue: s('overdue'), leads: s('leads'), conv: s('conv') } }
  return [...by.entries()].map(([team, list]) => ({ team, list, tot: tot(list) })).sort((a, b) => (a.team === 'Management' ? 1 : b.team === 'Management' ? -1 : a.team.localeCompare(b.team)))
})
const isOpen = (t) => !!teamQ.value.trim() || opened.value.includes(t)
const toggle = (t) => { opened.value = opened.value.includes(t) ? opened.value.filter((x) => x !== t) : [...opened.value, t] }
const allOpen = computed(() => teamGroups.value.every((g) => isOpen(g.team)))
const toggleAll = () => { opened.value = allOpen.value ? [] : teamGroups.value.map((g) => g.team) }
const fmtTalk = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m` }

// drill-down: one place -> go there; several (Prospects and Leads) -> choose
const menu = ref({ open: false, items: [], x: 0, y: 0, title: '' })
function openDrill(drill, e) {
  const list = (drill || []).filter((d) => d.count)
  if (!list.length) return
  if (list.length === 1) return router.push(list[0].to)
  const r = e?.currentTarget?.getBoundingClientRect?.()
  menu.value = { open: true, items: list, x: r ? r.left : 200, y: r ? r.bottom + 4 : 200 }
}
const TONE = { red: 'bg-surface-red-1 text-ink-red-6', amber: 'bg-surface-amber-1 text-ink-amber-7', green: 'bg-surface-green-1 text-ink-green-7', blue: 'bg-surface-blue-1 text-ink-blue-6', violet: 'bg-surface-violet-1 text-ink-violet-6' }
const fmtDay = (k) => new Date(`${k}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
</script>
<template>
  <div class="flex h-full flex-col" @pointerdown="menu.open = false">
    <PageHeader :crumbs="[{ label: 'Dashboard' }]" />
    <div class="dms-scroll flex-1 overflow-y-auto bg-dms-page">
      <!-- greeting + period + scope -->
      <div class="sticky top-0 z-10 border-b bg-dms-page px-5 py-3" data-testid="dash-filters">
        <div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3">
          <div class="mr-auto min-w-0">
            <h1 class="text-lg font-semibold text-ink-gray-9">{{ hello }}</h1>
            <p class="text-sm text-ink-gray-5">{{ periodLabel }} · {{ scopeLabel }} · changes shown {{ prev.caption }}</p>
          </div>
          <div class="flex rounded-4 bg-surface-gray-2 p-0.5" role="tablist" aria-label="Period">
            <button v-for="r in D.RANGES" :key="r" type="button" role="tab" :aria-selected="f.range === r" class="rounded-[5px] px-2.5 py-1 text-sm"
              :class="f.range === r ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`dash-range-${r}`" @click="setRange(r)">{{ r }}</button>
          </div>
          <template v-if="f.range === 'Custom'">
            <div class="w-36"><FormControl v-model="f.from" type="date" @update:model-value="remember" /></div>
            <span class="text-ink-gray-5">to</span>
            <div class="w-36"><FormControl v-model="f.to" type="date" @update:model-value="remember" /></div>
          </template>
          <Popover v-if="lead" placement="bottom-end">
            <template #trigger><Button icon-left="lucide-users" icon-right="lucide-chevron-down" :label="scopeLabel" data-testid="dash-scope" /></template>
            <template #default="{ close }">
              <div class="w-72 p-1.5" data-testid="dash-scope-menu">
                <TextInput v-model="scopeQ" placeholder="Find a team or person" autofocus class="mb-1" />
                <div class="dms-scroll max-h-80 overflow-y-auto">
                  <div v-for="[g, l] in scopeList" :key="g">
                    <div v-if="g" class="px-2 pb-1 pt-2 text-xs font-medium text-ink-gray-5">{{ g }}</div>
                    <button v-for="o in l" :key="o.value" type="button" class="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2" @click="pickScope(o.value, close)">
                      <span :class="o.group === 'People' ? 'lucide-user' : 'lucide-users'" class="size-4 shrink-0 text-ink-gray-5" /><span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
                      <span v-if="o.sub" class="text-xs text-ink-gray-5">{{ o.sub }}</span><span v-if="f.scope === o.value" class="lucide-check size-4 text-ink-gray-6" />
                    </button>
                  </div>
                  <p v-if="!scopeList.length" class="px-2 py-3 text-sm text-ink-gray-5">Nobody matches.</p>
                </div>
              </div>
            </template>
          </Popover>
        </div>
      </div>

      <div class="mx-auto max-w-[1400px] space-y-4 p-5">
        <!-- 1. headline numbers -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard v-for="k in kpis" :key="k.key" :item="k" :caption="prev.caption" @open="(it, ev) => openDrill(it.drill, ev)" />
        </div>

        <!-- 2. what needs doing | calls per day -->
        <div class="grid gap-4 lg:grid-cols-3">
          <DashCard title="Needs attention" sub="Right now, whatever the period" :pad="false" testid="dash-attention">
            <ul class="pb-2">
              <li v-for="t in todo" :key="t.key">
                <button type="button" class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-gray-1 disabled:cursor-default disabled:hover:bg-transparent" :disabled="!t.count" :data-testid="`todo-${t.key}`" @click.stop="openDrill(t.drill, $event)">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-full" :class="t.count ? TONE[t.tone] : 'bg-surface-gray-1 text-ink-gray-4'"><span :class="t.icon" class="size-4" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm" :class="t.count ? 'font-medium text-ink-gray-9' : 'text-ink-gray-6'">{{ t.label }}</span>
                    <span class="block truncate text-xs text-ink-gray-5">{{ t.hint }}</span>
                  </span>
                  <span class="text-lg font-semibold tabular-nums" :class="t.count ? 'text-ink-gray-9' : 'text-ink-gray-4'">{{ t.count }}</span>
                  <span class="lucide-chevron-right size-4" :class="t.count ? 'text-ink-gray-5' : 'text-transparent'" />
                </button>
              </li>
            </ul>
          </DashCard>
          <DashCard class="lg:col-span-2" title="Calls per day" :sub="`${daily.total} calls · outgoing connected, outgoing not connected and incoming · click a bar for its calls`" testid="dash-calls-chart">
            <div class="h-72">
              <BarChart v-if="daily.total" :data="daily.rows" x="date" :y="['Connected', 'Not connected', 'Incoming']" stacked :x-axis="{ type: 'time' }"
                :series-config="{ Connected: { color: '#30a66d' }, 'Not connected': { color: '#d1d5db' }, Incoming: { color: '#6b8ef5' } }" @select="(e) => openDrill(D.drillCalls(daily.ids[`${e.row.date}|${e.name}`] || [], `${e.name} calls · ${fmtDay(e.row.date)}`))" />
              <div v-else class="flex h-full items-center justify-center text-sm text-ink-gray-5">No calls in this period.</div>
            </div>
          </DashCard>
        </div>

        <!-- 3. pipeline | going cold -->
        <div class="grid gap-4 lg:grid-cols-3">
          <DashCard class="lg:col-span-2" title="Pipeline" :sub="`Records at each stage now · moved in: ${periodLabel}`" testid="dash-pipeline">
            <div class="space-y-2">
              <div v-for="s in pipe" :key="s.stage" class="grid grid-cols-[120px_1fr_auto] items-center gap-3">
                <span class="text-sm text-ink-gray-7">{{ s.label }}</span>
                <router-link :to="s.to" class="group relative h-9 rounded-4 bg-surface-gray-1" :data-testid="s.testid">
                  <span class="absolute inset-y-0 left-0 rounded-4 bg-surface-blue-2 transition-colors group-hover:bg-surface-blue-3" :style="{ width: `${Math.max(2, (s.count / pipeMax) * 100)}%` }" />
                  <span class="relative flex h-full items-center px-3 text-base font-semibold tabular-nums text-ink-gray-9" data-value>{{ s.count.toLocaleString('en-IN') }}</span>
                </router-link>
                <button v-if="s.moved != null" type="button" class="w-32 text-right text-xs disabled:cursor-default" :class="s.moved ? 'text-ink-green-7 hover:underline' : 'text-ink-gray-4'" :disabled="!s.moved" :title="`Moved to ${s.label} in this period`" @click.stop="openDrill(s.movedDrill, $event)">
                  <span class="lucide-arrow-down-right mr-0.5 inline-block size-3 align-[-1px]" />{{ s.moved }} moved in
                </button>
                <span v-else class="w-32" />
              </div>
            </div>
            <div v-if="hs" class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-ink-gray-6">
              <span class="font-medium text-ink-gray-7">Handovers to Investor DMS</span>
              <span data-testid="dash-h-delivered"><b class="font-semibold text-ink-gray-9" data-value>{{ hs.Delivered }}</b> delivered</span>
              <span data-testid="dash-h-pending"><b class="font-semibold text-ink-gray-9" data-value>{{ hs.Pending }}</b> waiting</span>
              <span data-testid="dash-h-failed" :class="hs.Failed && 'text-ink-red-7'"><b class="font-semibold" :class="hs.Failed ? 'text-ink-red-7' : 'text-ink-gray-9'" data-value>{{ hs.Failed }}</b> failed</span>
            </div>
          </DashCard>
          <DashCard title="Going cold" sub="Days since the last call" testid="dash-cold">
            <div class="space-y-4">
              <div v-for="st in cold" :key="st.stage">
                <div class="mb-1.5 flex justify-between text-sm"><span class="text-ink-gray-7">{{ st.label }}</span><span class="tabular-nums text-ink-gray-5">{{ st.total }}</span></div>
                <div class="flex h-3 overflow-hidden rounded-full bg-surface-gray-2">
                  <button v-for="(b, i) in st.buckets" v-show="b.count" :key="b.label" type="button" class="h-full transition-opacity hover:opacity-80" :class="AGE_DOT[i]" :style="{ width: `${(b.count / (st.total || 1)) * 100}%` }" :title="`${b.label}: ${b.count}`" @click.stop="openDrill(D.drillClients(b.ids, `${st.label} · last call ${b.label.toLowerCase()}`), $event)" />
                </div>
              </div>
              <ul class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-gray-6">
                <li v-for="(b, i) in D.AGE_BUCKETS" :key="b[0]" class="flex items-center gap-1.5"><span class="size-2 rounded-full" :class="AGE_DOT[i]" />{{ b[0] }}</li>
              </ul>
            </div>
          </DashCard>
        </div>

        <!-- 4. how calls end | best time to call -->
        <div class="grid gap-4 lg:grid-cols-2">
          <DashCard title="How calls end" :sub="`${periodLabel} · click a bar for its calls`" testid="dash-outcomes">
            <div class="h-64">
              <BarChart v-if="ends.length" :data="ends" x="outcome" :y="['calls']" horizontal show-data-labels @select="(e) => openDrill(D.drillCalls(e.row.ids, `Calls: ${e.row.outcome} · ${periodLabel}`))" />
              <div v-else class="flex h-full items-center justify-center text-sm text-ink-gray-5">No calls in this period.</div>
            </div>
          </DashCard>
          <DashCard title="Best time to call" :sub="`Share of outgoing calls that connected · last 90 days · ${hours.total} calls`" testid="dash-hours">
            <div class="h-64">
              <HeatmapChart v-if="hours.any" :data="hours.rows" x="hour" y="day" value="rate" :format="(v) => `${v}%`" :min="0" :max="100" @select="(e) => e.row.calls && openDrill(D.drillCalls(e.row.ids, `Calls on ${e.row.day} at ${e.row.hour}`))" />
              <div v-else class="flex h-full items-center justify-center text-sm text-ink-gray-5">Not enough calls yet.</div>
            </div>
          </DashCard>
        </div>

        <!-- 5. sources | messages -->
        <div class="grid gap-4 lg:grid-cols-2">
          <DashCard title="Sources" sub="All records by where they came from, and how many became Investor Family" :pad="false" testid="dash-sources">
            <div class="dms-scroll max-h-80 overflow-y-auto">
              <table class="w-full text-sm tabular-nums">
                <thead class="sticky top-0 bg-surface-base text-xs text-ink-gray-5"><tr class="border-b"><th class="px-4 py-2 text-left font-medium">Source</th><th class="py-2 text-left font-medium">Records</th><th class="px-2 py-2 text-right font-medium">Leads</th><th class="px-2 py-2 text-right font-medium">Investors</th><th class="px-4 py-2 text-right font-medium">Converted</th></tr></thead>
                <tbody>
                  <tr v-for="s in srcs" :key="s.source" class="cursor-pointer border-b last:border-b-0 hover:bg-surface-gray-1" @click.stop="openDrill(D.drillClients(s.all, `Source: ${s.source}`), $event)">
                    <td class="px-4 py-2 text-ink-gray-8">{{ s.source }}</td>
                    <td class="w-40 py-2"><div class="flex items-center gap-2"><span class="h-1.5 flex-1 rounded-full bg-surface-gray-2"><span class="block h-full rounded-full bg-surface-blue-5" :style="{ width: `${(s.total / srcMax) * 100}%` }" /></span><span class="w-8 text-right text-ink-gray-8">{{ s.total }}</span></div></td>
                    <td class="px-2 py-2 text-right text-ink-gray-7">{{ s.leads.length }}</td>
                    <td class="px-2 py-2 text-right text-ink-gray-7">{{ s.investors.length }}</td>
                    <td class="px-4 py-2 text-right font-medium" :class="s.conv ? 'text-ink-green-7' : 'text-ink-gray-4'">{{ s.conv == null ? '–' : `${s.conv}%` }}</td>
                  </tr>
                  <tr v-if="!srcs.length"><td colspan="5" class="px-4 py-8 text-center text-ink-gray-5">No records yet.</td></tr>
                </tbody>
              </table>
            </div>
          </DashCard>
          <DashCard title="Messages and documents" :sub="periodLabel" testid="dash-engagement">
            <div class="grid grid-cols-2 gap-3">
              <button v-for="[k, l, icon, ch] in [['wa', 'WhatsApp', 'icon-whatsapp', 'wa'], ['em', 'Email', 'lucide-mail', 'email']]" :key="k" type="button" class="rounded-6 border p-3 text-left hover:bg-surface-gray-1" @click.stop="openDrill(D.drillMessages(ch, eng[k].sent.map((m) => m.id), `${l} sent · ${periodLabel}`), $event)">
                <div class="flex items-center gap-1.5 text-sm text-ink-gray-6"><span :class="icon" class="size-4" />{{ l }}</div>
                <div class="mt-1 text-2xl font-semibold tabular-nums text-ink-gray-9">{{ eng[k].sent.length }}<span class="ml-1 text-sm font-normal text-ink-gray-5">sent</span></div>
                <div class="mt-0.5 text-xs text-ink-gray-5">{{ eng[k].got.length }} replies · {{ eng[k].rate == null ? 'no one messaged' : `${eng[k].rate}% of clients replied` }}</div>
              </button>
            </div>
            <div class="mt-4">
              <div class="mb-1.5 text-xs font-medium text-ink-gray-6">Documents sent most</div>
              <ul v-if="eng.docs.length" class="space-y-1">
                <li v-for="d in eng.docs" :key="d.name" class="flex items-center gap-2 text-sm"><span class="lucide-file-text size-4 shrink-0 text-ink-gray-5" /><span class="min-w-0 flex-1 truncate text-ink-gray-8">{{ d.name }}</span><span class="tabular-nums text-ink-gray-6">{{ d.n }}×</span></li>
              </ul>
              <p v-else class="text-sm text-ink-gray-5">No documents sent in this period.</p>
            </div>
          </DashCard>
        </div>

        <!-- 6. team (team leaders and above): one row per team, opened to its people; search finds anyone -->
        <DashCard v-if="lead && teamRows.length" title="Team" :sub="`${periodLabel} · ${teamGroups.length > 1 ? 'open a team to see its people · ' : ''}click a name to see only them`" :pad="false" testid="dash-team">
          <template #actions>
            <TextInput v-model="teamQ" class="w-52" placeholder="Find a person" data-testid="team-search">
              <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
            </TextInput>
            <Button v-if="teamGroups.length > 1" variant="ghost" :label="allOpen ? 'Close all' : 'Open all'" @click="toggleAll" />
          </template>
          <div class="dms-scroll max-h-[600px] overflow-auto">
            <table class="w-full text-sm tabular-nums">
              <thead class="sticky top-0 z-[1] bg-surface-base text-xs text-ink-gray-5">
                <tr class="border-b">
                  <th class="px-4 py-2 text-left font-medium"><button type="button" class="hover:text-ink-gray-8" @click="sortBy('name')">Name<span v-if="sort.key === 'name'" :class="sort.dir > 0 ? 'lucide-arrow-up' : 'lucide-arrow-down'" class="ml-0.5 inline-block size-3" /></button></th>
                  <th v-for="[k, l] in COLS" :key="k" class="px-3 py-2 text-right font-medium"><button type="button" class="hover:text-ink-gray-8" @click="sortBy(k)">{{ l }}<span v-if="sort.key === k" :class="sort.dir > 0 ? 'lucide-arrow-up' : 'lucide-arrow-down'" class="ml-0.5 inline-block size-3" /></button></th>
                </tr>
              </thead>
              <tbody v-for="grp in teamGroups" :key="grp.team">
                <!-- team summary (only when there is more than one team) -->
                <tr v-if="teamGroups.length > 1" class="cursor-pointer border-b bg-surface-gray-1 hover:bg-surface-gray-2" data-testid="team-group" @click="toggle(grp.team)">
                  <td class="px-4 py-2">
                    <span class="flex items-center gap-1.5">
                      <span :class="isOpen(grp.team) ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4 text-ink-gray-5" />
                      <span class="font-medium text-ink-gray-9">{{ grp.team }}</span>
                      <span class="text-xs text-ink-gray-5">{{ grp.list.length }} {{ grp.list.length === 1 ? 'person' : 'people' }}</span>
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right font-medium text-ink-gray-9">{{ grp.tot.calls }}</td>
                  <td class="px-3 py-2 text-right font-medium text-ink-gray-8">{{ grp.tot.connect == null ? '–' : `${grp.tot.connect}%` }}</td>
                  <td class="px-3 py-2 text-right font-medium text-ink-gray-8">{{ grp.tot.talk ? fmtTalk(grp.tot.talk) : '–' }}</td>
                  <td class="px-3 py-2 text-right font-medium text-ink-gray-8">{{ grp.tot.followups }}</td>
                  <td class="px-3 py-2 text-right font-medium" :class="grp.tot.overdue ? 'text-ink-red-7' : 'text-ink-gray-4'">{{ grp.tot.overdue }}</td>
                  <td class="px-3 py-2 text-right font-medium text-ink-gray-8">{{ grp.tot.leads }}</td>
                  <td class="px-3 py-2 text-right font-medium" :class="grp.tot.conv ? 'text-ink-green-7' : 'text-ink-gray-4'">{{ grp.tot.conv }}</td>
                </tr>
                <template v-if="teamGroups.length === 1 || isOpen(grp.team)">
                  <tr v-for="r in grp.list" :key="r.id" class="border-b hover:bg-surface-gray-1" data-testid="team-row">
                    <td class="py-2 pr-4" :class="teamGroups.length > 1 ? 'pl-10' : 'pl-4'"><button type="button" class="text-left hover:underline" @click="f.scope = `user:${r.id}`; remember()"><span class="text-ink-gray-9">{{ r.name }}</span> <span class="text-xs text-ink-gray-5">{{ r.role }}</span></button></td>
                    <td class="px-3 py-2 text-right"><button type="button" class="text-ink-gray-8 hover:underline disabled:no-underline" :disabled="!r.calls" @click.stop="openDrill(D.drillCalls(r.callIds, `Calls by ${r.name} · ${periodLabel}`), $event)">{{ r.calls }}</button></td>
                    <td class="px-3 py-2 text-right text-ink-gray-7">{{ r.connect == null ? '–' : `${r.connect}%` }}</td>
                    <td class="px-3 py-2 text-right text-ink-gray-7">{{ r.talk ? fmtTalk(r.talk) : '–' }}</td>
                    <td class="px-3 py-2 text-right text-ink-gray-7">{{ r.followups }}</td>
                    <td class="px-3 py-2 text-right"><button type="button" class="hover:underline disabled:no-underline" :class="r.overdue ? 'font-medium text-ink-red-7' : 'text-ink-gray-4'" :disabled="!r.overdue" @click.stop="openDrill(r.overdueDrill, $event)">{{ r.overdue }}</button></td>
                    <td class="px-3 py-2 text-right text-ink-gray-7">{{ r.leads }}</td>
                    <td class="px-3 py-2 text-right" :class="r.conv ? 'font-medium text-ink-green-7' : 'text-ink-gray-4'">{{ r.conv }}</td>
                  </tr>
                </template>
              </tbody>
              <tbody v-if="!teamGroups.length"><tr><td :colspan="COLS.length + 1" class="px-4 py-8 text-center text-ink-gray-5">Nobody matches "{{ teamQ }}".</td></tr></tbody>
            </table>
          </div>
        </DashCard>

        <!-- 7. build your own -->
        <AnalyseCard :period="p" :users="users" :period-label="periodLabel" @drill="(d) => openDrill(d)" />
      </div>
    </div>

    <!-- choose where to open, when the records sit in more than one section -->
    <div v-if="menu.open" class="fixed z-50 w-56 rounded-6 border bg-surface-base p-1 shadow-lg" :style="{ left: `${Math.min(menu.x, 1200)}px`, top: `${menu.y}px` }" data-testid="dash-drill-menu" @pointerdown.stop>
      <div class="px-2 py-1 text-xs text-ink-gray-5">Open in</div>
      <button v-for="it in menu.items" :key="it.label" type="button" class="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm text-ink-gray-8 hover:bg-surface-gray-2" @click="router.push(it.to); menu.open = false">{{ it.label }}<span class="tabular-nums text-ink-gray-5">{{ it.count }}</span></button>
    </div>
  </div>
</template>
