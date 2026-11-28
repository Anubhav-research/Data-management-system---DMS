<script setup>
// The dashboard page frame shared by both websites (docs/DASHBOARD_SPEC.md §2): greeting, period (default This
// month), person picker for TL and above, then the sections the website's services/dashboard.js built for this
// person and period. A click on any number opens the records behind it; when they sit in more than one list
// (Prospects and Leads) a small menu asks which.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, Popover, Tooltip, toast } from 'frappe-ui'
import { RANGES } from '../../dash/rules.js'
import MetricCard from './MetricCard.vue'
import KpiStrip from './KpiStrip.vue'
import CompareView from './CompareView.vue'
import '../../dash/theme.css'

const props = defineProps({
  filters: { type: Object, required: true }, // { range, from, to, scope }, kept by the page
  sections: { type: Array, default: () => [] },
  scopeOptions: { type: Array, default: () => [] },
  showScope: Boolean,
  caption: String, // e.g. "vs previous 30 days"
  name: String,
  // only for people who decide: { waiting: [{ id, label, type, lines, by, approved, days, tone, to }], decide(id, action) }.
  // Approval goes up one level at a time, so a request reaches a person only after everyone below them approved it.
  requests: { type: Object, default: null },
  // design review 27 Nov 2026: the website's accent ('p' Prospect blue, 'i' Investor aqua) and the highlights - a few
  // sentences the services write from the numbers ({ key, icon, tone: good | warn | bad | info, title, text, drill })
  accent: { type: String, default: 'p' },
  insights: { type: Array, default: null },
})
const emit = defineEmits(['change'])
const router = useRouter()
// short, still readable period labels (Stripe / Google Analytics style); the full name shows on hover and in the line
// under the greeting. Single letters (T, W, M) were avoided: T could be Today or Tuesday, M Month or Monday.
// Product owner 25 Nov 2026: market-chart style short labels (1D, WTD, MTD …); Custom is a calendar icon.
const SHORT = { Today: '1D', 'This week': 'WTD', 'This month': 'MTD', 'Last 30 days': '30D', 'Last 60 days': '60D', 'Last 90 days': '90D', Custom: '' }
// custom dates: edited in a small pop-up and applied together (nothing changes until Apply)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = iso(new Date())
const draft = ref({ from: '', to: '' })
const draftError = computed(() => (draft.value.from && draft.value.to && draft.value.from > draft.value.to ? 'The start date is after the end date.' : draft.value.to > today ? 'The end date cannot be in the future.' : ''))
const short = (s) => new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const customText = computed(() => (props.filters.from && props.filters.to ? `${short(props.filters.from)} – ${short(props.filters.to)}` : ''))
const set = (patch) => emit('change', { ...props.filters, ...patch })

// The person picker. Prospect DMS offers { kind, key, label, sub } choices: Everyone / My team, Me, the teams and the
// people, where several teams - or several people, never both - can be ticked to compare them (up to 5 people).
// A website that still offers the older { label, value, group } choices gets a plain one-choice list.
const multi = computed(() => props.scopeOptions.some((o) => o.kind))
const MAX_PEOPLE = 5
const sel = computed(() => {
  const m = String(props.filters.scope || '').match(/^(users?|teams?):(.+)$/)
  return m ? { kind: m[1].startsWith('user') ? 'user' : 'team', list: m[2].split(',').filter(Boolean) } : { kind: 'all', list: [] }
})
const optLabel = (kind, key) => props.scopeOptions.find((o) => o.kind === kind && o.key === key)?.label || key
const scopeLabel = computed(() => {
  if (!multi.value) return props.scopeOptions.find((o) => o.value === (props.filters.scope || ''))?.label || props.scopeOptions[0]?.label || ''
  const { kind, list } = sel.value
  if (kind === 'all') return props.scopeOptions[0]?.label || ''
  if (list.length === 1) return kind === 'user' && props.scopeOptions.find((o) => o.me)?.key === list[0] ? 'Me' : optLabel(kind, list[0])
  return `Comparing ${list.length} ${kind === 'team' ? 'teams' : 'people'}`
})
const q = ref('')
const hit = (o) => { const t = q.value.toLowerCase().trim(); return !t || o.label.toLowerCase().includes(t) || (o.sub || '').toLowerCase().includes(t) }
const scopeList = computed(() => {
  const groups = multi.value
    ? [['', props.scopeOptions.filter((o) => o.kind === 'all' || o.me)], ['Teams', props.scopeOptions.filter((o) => o.kind === 'team' && hit(o))], ['People', props.scopeOptions.filter((o) => o.kind === 'user' && !o.me && hit(o))]]
    : [['', props.scopeOptions.filter((o) => !o.group && hit(o))], ['Teams', props.scopeOptions.filter((o) => o.group === 'Teams' && hit(o))], ['People', props.scopeOptions.filter((o) => o.group === 'People' && hit(o))]]
  return groups.filter(([, l]) => l.length)
})
const ticked = (o) => sel.value.kind === o.kind && sel.value.list.includes(o.key)
const isCurrent = (o) => (o.kind === 'all' ? sel.value.kind === 'all' : o.me ? sel.value.kind === 'user' && sel.value.list.length === 1 && sel.value.list[0] === o.key : false)
/** Tick or untick a team or person; ticking one of the other kind starts a new choice (teams and people never mix).
 *  With "Me" chosen, ticking a person compares them with me. */
