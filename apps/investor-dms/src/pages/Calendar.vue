<script setup>
// Calendar (Fig 21602 / 21784; D05 §5; EVT-003..006). Week view default (Sun-Sat), Day and Month views,
// Today, prev/next, user switcher (TL+ downline, Admin all; IS own only). Upcoming only: past events leave
// the Calendar but stay in the client's Events tab (EVT-004). Scheduled deals are read-only entries (EVT-006).
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { EVENT_COLOR } from '@/data/masters'
import { downline, isAdmin } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import { fmtTimeShort, inr, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import EventModal from '@/components/modals/EventModal.vue'
import { otherBusy, loadOtherBusy, BUSY_LABEL } from '@/services/busy'
import { flowOn } from '@/services/bridge'

const db = useDb(); const router = useRouter()
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6 am - 10 pm
const HOUR_PX = 48

const mode = ref(db.settings?.calendarView || 'Week') // Settings → Calendar → Default View
const cursor = ref(startOfDay(new Date()))
const userId = ref(db.sessionUserId)
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const userOptions = computed(() => {
  const ids = isAdmin() ? db.users.map((u) => u.id) : [db.sessionUserId, ...downline(db.sessionUserId)]
  return db.users.filter((u) => ids.includes(u.id)).map((u) => ({ label: u.id === db.sessionUserId ? `${u.name} (me)` : `${u.name} · ${u.role}`, value: u.id }))
})
const canSwitch = computed(() => userOptions.value.length > 1)
// F4: the other website's appointments as plain Busy blocks - only for the signed-in user, or for a supervisor
// looking at a junior when Admin turned on "Show busy blocks to supervisors" (default off; split prompt §8)
const showBusy = computed(() => flowOn('F4') && (userId.value === db.sessionUserId || !!db.settings?.showBusyToSupervisors))
watch([userId, showBusy], () => { if (showBusy.value) loadOtherBusy(userId.value); else otherBusy.value = [] }, { immediate: true })

const days = computed(() => {
  const c = cursor.value
  if (mode.value === 'Day') return [c]
  if (mode.value === 'Week') { const s = new Date(c); s.setDate(c.getDate() - c.getDay()); return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d }) }
  const first = new Date(c.getFullYear(), c.getMonth(), 1); const s = new Date(first); s.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d })
})
const title = computed(() => {
  const d = days.value; const a = d[0]; const b = d[d.length - 1]
  if (mode.value === 'Month') return `${MONTHS[cursor.value.getMonth()]} ${cursor.value.getFullYear()}`
  if (a.getMonth() === b.getMonth()) return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`
  return `${MONTHS[a.getMonth()].slice(0, 3)} – ${MONTHS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`
})
function shift(dir) {
  const d = new Date(cursor.value)
  if (mode.value === 'Day') d.setDate(d.getDate() + dir)
  else if (mode.value === 'Week') d.setDate(d.getDate() + 7 * dir)
  else d.setMonth(d.getMonth() + dir)
  cursor.value = startOfDay(d)
}
const today = startOfDay(new Date()).getTime()
const isToday = (d) => startOfDay(d).getTime() === today
const isPast = (d) => startOfDay(d).getTime() < today

// Entries for the selected user: events they created/attend or on clients they own; scheduled deals of their investors
const busyEntries = computed(() => (showBusy.value ? otherBusy.value.filter((b) => b.end >= Date.now()).map((b, i) => ({ id: 'busy-' + i, kind: 'busy', title: BUSY_LABEL, color: 'busy', start: b.start, end: b.end, allDay: b.allDay })) : []))
const entries = computed(() => {
  const u = userId.value; const now = Date.now()
  const evs = db.events
    .filter((e) => !e.cancelled) // events of junked records leave the Calendar (D06 §6.3)
    .filter((e) => e.end >= now || (e.allDay && e.start >= today)) // upcoming only (EVT-004)
    .filter((e) => { const c = e.clientId ? db.clientById(e.clientId) : null; return e.createdBy === u || e.attendees?.includes(u) || c?.assignedTo === u })
    .map((e) => ({ id: e.id, kind: 'event', e, title: e.title || e.type, type: e.type, color: EVENT_COLOR[e.type] || 'gray', start: e.start, end: e.end, allDay: e.allDay, clientId: e.clientId }))
  const deals = db.deals
    .filter((d) => d.status === 'Scheduled' && d.end >= now && db.clientById(d.clientId)?.assignedTo === u)
    .map((d) => ({ id: d.id, kind: 'deal', d, title: `Deal: ${inr(d.total)} · ${clientName(db.clientById(d.clientId))}`, color: 'deal', start: d.start, end: d.end, allDay: d.allDay, clientId: d.clientId }))
  return [...evs, ...deals, ...busyEntries.value]
})
const sameDay = (t, d) => startOfDay(new Date(t)).getTime() === startOfDay(d).getTime()
const dayEntries = (d) => entries.value.filter((x) => sameDay(x.start, d)).sort((a, b) => a.start - b.start)
const allDayEntries = (d) => dayEntries(d).filter((x) => x.allDay)
// Timed blocks with simple side-by-side layout for overlaps
function timed(d) {
  const list = dayEntries(d).filter((x) => !x.allDay)
  const cols = []
  return list.map((x) => {
    let col = cols.findIndex((end) => end <= x.start); if (col === -1) { col = cols.length; cols.push(0) }
    cols[col] = x.end
    const s = new Date(x.start); const mins = (s.getHours() - 6) * 60 + s.getMinutes()
    const dur = Math.max(30, (x.end - x.start) / 60000)
    return { ...x, col, top: Math.max(0, (mins * HOUR_PX) / 60), height: Math.max(22, (dur * HOUR_PX) / 60) }
  }).map((x, _, arr) => ({ ...x, cols: Math.max(1, ...arr.filter((y) => Math.abs(y.start - x.start) < 3 * 3600000).map((y) => y.col + 1)) }))
}
const colorCls = {
  blue: 'border-l-outline-blue-6 bg-surface-blue-2 text-ink-blue-8', violet: 'border-l-outline-violet-6 bg-surface-violet-2 text-ink-violet-8',
  green: 'border-l-outline-green-6 bg-surface-green-2 text-ink-green-8', orange: 'border-l-outline-orange-6 bg-surface-orange-2 text-ink-orange-8',
  gray: 'border-l-outline-gray-6 bg-surface-gray-2 text-ink-gray-8', busy: 'dms-busy border-l-outline-gray-4 text-ink-gray-6 cursor-not-allowed', deal: 'border-l-outline-amber-6 bg-surface-amber-1 text-ink-amber-8 border-dashed',
}
const nowTop = computed(() => { const n = new Date(); return ((n.getHours() - 6) * 60 + n.getMinutes()) * HOUR_PX / 60 })

const createOpen = ref(false)
const edit = ref({ open: false, event: null })
function openEntry(x) {
  if (x.kind === 'busy') return // Busy blocks can't be opened, edited or exported
  if (x.kind === 'deal') return router.push(`/record/${x.clientId}?tab=deals`) // read-only on Calendar (EVT-006)
  if (x.clientId) return router.push(`/record/${x.clientId}?tab=events`) // EVT-005
  edit.value = { open: true, event: x.e } // Internal Meeting -> Event Details
}
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Calendar' }]">
      <template #right><Button variant="solid" icon-left="lucide-plus" label="Create" @click="createOpen = true" /></template>
    </PageHeader>
    <div class="flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
      <div class="mr-2 text-xl font-semibold text-ink-gray-9">{{ title }}</div>
      <Button icon="lucide-chevron-left" @click="shift(-1)" />
      <Button icon="lucide-chevron-right" @click="shift(1)" />
      <Button label="Today" @click="cursor = startOfDay(new Date())" />
      <div class="ml-auto flex items-center gap-2">
        <div v-if="canSwitch" class="w-56"><FormControl v-model="userId" type="select" :options="userOptions" /></div>
        <div class="w-28"><FormControl v-model="mode" type="select" :options="['Day', 'Week', 'Month']" /></div>
      </div>
    </div>

    <!-- WEEK / DAY -->
    <div v-if="mode !== 'Month'" class="flex min-h-0 flex-1 flex-col">
      <div class="grid border-b" :style="{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0,1fr))` }">
        <div />
        <div v-for="d in days" :key="d.toISOString()" class="border-l px-2 py-2 text-center" :class="isPast(d) && 'bg-surface-gray-1'">
          <div class="text-xs uppercase text-ink-gray-5">{{ WD[d.getDay()] }}</div>
          <div class="mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-base" :class="isToday(d) ? 'bg-surface-gray-9 font-semibold text-white' : 'text-ink-gray-8'">{{ d.getDate() }}</div>
        </div>
        <div class="flex items-center justify-end border-t pr-2 text-xs text-ink-gray-5">All day</div>
        <div v-for="d in days" :key="'ad' + d.toISOString()" class="min-h-[28px] space-y-0.5 border-l border-t p-0.5" :class="isPast(d) && 'bg-surface-gray-1'">
          <button v-for="x in allDayEntries(d)" :key="x.id" class="block w-full truncate rounded-2 border-l-2 px-1.5 py-0.5 text-left text-xs" :class="colorCls[x.color]" @click="openEntry(x)">{{ x.title }}</button>
        </div>
      </div>
      <div class="dms-scroll min-h-0 flex-1 overflow-y-auto">
        <div class="relative grid" :style="{ gridTemplateColumns: `64px repeat(${days.length}, minmax(0,1fr))` }">
          <div>
            <div v-for="h in HOURS" :key="h" class="relative pr-2 text-right text-xs text-ink-gray-5" :style="{ height: HOUR_PX + 'px' }">
              <span class="relative -top-2">{{ h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am` }}</span>
            </div>
          </div>
          <div v-for="d in days" :key="'tc' + d.toISOString()" class="relative border-l" :class="isPast(d) && 'bg-surface-gray-1'">
            <div v-for="h in HOURS" :key="h" class="border-t border-outline-gray-1" :style="{ height: HOUR_PX + 'px' }" />
            <div v-if="isToday(d) && nowTop > 0" class="absolute inset-x-0 z-10 h-px bg-surface-red-7" :style="{ top: nowTop + 'px' }" />
            <button v-for="x in timed(d)" :key="x.id" class="absolute overflow-hidden rounded-3 border-l-[3px] px-1.5 py-0.5 text-left text-xs shadow-sm hover:z-20 hover:shadow"
              :class="colorCls[x.color]" :style="{ top: x.top + 'px', height: x.height + 'px', left: `calc(${(x.col / x.cols) * 100}% + 2px)`, width: `calc(${100 / x.cols}% - 4px)` }" @click="openEntry(x)">
              <div class="truncate font-medium">{{ x.title }}</div>
              <div class="truncate opacity-80">{{ fmtTimeShort(x.start) }} – {{ fmtTimeShort(x.end) }}</div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MONTH -->
    <div v-else class="dms-scroll grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(96px,1fr))] overflow-y-auto">
      <div v-for="w in WD" :key="w" class="border-b border-l py-1.5 text-center text-xs uppercase text-ink-gray-5">{{ w }}</div>
      <div v-for="d in days" :key="'m' + d.toISOString()" class="border-b border-l p-1" :class="[isPast(d) && 'bg-surface-gray-1', d.getMonth() !== cursor.getMonth() && 'opacity-50']">
        <div class="mb-0.5 flex justify-end"><span class="flex size-6 items-center justify-center rounded-full text-sm" :class="isToday(d) ? 'bg-surface-gray-9 text-white' : 'text-ink-gray-7'">{{ d.getDate() }}</span></div>
        <button v-for="x in dayEntries(d).slice(0, 3)" :key="x.id" class="mb-0.5 block w-full truncate rounded-2 border-l-2 px-1 py-0.5 text-left text-xs" :class="colorCls[x.color]" @click="openEntry(x)">
          <span v-if="!x.allDay">{{ fmtTimeShort(x.start) }} </span>{{ x.title }}
        </button>
        <button v-if="dayEntries(d).length > 3" class="text-xs text-ink-gray-5" @click="mode = 'Day'; cursor = startOfDay(d)">+{{ dayEntries(d).length - 3 }} more</button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-4 border-t px-5 py-2 text-xs text-ink-gray-6">
      <span v-for="(c, t) in EVENT_COLOR" :key="t" class="inline-flex items-center gap-1"><span class="size-2.5 rounded-1 border-l-2" :class="colorCls[c]" />{{ t }}</span>
      <span class="inline-flex items-center gap-1"><span class="size-2.5 rounded-1 border-l-2" :class="colorCls.busy" />{{ BUSY_LABEL }}</span>
      <span class="ml-auto">Past events leave the Calendar and remain in the client's Events tab (EVT-004).</span>
    </div>
    <EventModal v-model:open="createOpen" />
    <EventModal v-model:open="edit.open" :event="edit.event" title="Event Details" submit-label="Update" />
  </div>
</template>
