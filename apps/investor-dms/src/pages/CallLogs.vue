<script setup>
// Call Logs (Fig 21072 / 21531; D04 §7; CALL-009..012, ROLE-003). Read-only: nobody creates, edits or unmasks.
// Client Number masked only for Pool-stage calls (D04 §7.3). Assigned To / Data Code / hierarchy filter for TL+ (OPEN_QUESTIONS C5).
// Row click opens Call Details with the recording player (only with the "Play Call Recordings" switch, D06 §9.6).
import { ref, computed } from 'vue'
import { Badge } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { NOT_CONNECTED_REASONS } from '@/data/masters'
import { visibleUserIds, isAdmin, isSupervisor, downline } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import { fmtDateTime, fmtDurationShort, maskPhoneDots, fmtMobile, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import CallDetailsModal from '@/components/calls/CallDetailsModal.vue'

const db = useDb()
const source = () => {
  const ids = visibleUserIds()
  return db.calls
    .filter((l) => isAdmin() || ids.includes(l.madeBy))
    .map((l) => {
      const c = db.clientById(l.clientId)
      return { id: l.id, l, clientId: l.clientId, cid: c?.cid || c?.id || '-', dataCode: c?.dataCode || '-', clientName: l.clientName || (c ? clientName(c) : 'Unknown'),
        number: l.stageAtCall === 'Pool' ? maskPhoneDots(l.mobile) : fmtMobile(l.mobile), rawMobile: l.mobile, stage: l.stageAtCall, direction: l.direction, status: l.status,
        subStatus: l.subStatus, duration: l.duration, at: l.at, madeBy: l.madeBy, madeByName: db.userById(l.madeBy)?.name }
    })
}
const L = useList(source, {
  searchKeys: ['cid', 'clientName', (r) => (r.stage === 'Pool' ? '' : r.rawMobile)],
  defaultSort: { key: 'at', dir: 'desc' },
  quickMatch: {
    when: (r, v) => Date.now() - r.at <= Number(v) * DAY,
    team: (r, v) => r.madeBy === v || downline(v).includes(r.madeBy), // hierarchy filter (D04 §7.3)
  },
})
const teamLeads = computed(() => db.users.filter((u) => ['TL', 'VP', 'President'].includes(u.role) && (isAdmin() || [db.sessionUserId, ...downline(db.sessionUserId)].includes(u.id))))
const quick = computed(() => [
  { key: 'direction', label: 'Call Type', options: ['Inbound', 'Outbound'] },
  { key: 'stage', label: 'Client Stage', options: ['Pool', 'Prospect', 'Lead', 'Investor'] },
  { key: 'status', label: 'Status', options: ['Connected', 'Not Connected'] },
  { key: 'subStatus', label: 'Sub Status', options: ['Disconnected', 'Followup', 'Wrong Number', 'Not Interested', 'Passive Communication', 'Interested', ...NOT_CONNECTED_REASONS] },
  { key: 'when', label: 'Date and time', options: [{ label: 'Today', value: 1 }, { label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }] },
  ...(isSupervisor() && teamLeads.value.length ? [{ key: 'team', label: 'Team', options: teamLeads.value.map((u) => ({ label: `${u.name} (${u.role})`, value: u.id })) }] : []),
])
const columns = computed(() => [
  { key: 'cid', label: 'Client ID' }, ...(isSupervisor() ? [{ key: 'dataCode', label: 'Data Code' }] : []), { key: 'clientName', label: 'Client Name' },
  { key: 'number', label: 'Client Number' }, { key: 'stage', label: 'Client Stage' }, { key: 'direction', label: 'Call Type' }, { key: 'status', label: 'Status' },
  { key: 'subStatus', label: 'Sub Status' }, { key: 'duration', label: 'Call Duration' }, { key: 'at', label: 'Call Date and Time' },
  ...(isSupervisor() ? [{ key: 'madeBy', label: 'Assigned To' }] : []),
])
const filterFields = computed(() => [{ key: 'clientName', label: 'Client Name' }, { key: 'subStatus', label: 'Sub Status' }, { key: 'duration', label: 'Call Duration (seconds)' }, ...(isSupervisor() ? [{ key: 'madeByName', label: 'Assigned To' }] : [])])
const sortFields = [{ key: 'at', label: 'Call Date and Time' }, { key: 'duration', label: 'Call Duration' }, { key: 'clientName', label: 'Client Name' }]
const details = ref({ open: false, call: null }) // row click opens Call Details (same pop-up as the record's Calls tab)
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Call Logs', to: '/call-logs' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="ID/ Name/ Mob. No." :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <div class="flex min-h-0 flex-1">
      <DataTable :columns="columns" :rows="L.rows.value" :loading="L.loading.value" uppercase empty-text="No call logs found" @row-click="(r) => (details = { open: true, call: r.l })">
        <template #cell-cid="{ row }"><span class="tabular text-ink-gray-6">{{ row.cid }}</span></template>
        <template #cell-number="{ row }"><span class="tabular whitespace-nowrap">{{ row.number }}</span></template>
        <template #cell-direction="{ row }"><span class="inline-flex items-center gap-1"><span :class="row.direction === 'Inbound' ? 'lucide-arrow-down-left text-ink-green-6' : 'lucide-arrow-up-right text-ink-blue-6'" class="size-4" />{{ row.direction }}</span></template>
        <template #cell-status="{ row }"><Badge :label="row.status" :theme="row.status === 'Connected' ? 'green' : 'red'" /></template>
        <template #cell-duration="{ row }"><span class="inline-flex items-center gap-1 tabular"><span class="lucide-clock size-3.5 text-ink-gray-5" />{{ fmtDurationShort(row.duration) }}</span></template>
        <template #cell-at="{ row }"><span class="whitespace-nowrap text-sm">{{ fmtDateTime(row.at) }}</span></template>
        <template #cell-madeBy="{ row }"><UserChip :user-id="row.madeBy" /></template>
      </DataTable>
    </div>
    <CallDetailsModal v-model:open="details.open" :call="details.call" />
  </div>
</template>
