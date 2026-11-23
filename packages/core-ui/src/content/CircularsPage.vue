<script setup>
// Circulars: day-to-day notices from Admin, the same in every DMS website (Content Hub). Two tabs (product owner,
// 19 Nov 2026):
//   Circulars     - an inbox, so the day's notices are read in one sitting: the list on the left (newest first, by
//                   day, unread in bold with a dot, counted on the megaphone icon) and the open circular on the
//                   right (text, attachment with Preview / Copy / Download). Opening one marks it read everywhere.
//                   Admin also sees who has read it ("Read by 3 of 5 IS").
//   Market Update - the three-a-day market tables at full width (MarketTab). Never counted as unread; the latest
//                   one is a strip on top of the Circulars list. Internal only. Published by hand or by the
//                   market automation (straight away).
//                   A circular may carry pictures inside its text and an uploaded HTML page shown as it is (HtmlFrame).
//   Admin         - New Circular / New Market Update, Edit, Delete. Audience: All teams, B2C only or B2B only.
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, TextInput, Dropdown, Dialog, FormControl, Tooltip, toast, dialog } from 'frappe-ui'
import DocIcon from './DocIcon.vue'
import DocPreview from './DocPreview.vue'
import DocBrowser from './DocBrowser.vue'
import RichText from './RichText.vue'
import HtmlFrame from './HtmlFrame.vue'
import HtmlPageCard from './HtmlPageCard.vue'
import HeaderTools from './HeaderTools.vue'
import MarketTab from './MarketTab.vue'
import MarketForm from './MarketForm.vue'
import { MARKET, isMarket, fromLast, sessionAt, headline, filled, pctText, tone } from './market.js'
import { copiedToast, copiedDoc, circulars, loadCirculars, api, copyDoc, download, readFile, fmtSize, AUDIENCE, audienceShort } from './hub.js'
import { fmtDate, fmtDateTime, fmtTimeShort } from '../format.js'

// people of this website (for "Read by x of y IS"); the taker role is IS for B2C, RM for B2B
const props = defineProps({ people: { type: Array, default: () => [] }, readerRole: { type: String, default: 'IS' } })
const route = useRoute(); const router = useRouter()
const tab = computed({ get: () => (route.query.tab === 'market' ? 'market' : 'circulars'), set: (v) => router.replace({ query: { ...route.query, tab: v === 'market' ? 'market' : undefined } }) })

const all = computed(() => circulars.value.items)
const items = computed(() => all.value.filter((c) => !isMarket(c)))
const markets = computed(() => all.value.filter(isMarket))
const latestMarket = computed(() => markets.value[0] || null)
const marketId = ref(null)
const admin = computed(() => circulars.value.admin)
const types = computed(() => circulars.value.types.filter((t) => t !== MARKET))

// ---------------------------------------------------------------- Circulars tab: filters and list
const q = ref(''); const type = ref(''); const period = ref(0); const unreadOnly = ref(false)
// period of publishing: quick choices, or a custom From - To range (both days included), e.g. 15 Mar to 18 Apr
const PERIODS = [[0, 'Any time'], ['today', 'Today'], [7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], ['custom', 'Custom range…']]
const from = ref(''); const to = ref('')
const dayStart = (iso) => new Date(`${iso}T00:00:00`).getTime()
function inPeriod(t) {
  const p = period.value
  if (!p) return true
  if (p === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); return t >= d.getTime() }
  if (p === 'custom') return (!from.value || t >= dayStart(from.value)) && (!to.value || t < dayStart(to.value) + 86400000)
  return Date.now() - t <= p * 86400000
}
const fmtIso = (iso) => (iso ? fmtDate(dayStart(iso)) : '')
const periodLabel = computed(() => (period.value === 'custom' ? (from.value || to.value ? `${fmtIso(from.value) || 'Start'} – ${fmtIso(to.value) || 'Today'}` : 'Custom range') : PERIODS.find((p) => p[0] === period.value)[1]))
const rangeError = computed(() => (period.value === 'custom' && from.value && to.value && from.value > to.value ? 'From is after To' : ''))
function clearPeriod() { period.value = 0; from.value = ''; to.value = '' }
const filtering = computed(() => !!(q.value || type.value || period.value || unreadOnly.value))
function clearFilters() { q.value = ''; type.value = ''; unreadOnly.value = false; clearPeriod() }
const isUnread = (c) => !c.read
const plain = (html) => String(html || '').replace(/<(style|script)[\s\S]*?<\/(style|script)>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const list = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  return items.value.filter((c) => (!type.value || c.type === type.value) && (!unreadOnly.value || isUnread(c)) && inPeriod(c.publishedAt)
    && words.every((w) => `${c.title} ${plain(c.html)} ${plain(c.page?.html)} ${c.type} ${c.attachment?.name || ''}`.toLowerCase().includes(w)))
})
const dayLabel = (t) => {
  const d = new Date(t); const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : fmtDate(t)
}
const groups = computed(() => {
  const out = []
  for (const c of list.value) { const l = dayLabel(c.publishedAt); if (!out.length || out[out.length - 1].label !== l) out.push({ label: l, items: [] }); out[out.length - 1].items.push(c) }
  return out
})
const unread = computed(() => items.value.filter(isUnread).length)