function toggle(o) {
  const same = sel.value.kind === o.kind ? sel.value.list : []
  let list = same.includes(o.key) ? same.filter((k) => k !== o.key) : [...same, o.key]
  if (o.kind === 'user' && list.length > MAX_PEOPLE) list = list.slice(-MAX_PEOPLE)
  const kind = o.kind === 'team' ? 'team' : 'user'
  set({ scope: !list.length ? '' : list.length === 1 ? `${kind}:${list[0]}` : `${kind}s:${list.join(',')}` })
}
const isAdminLabel = computed(() => `Back to ${(props.scopeOptions[0]?.label || 'everyone').toLowerCase()}`)
const full = (o) => o.kind === 'user' && sel.value.kind === 'user' && sel.value.list.length >= MAX_PEOPLE && !sel.value.list.includes(o.key)
function pick(v, close) { set({ scope: v }); q.value = ''; close?.() }
const chosen = computed(() => (sel.value.kind === 'all' ? [] : sel.value.list.map((key) => ({ kind: sel.value.kind, key, label: optLabel(sel.value.kind, key) }))))
/** Back to everyone (the × beside the picker, or removing the last chip). */
function clearScope() { set({ scope: '' }); q.value = '' }
function unpick(o) { toggle(o) }
// each named team keeps one colour; a person shows their initials
const TEAM_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d']
const teamColor = (key) => TEAM_COLORS[Math.max(0, props.scopeOptions.filter((o) => o.kind === 'team').findIndex((o) => o.key === key)) % TEAM_COLORS.length]
const initials = (name) => String(name).split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
// when two or more are chosen, the comparison (at the bottom of the page) comes into view
watch(() => props.filters.scope, async (v, was) => {
  const n = (x) => (String(x || '').match(/^(users|teams):(.+)$/)?.[2].split(',').filter(Boolean).length || 0)
  if (n(v) > 1 && n(v) !== n(was)) { await nextTick(); setTimeout(() => document.querySelector('[data-testid=dash-section-compare]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150) }
})
const hello = computed(() => { const h = new Date().getHours(); return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}${props.name ? `, ${props.name}` : ''}` })

// drill-down: one place -> go there; several -> choose
const menu = ref({ open: false, items: [], x: 0, y: 0 })
function open(drill, e) {
  const list = (drill || []).filter((d) => d.count)
  if (!list.length) return
  if (list.length === 1 && list[0].to) return go(list[0].to)
  const r = e?.currentTarget?.getBoundingClientRect?.()
  // open below the number, or above it when there is no room below (a number near the bottom of the screen)
  const h = 36 + list.length * 34
  const y = !r ? 200 : r.bottom + 4 + h <= window.innerHeight ? r.bottom + 4 : Math.max(8, r.top - 4 - h)
  menu.value = { open: true, items: list, x: r ? Math.max(8, Math.min(r.left, window.innerWidth - 240)) : 200, y }
}
/** A place in this website (router location) or in the other website ({ href }: opens in a new tab, where that
 *  website's own sign-in and access rules apply). */
function go(to) {
  if (to?.href) { window.open(to.href, '_blank', 'noopener'); return }
  return router.push(to)
}
// the requests pop-up: everything waiting for this person's decision, decided here one by one or all at once
const reqOpen = ref(false)
const confirmAll = ref(false)
const confirmReject = ref('')
/** Open a request on its record to see it in full; the pop-up closes first. */
async function goTo(to) { reqOpen.value = false; await router.push(to) }
function decide(r, action) {
  const res = props.requests.decide(r.id, action); confirmReject.value = ''
  if (res.ok) toast.success(`${r.label}: ${res.message}`); else toast.error(`${r.label}: ${res.message}`)
}
function approveAll() {
  let ok = 0; const failed = []
  for (const r of [...props.requests.waiting]) { const res = props.requests.decide(r.id, 'approve'); if (res.ok) ok++; else failed.push(`${r.label}: ${res.message}`) }
  confirmAll.value = false
  if (ok) toast.success(`${ok} request${ok === 1 ? '' : 's'} approved`)
  for (const f of failed) toast.error(f)
}
// the headline card shown in the big chart (the first card until another is chosen)
const metric = ref(null)
/** the big chart keeps one height that fits a laptop screen under the filters (product owner 28 Nov 2026); the Focus
 *  list beside it scrolls inside its card */
const trendHeight = () => 200
function trendCard(s) {
  const it = s.items.find((x) => x.key === metric.value) || s.items[0]
  return { key: 'trend', title: it.trend?.title || it.label, sub: it.trend?.sub, info: it.trend?.info, kind: 'columns', columns: it.trend?.columns || [], legend: it.trend?.legend || [], unit: it.trend?.unit || '', height: trendHeight(s), avg: true, per: it.trend?.per || 'day' }
}
// ---- the section navigator (sticky under the filters): one pill per section; the one in view is highlighted
const scroller = ref(null)
const NAV_ICON = { overview: 'lucide-layout-dashboard' }
const nav = computed(() => props.sections.filter((x) => x.title || x.kind === 'overview').map((x) => ({ key: x.key, label: x.title || 'Overview', icon: x.icon || NAV_ICON[x.key] || 'lucide-circle' })))
const current = ref('')
let raf = 0
let lockUntil = 0 // after a click on a pill, keep that pill lit while the page scrolls to it
function spy() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const el = scroller.value; if (!el || Date.now() < lockUntil) return
    // a section counts as "in view" once its top passes the bottom of the sticky filters (+ a little air)
    const top = (el.querySelector('[data-testid=dash-filters]')?.getBoundingClientRect().bottom ?? el.getBoundingClientRect().top) + 48
    let at = nav.value[0]?.key || ''
    for (const n of nav.value) { const sec = el.querySelector(`[data-testid=dash-section-${n.key}]`); if (sec && sec.getBoundingClientRect().top <= top) at = n.key }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) at = nav.value[nav.value.length - 1]?.key || at
    current.value = at
  })
}
function jump(key) {
  current.value = key; lockUntil = Date.now() + 900; setTimeout(spy, 950)
  scroller.value?.querySelector(`[data-testid=dash-section-${key}]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
onMounted(() => { scroller.value?.addEventListener('scroll', spy, { passive: true }); spy() })
onBeforeUnmount(() => scroller.value?.removeEventListener('scroll', spy))
watch(() => props.sections.length, () => nextTick(spy))
const INSIGHT = { good: { bg: 'var(--viz-accent-wash)', fg: 'var(--viz-good)' }, warn: { bg: 'var(--viz-warn-wash)', fg: 'var(--viz-warn)' }, bad: { bg: 'var(--viz-crit-wash)', fg: 'var(--viz-crit)' }, info: { bg: 'var(--viz-accent-wash)', fg: 'var(--viz-accent)' } }
const insightClickable = (x) => !!(x.drill && x.drill.some((d) => d.count && d.to))
function scopeTo(uid) { set({ scope: `user:${uid}` }); document.querySelector('[data-testid=dash-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' }) }
</script>
<template>
  <div ref="scroller" class="dash-root dms-scroll flex-1 overflow-y-auto bg-dms-page" :data-accent="accent" data-testid="dash-scroll" @pointerdown="menu.open = false">
    <!-- the filters: who and what on the left; period and person on the right; under them, the sections -->
    <div class="sticky top-0 z-20 border-b bg-dms-page px-5 pt-3" data-testid="dash-filters">
      <div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2">
        <div class="mr-auto min-w-0">
          <h1 class="text-lg font-semibold leading-tight tracking-tight text-ink-gray-9">{{ hello }}</h1>
          <p class="mt-0.5 text-xs text-ink-gray-5">{{ filters.range === 'Custom' && customText ? customText : filters.range }}<template v-if="showScope"> · {{ scopeLabel }}</template> · changes {{ caption }}</p>
        </div>
        <!-- period: short labels with an underline on the chosen one (market-chart style); full name on hover -->
        <div class="dms-scroll flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-gray-2 p-0.5" role="tablist" aria-label="Period">
          <template v-for="r in RANGES" :key="r">
            <Tooltip v-if="r !== 'Custom'" :text="r" placement="bottom">
              <button type="button" role="tab" :aria-selected="filters.range === r" :aria-label="r" class="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors"
                :class="filters.range === r ? 'bg-surface-base text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-9'" :data-testid="`dash-range-${r}`" @click="set({ range: r })">
                {{ SHORT[r] }}
              </button>
            </Tooltip>
            <!-- custom: a small pop-up with two dates (Salesforce style), applied together -->
            <Tooltip v-else :text="filters.range === 'Custom' && customText ? `Custom: ${customText}` : 'Custom dates'" placement="bottom">
            <Popover side="bottom" align="end" @open="draft = { from: filters.from || '', to: filters.to || '' }">
              <template #trigger>
                <button type="button" role="tab" :aria-selected="filters.range === r" aria-label="Custom dates" class="flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-medium transition-colors"
                  :class="filters.range === r ? 'bg-surface-base text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-9'" :data-testid="`dash-range-${r}`">
                  <span class="lucide-calendar-range size-3.5" /><span v-if="filters.range === r && customText" class="ml-1 tabular-nums">{{ customText }}</span>
                </button>
              </template>
              <template #default="{ close }">
                <div class="w-60 p-1" data-testid="dash-custom">
                  <p class="mb-2 text-sm font-semibold text-ink-gray-9">Custom range</p>
                  <label class="mb-1 block text-xs text-ink-gray-5">From</label>
                  <input v-model="draft.from" type="date" :max="draft.to || today" class="h-8 w-full rounded border-0 bg-surface-gray-2 px-2 text-base text-ink-gray-8 focus:bg-surface-white focus:ring-2 focus:ring-outline-gray-3" data-testid="dash-from" />
                  <label class="mb-1 mt-2 block text-xs text-ink-gray-5">To</label>
                  <input v-model="draft.to" type="date" :min="draft.from" :max="today" class="h-8 w-full rounded border-0 bg-surface-gray-2 px-2 text-base text-ink-gray-8 focus:bg-surface-white focus:ring-2 focus:ring-outline-gray-3" data-testid="dash-to" />
                  <p v-if="draftError" class="mt-2 text-xs text-ink-red-6">{{ draftError }}</p>
                  <div class="mt-3 flex justify-end gap-2">
                    <Button label="Cancel" @click="close()" />
                    <Button variant="solid" label="Apply" :disabled="!!draftError || !draft.from || !draft.to" data-testid="dash-custom-apply" @click="set({ range: 'Custom', from: draft.from, to: draft.to }); close()" />
                  </div>
                </div>
              </template>
            </Popover>
            </Tooltip>
          </template>
        </div>
        <!-- approval requests: an icon with how many wait for this person's decision -->
        <Tooltip v-if="requests" :text="requests.waiting.length ? `${requests.waiting.length} request${requests.waiting.length === 1 ? '' : 's'} waiting for you` : 'Requests'">
          <span class="relative inline-flex">
            <Button :variant="requests.waiting.length ? 'subtle' : 'outline'" icon="lucide-inbox" aria-label="Requests" data-testid="dash-requests-btn" @click="reqOpen = true" />
            <span v-if="requests.waiting.length" class="pointer-events-none absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-surface-red-7 px-1 text-center text-[11px] font-semibold leading-[18px] text-white tabular-nums" data-testid="dash-requests-count">{{ requests.waiting.length }}</span>
          </span>
        </Tooltip>
        <div v-if="showScope" class="flex items-center">
        <Popover placement="bottom-end">
          <template #trigger>
            <button type="button" class="inline-flex h-8 max-w-64 items-center gap-1.5 border bg-surface-base pl-2.5 pr-2 text-sm font-medium text-ink-gray-8 shadow-sm hover:bg-surface-gray-1"
              :class="multi && filters.scope ? 'rounded-l-lg' : 'rounded-lg'" data-testid="dash-scope">
              <span :class="sel.kind === 'team' ? 'lucide-users-round' : sel.list.length === 1 ? 'lucide-user' : 'lucide-users'" class="size-4 shrink-0 text-ink-gray-6" />
              <span class="truncate">{{ scopeLabel }}</span><span class="lucide-chevron-down size-4 shrink-0 text-ink-gray-5" />
            </button>
          </template>
          <template #default="{ close }">
            <div class="w-80" data-testid="dash-scope-menu">
              <!-- what is chosen, as chips inside the search box (Linear / Notion style) -->
              <div class="border-b p-2">
                <div class="flex min-h-8 flex-wrap items-center gap-1 rounded-6 bg-surface-gray-2 px-1.5 py-1">
                  <span v-for="c in (multi && sel.list.length > 1 ? chosen : [])" :key="c.key" class="inline-flex max-w-full items-center gap-1 rounded bg-surface-base py-0.5 pl-1.5 pr-0.5 text-xs font-medium text-ink-gray-8 shadow-sm" data-testid="dash-scope-chip">
                    <span v-if="c.kind === 'team'" class="size-2 shrink-0 rounded-sm" :style="{ background: teamColor(c.key) }" />
                    <span class="truncate">{{ c.label }}</span>
                    <button type="button" class="flex size-4 shrink-0 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-8" :aria-label="`Remove ${c.label}`" @click="unpick(c)"><span class="lucide-x size-3" /></button>
                  </span>
                  <input v-model="q" class="h-6 min-w-[7rem] flex-1 border-0 bg-transparent p-0 px-1 text-sm text-ink-gray-8 placeholder-ink-gray-4 focus:ring-0" :placeholder="multi ? 'Search team, name or employee ID' : 'Find a team or person'" data-testid="dash-scope-search" />
                </div>
              </div>
              <div class="dms-scroll max-h-80 overflow-y-auto p-1.5">
                <div v-for="[g, l] in scopeList" :key="g">
                  <div v-if="g" class="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-ink-gray-5">{{ g }}</div>
                  <template v-if="multi">
                    <!-- Everyone / My team, and Me: one choice each -->
                    <button v-for="o in l.filter((x) => x.kind === 'all' || x.me)" :key="`${o.kind}-${o.key}-top`" type="button" class="flex w-full items-center gap-2.5 rounded-6 px-2 py-1.5 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2"
                      :class="isCurrent(o) && 'bg-surface-gray-2 font-medium text-ink-gray-9'" data-testid="dash-scope-option" @click="pick(o.kind === 'all' ? '' : `user:${o.key}`, close)">
                      <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-ink-gray-6"><span :class="o.kind === 'all' ? 'lucide-users' : 'lucide-user'" class="size-3.5" /></span>
                      <span class="flex-1 truncate">{{ o.label }}</span><span v-if="isCurrent(o)" class="lucide-check size-4 text-ink-gray-9" />
                    </button>
                    <!-- teams and people: choose one to see it, more to compare them -->
                    <button v-for="o in l.filter((x) => x.kind !== 'all' && !x.me)" :key="`${o.kind}-${o.key}`" type="button" role="option" :aria-selected="ticked(o)"
                      class="flex w-full items-center gap-2.5 rounded-6 px-2 py-1.5 text-left text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:cursor-not-allowed disabled:opacity-40"
                      :class="ticked(o) && 'bg-surface-gray-2 font-medium text-ink-gray-9'" :disabled="full(o)" :title="full(o) ? `Up to ${MAX_PEOPLE} people` : ''" :data-testid="`dash-scope-${o.kind}`" @click="toggle(o)">
                      <span v-if="o.kind === 'team'" class="flex size-6 shrink-0 items-center justify-center rounded-6 text-[11px] font-semibold text-white" :style="{ background: teamColor(o.key) }">{{ o.label[0] }}</span>
                      <span v-else class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-[10px] font-semibold text-ink-gray-7">{{ initials(o.label) }}</span>
                      <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
                      <span v-if="o.sub" class="shrink-0 text-xs font-normal text-ink-gray-5">{{ o.sub }}</span>
                      <span class="lucide-check size-4 shrink-0" :class="ticked(o) ? 'text-ink-gray-9' : 'invisible'" />
                    </button>
                  </template>
                  <template v-else>
                    <button v-for="o in l" :key="o.value" type="button" class="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-surface-gray-2"
                      :class="(filters.scope || '') === o.value && 'bg-surface-gray-2 font-medium'" data-testid="dash-scope-option" @click="pick(o.value, close)">
                      <span class="truncate">{{ o.label }}</span><span v-if="o.sub" class="ml-2 shrink-0 text-xs text-ink-gray-5">{{ o.sub }}</span>
                    </button>
                  </template>
                </div>
              </div>
              <div v-if="multi && sel.list.length > 1" class="flex items-center justify-between border-t px-3 py-2">
                <button type="button" class="text-sm text-ink-gray-6 hover:text-ink-gray-9 hover:underline" @click="clearScope">Clear</button>
                <Button size="sm" variant="solid" :label="`Compare ${sel.list.length}`" data-testid="dash-scope-done" @click="close()" />
              </div>
            </div>
          </template>
        </Popover>
        <!-- back to everyone in one click -->
        <Tooltip v-if="multi && filters.scope" :text="isAdminLabel" placement="bottom">
          <button type="button" class="flex h-8 w-8 items-center justify-center rounded-r-lg border border-l-0 bg-surface-base text-ink-gray-6 shadow-sm hover:bg-surface-gray-1 hover:text-ink-gray-9" :aria-label="isAdminLabel" data-testid="dash-scope-clear" @click="clearScope">
            <span class="lucide-x size-4" />
          </button>
        </Tooltip>
        </div>
      </div>
      <nav class="dms-scroll mx-auto mt-2.5 flex max-w-[1400px] gap-1 overflow-x-auto pb-2" aria-label="Sections" data-testid="dash-nav">
        <button v-for="n in nav" :key="n.key" type="button" class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
          :class="current === n.key ? 'bg-surface-base text-ink-gray-9 shadow-sm ring-1 ring-outline-gray-2' : 'text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8'" :aria-current="current === n.key || undefined" :data-testid="`dash-nav-${n.key}`" @click="jump(n.key)">
          <span :class="n.icon" class="size-3.5" :style="current === n.key ? { color: 'var(--viz-accent)' } : null" />{{ n.label }}
        </button>
      </nav>
    </div>

    <div class="mx-auto max-w-[1400px] space-y-8 px-5 pb-10 pt-5">
      <!-- highlights: what the numbers say, in a sentence each; a click opens the records behind -->
      <div v-if="insights?.length" class="dash-enter grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="dash-insights">
        <component :is="insightClickable(x) ? 'button' : 'div'" v-for="x in insights" :key="x.key" type="button" class="dash-card group flex items-start gap-3 border bg-surface-base px-4 py-3.5 text-left"
          :class="insightClickable(x) && 'hover:border-outline-gray-3'" :data-testid="`dash-insight-${x.key}`" @click="insightClickable(x) && open(x.drill, $event)">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-xl" :style="{ background: INSIGHT[x.tone || 'info'].bg, color: INSIGHT[x.tone || 'info'].fg }"><span :class="x.icon || 'lucide-sparkles'" class="size-[18px]" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold leading-snug text-ink-gray-9">{{ x.title }}</span>
            <span class="mt-0.5 block text-xs leading-snug text-ink-gray-5">{{ x.text }}</span>
          </span>
          <span v-if="insightClickable(x)" class="lucide-arrow-up-right size-4 shrink-0 text-ink-gray-4 transition group-hover:text-ink-gray-8" />
        </component>
      </div>
      <section v-for="s in sections" :key="s.key" class="dash-enter scroll-mt-32" :data-testid="`dash-section-${s.key}`">
        <div v-if="s.title" class="mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span v-if="s.icon" class="flex size-8 items-center justify-center rounded-xl" style="background: var(--viz-accent-wash); color: var(--viz-accent)"><span :class="s.icon" class="size-4" /></span>
          <h2 class="text-[19px] font-semibold tracking-tight text-ink-gray-9">{{ s.title }}</h2>
          <span v-if="s.badge" class="rounded-full border bg-surface-base px-2 py-0.5 text-[11px] font-medium text-ink-gray-6">{{ s.badge }}</span>
          <span v-if="s.sub" class="w-full text-sm text-ink-gray-5 sm:ml-1 sm:w-auto">{{ s.sub }}</span>
        </div>
        <!-- a line about the page itself (e.g. the other website's numbers are still on their way) -->
        <div v-if="s.message" class="flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm" :class="s.message.tone === 'amber' ? 'border-outline-amber-2 bg-surface-amber-1 text-ink-amber-8' : 'bg-surface-base text-ink-gray-6'" data-testid="dash-notice">
          <span :class="s.message.icon || 'lucide-info'" class="size-4 shrink-0" :data-spin="s.message.loading || undefined" />{{ s.message.text }}
        </div>
        <KpiStrip v-else-if="s.kind === 'kpis'" :items="s.items" :caption="caption" @open="open" />
        <CompareView v-else-if="s.kind === 'compare'" :key="filters.scope" :section="s" />
        <!-- overview: the headline cards choose what the big chart shows; beside it, the day's to-do list -->
        <template v-else-if="s.kind === 'overview'">
          <KpiStrip :items="s.items" :caption="caption" :selected="metric ?? s.items[0]?.key" @open="open" @select="(k) => (metric = k)" />
          <div class="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <MetricCard :key="metric" :card="trendCard(s)" :caption="caption" class="xl:col-span-2" @open="open" />
            <MetricCard v-if="s.side" :card="s.side" :caption="caption" class="xl:max-h-[352px]" @open="open" @scope="scopeTo" />
          </div>
        </template>
        <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2" :class="s.cols !== 2 && 'xl:grid-cols-3'">
          <MetricCard v-for="c in s.cards" :key="c.key" :card="c" :caption="caption" :class="[c.wide && 'md:col-span-2 xl:col-span-3', c.span2 && 'md:col-span-2']" @open="open" @scope="scopeTo" />
        </div>
      </section>
    </div>

    <!-- requests waiting for this person, oldest first: a click on a row opens the record; approve or reject right here,
         one by one or all at once -->
    <Dialog v-if="requests" v-model:open="reqOpen" :title="`Requests (${requests.waiting.length})`" size="2xl">
      <div v-if="!requests.waiting.length" class="flex flex-col items-center py-10 text-center">
        <span class="mb-2 flex size-10 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-5"><span class="lucide-inbox size-5" /></span>
        <p class="text-base text-ink-gray-8">All caught up</p>
        <p class="text-sm text-ink-gray-5">Nothing is waiting for your decision.</p>
      </div>
      <template v-else>
        <div v-if="requests.waiting.length > 1" class="mb-2 flex items-center justify-end gap-2">
          <template v-if="confirmAll">
            <span class="text-sm text-ink-gray-7">Approve all {{ requests.waiting.length }}?</span>
            <Button size="sm" label="Cancel" @click="confirmAll = false" />
            <Button size="sm" variant="solid" theme="green" label="Yes, approve all" data-testid="dash-requests-approve-all-yes" @click="approveAll()" />
          </template>
          <Button v-else size="sm" icon-left="lucide-check-check" :label="`Approve all (${requests.waiting.length})`" data-testid="dash-requests-approve-all" @click="confirmAll = true" />
        </div>
        <ul class="dms-scroll max-h-[65vh] divide-y overflow-y-auto rounded-10 border" data-testid="dash-requests-list">
          <li v-for="r in requests.waiting" :key="r.id" role="link" tabindex="0" class="group flex cursor-pointer items-start gap-3 px-3 py-3 outline-none hover:bg-surface-gray-1 focus-visible:bg-surface-gray-1"
            data-testid="dash-request" :data-to="JSON.stringify(r.to)" :aria-label="`Open ${r.label}`" @click="goTo(r.to)" @keydown.enter="goTo(r.to)">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-gray-2 text-xs font-semibold text-ink-gray-7">{{ r.label.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="truncate text-base font-medium text-ink-gray-9">{{ r.label }}</span>
                <span class="rounded bg-surface-gray-2 px-1.5 py-px text-xs text-ink-gray-7">{{ r.type }}</span>
                <span class="text-xs tabular-nums" :class="r.tone === 'red' ? 'text-ink-red-6' : r.tone === 'amber' ? 'text-ink-amber-7' : 'text-ink-gray-5'" title="Waiting at your level">{{ r.days === 0 ? 'Today' : `${r.days}d` }}</span>
              </div>
              <p class="mt-0.5 truncate text-sm text-ink-gray-8" :title="r.lines.join(' · ')">{{ r.lines.join(' · ') }}</p>
              <!-- the trail: who raised it, who approved it below this person, then them -->
              <p class="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-ink-gray-5">
                <span>Raised by <b class="font-medium text-ink-gray-7">{{ r.by.name }}</b> {{ r.by.code }} · {{ r.by.on }}</span>
                <template v-for="(a, i) in r.approved" :key="i">
                  <span class="lucide-chevron-right size-3 text-ink-gray-4" />
                  <span :title="a.on"><span :class="a.skipped ? 'text-ink-gray-5' : 'text-ink-green-7'">{{ a.skipped ? 'Skipped' : '✓' }}</span> <b class="font-medium text-ink-gray-7">{{ a.name }}</b> {{ a.code }}<span v-if="a.edited" class="ml-1 rounded bg-surface-amber-1 px-1 text-ink-amber-8">edited</span></span>
                </template>
                <span class="lucide-chevron-right size-3 text-ink-gray-4" /><span class="font-medium text-ink-gray-7">You</span>
              </p>
            </div>
            <!-- decide without opening the record -->
            <div class="flex shrink-0 items-center gap-1.5 self-center" @click.stop @keydown.enter.stop>
              <template v-if="confirmReject === r.id">
                <span class="text-xs text-ink-gray-7">Reject?</span>
                <Button size="sm" label="No" @click="confirmReject = ''" />
                <Button size="sm" variant="solid" theme="red" label="Reject" data-testid="dash-request-reject-yes" @click="decide(r, 'reject')" />
              </template>
              <template v-else>
                <Tooltip text="Reject"><Button size="sm" icon="lucide-x" aria-label="Reject" data-testid="dash-request-reject" @click="confirmReject = r.id" /></Tooltip>
                <Button size="sm" variant="solid" theme="green" icon-left="lucide-check" label="Approve" data-testid="dash-request-approve" @click="decide(r, 'approve')" />
                <span class="lucide-chevron-right size-4 text-ink-gray-4 group-hover:text-ink-gray-7" aria-hidden="true" />
              </template>
            </div>
          </li>
        </ul>
      </template>
    </Dialog>

    <div v-if="menu.open" class="fixed z-50 w-64 rounded-xl border bg-surface-modal p-1.5 shadow-xl" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" data-testid="dash-drill-menu" @pointerdown.stop>
      <div class="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-gray-5">Open in</div>
      <template v-for="it in menu.items" :key="it.label">
        <button v-if="it.to" type="button" data-testid="drill-item" class="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm text-ink-gray-8 hover:bg-surface-gray-2" @click="go(it.to); menu.open = false"><span class="flex min-w-0 items-center gap-2"><span class="size-2 shrink-0 rounded-full" :style="{ background: it.to.href ? 'var(--viz-i)' : 'var(--viz-accent)' }" /><span class="truncate">{{ it.label }}</span><span v-if="it.to.href" class="lucide-external-link size-3 shrink-0 text-ink-gray-5" /></span><span class="rounded-full bg-surface-gray-2 px-1.5 text-xs font-medium tabular-nums text-ink-gray-7">{{ it.count.toLocaleString('en-IN') }}</span></button>
        <div v-else data-testid="drill-item" class="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-sm text-ink-gray-5" :title="it.hint">{{ it.label }}<span class="tabular-nums">{{ it.count }}</span></div>
      </template>
    </div>
  </div>
</template>
