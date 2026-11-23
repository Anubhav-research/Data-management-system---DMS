<script setup>
// Events home (Fig 24661; D05 §4). Sidebar placement is from Figma, not GEN-002 (OPEN_QUESTIONS G4).
// Visibility: events of clients owned by visible users, plus events the user created or attends (ROLE-002).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { EVENT_TYPES, EVENT_COLOR } from '@/data/masters'
import { visibleUserIds, isAdmin, isSupervisor } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import { fmtDateTime, fmtDate, initials, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import EventModal from '@/components/modals/EventModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const db = useDb(); const router = useRouter()
const dot = { blue: 'bg-surface-blue-7', violet: 'bg-surface-violet-7', green: 'bg-surface-green-7', orange: 'bg-surface-orange-7', gray: 'bg-surface-gray-7' }
const source = () => {
  const ids = visibleUserIds(); const me = db.sessionUserId
  return db.events
    .filter((e) => !e.cancelled) // D06 §6.3
    .map((e) => ({ e, c: e.clientId ? db.clientById(e.clientId) : null }))
    .filter(({ e, c }) => isAdmin() || e.createdBy === me || e.attendees?.includes(me) || (c && ids.includes(c.assignedTo)) || ids.includes(e.createdBy))
    .map(({ e, c }) => ({
      id: e.id, e, clientId: c?.id || '-', clientName: c ? clientName(c) : '—', stage: c?.stage || '-',
      type: e.type, title: e.title, start: e.start, attendees: e.attendees || [], createdBy: e.createdBy, createdByName: db.userById(e.createdBy)?.name,
      createdAt: e.createdAt, assignedTo: c?.assignedTo || null,
    }))
}
const L = useList(source, {
  searchKeys: ['clientId', 'clientName', 'title'],
  defaultSort: { key: 'start', dir: 'asc' },
  upcomingKeys: ['start'],
  quickMatch: {
    when: (r, v) => {
      const now = Date.now()
      if (v === 'upcoming') return r.start >= now
      if (v === 'past') return r.start < now
      if (v === 'week') return r.start >= now && r.start <= now + 7 * DAY
      return true
    },
  },
})
const quick = [
  { key: 'type', label: 'Event Type', options: EVENT_TYPES.map((t) => t.value) },
  { key: 'when', label: 'Event Date', options: [{ label: 'Upcoming', value: 'upcoming' }, { label: 'Next 7 days', value: 'week' }, { label: 'Past', value: 'past' }] },
]
const columns = computed(() => [
  { key: 'clientId', label: 'Client ID' },
  { key: 'clientName', label: 'Client Name' }, { key: 'stage', label: 'Client Stage' }, { key: 'type', label: 'Event Type' }, { key: 'title', label: 'Title' },
  { key: 'start', label: 'Date & Time' }, { key: 'attendees', label: 'Attendees' }, { key: 'createdBy', label: 'Created By' }, { key: 'createdAt', label: 'Created Date' },
  ...(isSupervisor() ? [{ key: 'assignedTo', label: 'Assigned To' }] : []),
])
const filterFields = [{ key: 'clientName', label: 'Client Name' }, { key: 'type', label: 'Event Type' }, { key: 'title', label: 'Title' }, { key: 'stage', label: 'Client Stage' }, { key: 'createdByName', label: 'Created By' }]
const sortFields = [{ key: 'start', label: 'Date & Time' }, { key: 'createdAt', label: 'Created Date' }, { key: 'clientName', label: 'Client Name' }]
const createOpen = ref(false)
const edit = ref({ open: false, event: null })
function openRow(r) {
  if (r.e.clientId) router.push(`/record/${r.e.clientId}?tab=events`)
  else edit.value = { open: true, event: r.e } // Internal Meeting without a client (D05 §5.4)
}
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Events', to: '/events' }, { label: 'List', chevron: true }]">
      <template #right><Button variant="solid" icon-left="lucide-plus" label="Create" @click="createOpen = true" /></template>
    </PageHeader>
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Client ID/Name" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable :columns="columns" :rows="L.rows.value" :loading="L.loading.value" uppercase empty-text="No events found" @row-click="openRow">
      <template #cell-clientId="{ row }"><span class="tabular text-ink-gray-6">{{ row.clientId }}</span></template>
      <template #cell-type="{ row }"><span class="inline-flex items-center gap-1.5 whitespace-nowrap"><span class="size-2 rounded-full" :class="dot[EVENT_COLOR[row.type]]" />{{ row.type }}</span></template>
      <template #cell-start="{ row }"><span class="whitespace-nowrap text-sm">{{ row.e.allDay ? `${fmtDate(row.start)} · All Day` : fmtDateTime(row.start) }}</span></template>
      <template #cell-attendees="{ row }">
        <span class="flex -space-x-1.5">
          <PersonTip v-for="a in row.attendees.slice(0, 3)" :key="a" :user-id="a"><span class="flex size-6 items-center justify-center rounded-full border-2 border-white bg-surface-gray-3 text-2xs font-medium">{{ initials(db.userById(a)?.name) }}</span></PersonTip>
          <PersonTip v-if="row.attendees.length > 3" :text="row.attendees.slice(3).map((a) => db.userById(a) ? `${db.userById(a).name} (${db.userById(a).mhf_id})` : '').join(', ')"><span class="flex size-6 items-center justify-center rounded-full border-2 border-white bg-surface-gray-2 text-2xs">+{{ row.attendees.length - 3 }}</span></PersonTip>
        </span>
      </template>
      <template #cell-createdBy="{ row }"><UserChip :user-id="row.createdBy" /></template>
      <template #cell-createdAt="{ row }">{{ fmtDate(row.createdAt) }}</template>
      <template #cell-assignedTo="{ row }"><UserChip :user-id="row.assignedTo" /></template>
    </DataTable>
    <EventModal v-model:open="createOpen" />
    <EventModal v-model:open="edit.open" :event="edit.event" title="Event Details" submit-label="Update" />
  </div>
</template>