// list width: drag the divider (320 - 720 px), remembered in this browser
const LIST_W = 400
const listW = ref(LIST_W); const resizing = ref(false)
try { const w = Number(localStorage.getItem('dms.circ.listW')); if (w) listW.value = w } catch {}
function setListW(w) { listW.value = Math.round(Math.min(720, Math.max(320, w))); try { localStorage.setItem('dms.circ.listW', String(listW.value)) } catch {} }
function startResize(e) {
  e.preventDefault(); resizing.value = true
  e.currentTarget.setPointerCapture?.(e.pointerId) // keeps the drag even over an HTML page frame
  const x0 = e.clientX; const w0 = listW.value
  const move = (ev) => setListW(w0 + ev.clientX - x0)
  const up = () => { resizing.value = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
const selectedId = ref(null)
const selected = computed(() => items.value.find((c) => c.id === selectedId.value) || null)
function openCircular(c) { selectedId.value = c.id; api.markRead(c.id) }
watch(list, (l) => { if (selectedId.value && !l.some((c) => c.id === selectedId.value)) selectedId.value = null })

const TYPE_TONE = { 'FD Update': 'bg-surface-amber-2 text-ink-amber-8', 'MF Update': 'bg-surface-blue-2 text-ink-blue-8', 'Stock Update': 'bg-surface-green-2 text-ink-green-8', 'IPO Update': 'bg-surface-violet-2 text-ink-violet-8', 'NCD Update': 'bg-surface-teal-2 text-ink-teal-8', Others: 'bg-surface-gray-3 text-ink-gray-7' }
const typeMenu = computed(() => ['', ...types.value].map((t) => ({ label: t || 'All types', icon: type.value === t ? 'lucide-check' : '', onClick: () => { type.value = t } })))
const periodMenu = computed(() => PERIODS.map(([v, l]) => ({ label: l, icon: period.value === v ? 'lucide-check' : '', onClick: () => { period.value = v; if (v !== 'custom') { from.value = ''; to.value = '' } } })))
const strip = computed(() => (latestMarket.value ? headline(latestMarket.value.market) : []))
function openMarket(c) { if (c) marketId.value = c.id; tab.value = 'market' }

// ---------------------------------------------------------------- Admin: who has read it
const takers = computed(() => props.people.filter((p) => p.role === props.readerRole))
const readers = computed(() => new Set(selected.value?.readBy || []))
const readCount = computed(() => takers.value.filter((p) => readers.value.has(p.mhfId)).length)
const whoOpen = ref(false)

// attachment
const preview = ref(null); const previewOpen = ref(false)
function previewAtt(a) { preview.value = { ...a, id: a.docId }; previewOpen.value = true }
async function copyAtt(a) { toast.success(copiedToast(a, await copyDoc({ ...a, id: a.docId }))) }

// ---------------------------------------------------------------- Admin: new / edit / delete
const blank = () => ({ open: false, id: null, type: '', title: '', audience: 'All', html: '', attachment: null, file: null, market: null, page: null, pagePreview: false, busy: false })
const form = ref(blank())
const pickerOpen = ref(false); const fileInput = ref(null); const pageInput = ref(null)
const marketForm = computed(() => form.value.type === MARKET)
function newCircular() { pickerOpen.value = false; form.value = { ...blank(), open: true } }
/** A new Market Update, ready to type: the rows of the last one, the time of day from the clock. */
function newMarket() { form.value = { ...blank(), open: true, type: MARKET, market: fromLast(latestMarket.value, sessionAt()) } }
function editCircular(c) { pickerOpen.value = false; form.value = { ...blank(), open: true, id: c.id, type: c.type, title: c.title, audience: c.audience, html: c.html, attachment: c.attachment, page: c.page || null, market: c.market ? JSON.parse(JSON.stringify(c.market)) : null } }
function onFile(e) { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 10 * 1024 * 1024) return toast.error('The file is larger than 10 MB.'); form.value.file = f; form.value.attachment = { name: f.name, mime: f.type, size: f.size } }
function onPick(d) { pickerOpen.value = false; form.value.file = null; form.value.attachment = { docId: d.id, name: d.name, mime: d.mime, size: d.size } }
/** An HTML page (e.g. a designed NFO note) shown as it is inside the circular. */
async function onPage(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return
  if (!/\.html?$/i.test(f.name)) return toast.error('Choose an HTML file (.html or .htm).')
  if (f.size > 8 * 1024 * 1024) return toast.error('The HTML page is larger than 8 MB.')
  form.value.page = { name: f.name, html: await f.text(), size: f.size }; form.value.pagePreview = true
}
function removePage() { form.value.page = null; form.value.pagePreview = false }
function removeAtt() { form.value.file = null; form.value.attachment = null }
const canSave = computed(() => !form.value.busy && (marketForm.value ? filled(form.value.market) : form.value.type && form.value.title.trim()))
async function save() {
  const f = form.value; f.busy = true
  try {
    const market = marketForm.value
    const attachment = market ? null : f.file ? { ...(await readFile(f.file)), mime: f.file.type } : f.attachment
    const body = market
      ? { type: MARKET, title: `Market Update · ${f.market.session}`, audience: f.audience, html: f.html, attachment: null, market: f.market }
      : { type: f.type, title: f.title, audience: f.audience, html: f.html, attachment, market: null, page: f.page ? { name: f.page.name, html: f.page.html } : null }
    const c = f.id ? await api.updateCircular(f.id, body) : await api.publishCircular(body)
    const what = market ? 'Market Update' : 'Circular'
    toast.success(f.id ? `${what} updated` : `${what} published to ${audienceShort(f.audience).toLowerCase()} in every DMS`)
    form.value.open = false
    if (market) openMarket(c); else { tab.value = 'circulars'; selectedId.value = c.id }
  } catch (e) { toast.error(e.message) } finally { form.value.busy = false }
}
function remove(c) {
  const market = isMarket(c)
  dialog.confirm({ title: market ? 'Delete this Market Update?' : 'Delete this circular?', message: `"${c.title}" disappears from Circulars in every DMS.`, confirmLabel: 'Delete', theme: 'red',
    onConfirm: async () => { try { await api.deleteCircular(c.id); if (market) marketId.value = null; else selectedId.value = null; toast.success(market ? 'Market Update deleted' : 'Circular deleted') } catch (e) { toast.error(e.message) } } })
}

onMounted(async () => { await loadCirculars(); const first = list.value.find(isUnread) || list.value[0]; if (first && window.innerWidth >= 1024) openCircular(first) })
</script>
<template>
  <div class="flex h-full flex-col">
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b bg-surface-base px-5">
      <nav class="flex h-full items-center gap-5" role="tablist" aria-label="Circulars">
        <button v-for="[v, label, icon] in [['circulars', 'Circulars', 'lucide-megaphone'], ['market', 'Market Update', 'lucide-chart-line']]" :key="v" role="tab" :aria-selected="tab === v"
          class="-mb-px flex h-full items-center gap-2 border-b-2 text-lg" :class="tab === v ? 'border-ink-gray-9 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-5 hover:text-ink-gray-8'"
          :data-testid="`circ-tab-${v}`" @click="tab = v">
          <span :class="icon" class="size-4" />{{ label }}
          <span v-if="v === 'circulars' && unread" class="rounded-full bg-surface-red-7 px-1.5 text-xs font-medium leading-5 text-white" data-testid="circ-unread">{{ unread }} new</span>
        </button>
      </nav>
      <div class="flex items-center gap-2">
        <template v-if="tab === 'circulars'">
          <Button v-if="unread" label="Mark all as read" icon-left="lucide-check-check" @click="api.markAllRead()" />
          <Button v-if="admin" variant="solid" label="New Circular" icon-left="lucide-plus" data-testid="new-circular" @click="newCircular" />
        </template>
        <Button v-else-if="admin" variant="solid" label="New Market Update" icon-left="lucide-plus" data-testid="new-market" @click="newMarket" />
        <span class="mx-1 h-5 w-px bg-outline-gray-2" />
        <HeaderTools />
      </div>
    </header>

    <MarketTab v-if="tab === 'market'" v-model:selected-id="marketId" :items="markets" :admin="admin" :loaded="circulars.loaded" @new="newMarket" @edit="editCircular" @remove="remove" />

    <template v-else>
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2.5">
        <TextInput v-model="q" class="w-60" placeholder="Search circulars" data-testid="circ-search">
          <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
        </TextInput>
        <Dropdown :options="typeMenu"><Button :label="type || 'All types'" icon-right="lucide-chevron-down" :variant="type ? 'subtle' : 'outline'" data-testid="circ-type" /></Dropdown>
        <Dropdown :options="periodMenu"><Button :label="periodLabel" icon-left="lucide-calendar" icon-right="lucide-chevron-down" :variant="period ? 'subtle' : 'outline'" data-testid="circ-period" /></Dropdown>
        <div v-if="period === 'custom'" class="flex items-center gap-1.5" data-testid="circ-range">
          <span class="text-sm text-ink-gray-5">From</span>
          <FormControl v-model="from" type="date" format="D MMM YYYY" placeholder="Start date" class="w-36" data-testid="circ-from" />
          <span class="text-sm text-ink-gray-5">To</span>
          <FormControl v-model="to" type="date" format="D MMM YYYY" placeholder="End date" class="w-36" data-testid="circ-to" />
          <Button variant="ghost" icon="lucide-x" aria-label="Clear dates" @click="clearPeriod" />
          <span v-if="rangeError" class="text-sm text-ink-red-6">{{ rangeError }}</span>
        </div>
        <Button :variant="unreadOnly ? 'subtle' : 'outline'" :icon-left="unreadOnly ? 'lucide-check' : 'lucide-mail'" label="Unread only" @click="unreadOnly = !unreadOnly" />
        <Button v-if="filtering" variant="ghost" label="Clear" @click="clearFilters" />
        <div class="flex-1" /><span class="text-sm text-ink-gray-5">{{ list.length }} circular{{ list.length === 1 ? '' : 's' }}</span>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- list -->
        <section class="dms-scroll shrink-0 overflow-y-auto" :style="{ width: `${listW}px` }" data-testid="circ-list">
          <!-- the latest Market Update, one click to its tab -->
          <button v-if="latestMarket" class="block w-full border-b bg-surface-gray-1 px-4 py-3 text-left hover:bg-surface-gray-2" data-testid="market-pinned" @click="openMarket(latestMarket)">
            <div class="flex items-center gap-2">
              <span class="lucide-chart-line size-4 text-ink-cyan-7" />
              <span class="text-sm font-semibold text-ink-gray-9">{{ latestMarket.title }}</span>
              <span class="text-xs text-ink-gray-5">· {{ dayLabel(latestMarket.market.asOf || latestMarket.publishedAt) }}, {{ fmtTimeShort(latestMarket.market.asOf || latestMarket.publishedAt) }}</span>
              <span class="lucide-chevron-right ml-auto size-4 text-ink-gray-5" />
            </div>
            <div class="mt-1.5 grid grid-cols-3 gap-2">
              <div v-for="h in strip" :key="h.name" class="min-w-0">
                <div class="truncate text-xs text-ink-gray-5">{{ h.name }}</div>
                <div class="truncate text-sm tabular-nums"><span class="font-medium text-ink-gray-8">{{ h.value }}</span> <span :class="tone(h.pct)">{{ pctText(h.pct, h.bps) }}</span></div>
              </div>
            </div>
          </button>
          <div v-if="circulars.error" class="m-4 rounded-4 bg-surface-red-1 p-3 text-base text-ink-red-7">{{ circulars.error }}</div>
          <div v-else-if="!circulars.loaded" class="p-10 text-center text-base text-ink-gray-5">Loading circulars…</div>
          <div v-else-if="!list.length" class="px-5 py-16 text-center text-base text-ink-gray-5">
            {{ unreadOnly && !items.some(isUnread) ? 'All caught up: nothing unread.' : 'No circular matches.' }}
            <div v-if="filtering" class="mt-2"><Button variant="ghost" label="Clear filters" @click="clearFilters" /></div>
          </div>
          <template v-for="g in groups" :key="g.label">
            <div class="sticky top-0 z-10 border-b bg-surface-gray-1 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-gray-5">{{ g.label }}</div>
            <button v-for="c in g.items" :key="c.id" class="relative block w-full border-b px-4 py-3 text-left" data-testid="circ-item"
              :class="selectedId === c.id ? 'bg-surface-gray-2' : 'hover:bg-surface-gray-1'" @click="openCircular(c)">
              <span v-if="isUnread(c)" class="absolute left-1.5 top-[18px] size-1.5 rounded-full bg-surface-blue-7" />
              <div class="flex items-center gap-2">
                <span class="rounded px-1.5 py-0.5 text-2xs font-medium" :class="TYPE_TONE[c.type]">{{ c.type }}</span>
                <span v-if="admin && c.audience !== 'All'" class="rounded bg-surface-gray-2 px-1.5 py-0.5 text-2xs text-ink-gray-6">{{ audienceShort(c.audience) }}</span>
                <span class="ml-auto shrink-0 text-xs text-ink-gray-5">{{ fmtTimeShort(c.publishedAt) }}</span>
              </div>
              <div class="mt-1 truncate text-base" :class="isUnread(c) ? 'font-semibold text-ink-gray-9' : 'text-ink-gray-7'">{{ c.title }}</div>
              <div class="mt-0.5 flex items-center gap-1 text-sm text-ink-gray-5">
                <span v-if="c.page" class="lucide-file-code size-3.5 shrink-0 text-ink-orange-6" /><span v-if="c.attachment" class="lucide-paperclip size-3.5 shrink-0" />
                <span class="truncate">{{ plain(c.html) || (c.page ? `HTML page · ${c.page.name}` : c.html?.includes('<img') ? 'Picture' : '') }}</span>
              </div>
            </button>
          </template>
        </section>

        <!-- drag to make the list wider or narrower (double-click: back to normal) -->
        <div class="group relative w-px shrink-0 cursor-col-resize bg-outline-gray-2" role="separator" aria-orientation="vertical" aria-label="Resize the circular list"
          title="Drag to resize · double-click to reset" data-testid="circ-resize" @pointerdown="startResize" @dblclick="setListW(LIST_W)">
          <div class="absolute inset-y-0 -left-1.5 -right-1.5 z-20" />
          <div class="absolute inset-y-0 left-0 w-px transition-colors group-hover:w-[3px] group-hover:-translate-x-px group-hover:bg-surface-blue-6" :class="resizing && 'w-[3px] -translate-x-px bg-surface-blue-6'" />
        </div>

        <!-- reading pane -->
        <section class="dms-scroll min-w-0 flex-1 overflow-y-auto" data-testid="circ-view">
          <div v-if="!selected" class="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span class="lucide-megaphone size-8 text-ink-gray-4" /><p class="text-base text-ink-gray-6">Select a circular to read it</p>
          </div>
          <article v-else class="mx-auto px-8 py-6" :class="selected.page ? 'max-w-5xl' : 'max-w-3xl'">
            <div class="flex items-start justify-between gap-4">
              <span class="rounded px-2 py-0.5 text-xs font-medium" :class="TYPE_TONE[selected.type]">{{ selected.type }}</span>
              <div v-if="admin" class="flex gap-1">
                <Button variant="ghost" icon-left="lucide-pencil" label="Edit" @click="editCircular(selected)" />
                <Button variant="ghost" icon-left="lucide-trash-2" label="Delete" theme="red" @click="remove(selected)" />
              </div>
            </div>
            <h1 class="mt-3 text-2xl font-semibold text-ink-gray-9" data-testid="circ-title">{{ selected.title }}</h1>
            <p class="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-gray-5">
              <span>{{ fmtDateTime(selected.publishedAt) }} · {{ selected.by?.name || 'Admin' }}</span>
              <template v-if="selected.updatedAt"><span>· edited {{ fmtDate(selected.updatedAt) }}</span></template>
              <template v-if="admin"><span>· {{ audienceShort(selected.audience) }}</span>
                <span>·</span><button class="flex items-center gap-1 rounded px-1 hover:bg-surface-gray-2 hover:text-ink-gray-8" data-testid="circ-readby" @click="whoOpen = true"><span class="lucide-eye size-3.5" />Read by {{ readCount }} of {{ takers.length }} {{ readerRole }}</button>
              </template>
            </p>
            <div class="dms-rich prose prose-sm mt-5 max-w-none text-ink-gray-8" v-html="selected.html" />
            <HtmlPageCard v-if="selected.page" :key="selected.id" :page="selected.page" :circular-title="selected.title" :class="plain(selected.html) || selected.html?.includes('<img') ? 'mt-6' : 'mt-5'" />
            <div v-if="selected.attachment" class="mt-6 flex items-center gap-3 rounded-6 border p-3" data-testid="circ-attachment">
              <DocIcon :mime="selected.attachment.mime" :name="selected.attachment.name" size="lg" />
              <button class="min-w-0 flex-1 text-left" @click="previewAtt(selected.attachment)">
                <div class="truncate text-base font-medium text-ink-gray-8 hover:underline">{{ selected.attachment.name }}</div>
                <div class="text-sm text-ink-gray-5">{{ fmtSize(selected.attachment.size) }} · click to preview</div>
              </button>
              <Tooltip :text="copiedDoc?.docId === selected.attachment.docId ? 'Copied' : 'Copy'"><Button variant="ghost" :icon="copiedDoc?.docId === selected.attachment.docId ? 'lucide-check' : 'lucide-copy'" :class="copiedDoc?.docId === selected.attachment.docId && 'text-ink-green-6'" data-testid="circ-copy" @click="copyAtt(selected.attachment)" /></Tooltip>
              <Tooltip text="Download"><Button variant="ghost" icon="lucide-download" @click="download(selected.attachment)" /></Tooltip>
            </div>
          </article>
        </section>
      </div>
    </template>

    <DocPreview v-model:open="previewOpen" :doc="preview" />

    <!-- Admin: who has read the open circular -->
    <Dialog v-model:open="whoOpen" :title="`Read by ${readCount} of ${takers.length} ${readerRole}`" size="md">
      <div v-if="selected" class="space-y-4" data-testid="circ-readers">
        <div v-for="[label, list] in [['Read', takers.filter((p) => readers.has(p.mhfId))], ['Not yet', takers.filter((p) => !readers.has(p.mhfId))]]" :key="label">
          <div class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-gray-5">{{ label }} · {{ list.length }}</div>
          <p v-if="!list.length" class="text-sm text-ink-gray-5">Nobody</p>
          <div v-for="p in list" :key="p.mhfId" class="flex items-center justify-between border-b py-1.5 text-base last:border-b-0">
            <span class="text-ink-gray-8">{{ p.name }}</span><span class="text-xs text-ink-gray-5">{{ p.mhfId }}</span>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Admin: new / edit -->
    <Dialog v-model:open="form.open" :title="marketForm ? (form.id ? 'Edit Market Update' : 'New Market Update') : form.id ? 'Edit circular' : 'New circular'" :size="marketForm ? '7xl' : '3xl'" :dismissible="!form.busy">
      <div class="space-y-4">
        <template v-if="marketForm && form.market">
          <MarketForm v-model="form.market" />
          <div>
            <div class="mb-1.5 text-xs text-ink-gray-5">Comment (optional): one or two lines on what moved the market. Shown on top of the update.</div>
            <RichText v-model="form.html" placeholder="e.g. Broad selling into the close; IT and Auto were the weakest." data-testid="circ-form-body" />
          </div>
        </template>
        <template v-else>
          <div class="grid grid-cols-[200px_1fr] gap-3">
            <FormControl v-model="form.type" label="Circular type" type="select" required :options="types" placeholder="Select" data-testid="circ-form-type" />
            <FormControl v-model="form.title" label="Title" required placeholder="e.g. NFO Update: ..." data-testid="circ-form-title" />
          </div>
          <div>
            <div class="mb-1.5 text-xs text-ink-gray-5">Description: paste a picture with Ctrl+V where it should appear; tables pasted from Excel or Word stay tables</div>
            <RichText v-model="form.html" images max-height="22rem" placeholder="What does the team need to know or do? Paste a picture with Ctrl+V." data-testid="circ-form-body" />
          </div>
          <div>
            <div class="mb-1.5 text-xs text-ink-gray-5">HTML page (optional): shown as it is, below the description</div>
            <div v-if="form.page" class="rounded-4 border" data-testid="circ-form-page">
              <div class="flex items-center gap-3 p-2.5">
                <span class="lucide-file-code size-5 text-ink-orange-6" />
                <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{ form.page.name }}</span>
                <span class="text-sm text-ink-gray-5">{{ fmtSize(form.page.size || form.page.html.length) }}</span>
                <Button variant="ghost" :label="form.pagePreview ? 'Hide preview' : 'Preview'" @click="form.pagePreview = !form.pagePreview" />
                <Button variant="ghost" icon="lucide-x" aria-label="Remove HTML page" @click="removePage" />
              </div>
              <div v-if="form.pagePreview" class="border-t"><HtmlFrame :cap="360" :html="form.page.html" :title="form.page.name" /></div>
            </div>
            <template v-else>
              <Button label="Upload HTML page" icon-left="lucide-file-code" data-testid="circ-form-page-btn" @click="pageInput.click()" />
              <input ref="pageInput" type="file" accept=".html,.htm,text/html" class="hidden" data-testid="circ-form-page-file" @change="onPage" />
            </template>
          </div>
          <div>
            <div class="mb-1.5 text-xs text-ink-gray-5">Attachment (optional)</div>
            <div v-if="form.attachment" class="flex items-center gap-3 rounded-4 border p-2.5">
              <DocIcon :mime="form.attachment.mime" :name="form.attachment.name" size="sm" />
              <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{ form.attachment.name }}</span>
              <span class="text-sm text-ink-gray-5">{{ fmtSize(form.attachment.size) }}</span>
              <Button variant="ghost" icon="lucide-x" @click="removeAtt" />
            </div>
            <div v-else-if="pickerOpen" class="rounded-4 border p-3">
              <div class="mb-2 flex items-center justify-between"><span class="text-sm font-medium text-ink-gray-8">Choose from the Document Repository</span><Button variant="ghost" size="sm" label="Cancel" @click="pickerOpen = false" /></div>
              <DocBrowser @pick="onPick" />
            </div>
            <div v-else class="flex gap-2">
              <Button label="Upload a file" icon-left="lucide-upload" @click="fileInput.click()" />
              <Button label="Choose from Document Repository" icon-left="lucide-folder-open" @click="pickerOpen = true" />
              <input ref="fileInput" type="file" class="hidden" data-testid="circ-form-file" @change="onFile" />
            </div>
          </div>
        </template>
        <div class="grid grid-cols-[260px_1fr] items-end gap-3">
          <FormControl v-model="form.audience" label="Who can see it" type="select" :options="AUDIENCE" />
          <p class="pb-1.5 text-xs text-ink-gray-5">{{ marketForm ? 'Shown in every DMS website of this audience as the latest Market Update. It does not add to the red count.' : 'Shown in every DMS website of this audience, with a red "new" count on the Circulars icon.' }}</p>
        </div>
      </div>
      <template #actions>
        <div class="flex items-center justify-end gap-2">
          <span v-if="marketForm && !filled(form.market)" class="mr-auto text-sm text-ink-gray-5">Type at least one figure to publish.</span>
          <Button label="Cancel" :disabled="form.busy" @click="form.open = false" />
          <Button variant="solid" :loading="form.busy" :label="form.id ? 'Save' : 'Publish'" :disabled="!canSave" data-testid="circ-form-save" @click="save" />
        </div>
      </template>
    </Dialog>
  </div>
</template>
