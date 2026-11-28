<script setup>
// Approvals (read-only list, product owner 24 Nov 2026): the approval requests a person may see, so a number on the
// Dashboard ("Approvals waiting for me", "Approvals stuck" ...) opens exactly those requests. Deciding still happens
// on the record (Data tab), as before: a click opens the request there. No new data: X02 APPROVAL_REQUEST.
// Waiting = time at the CURRENT approver (from when the level below acted): over 2 days amber, over 3 days red.
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { visibleUserIds, isAdmin } from '@/services/access'
import { currentStep } from '@/services/approvals'
import { clientName, fullName } from '@/services/lifecycle'
import { fmtDateTime } from '@/utils/format'
import { reachedCurrentLevelAt, approvalTone, DAY } from '@mh/core-ui/dash/rules.js'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'

const db = useDb(); const router = useRouter()
const recordName = (a) => { const c = a.clientId && db.clientById(a.clientId); return c ? clientName(c) : a.payload?.member ? fullName(a.payload.member) : a.payload?.name || '—' }
const source = () => {
  const me = db.sessionUserId; const ids = visibleUserIds()
  return db.approvals
    .filter((a) => isAdmin() || a.requestedBy === me || ids.includes(a.requestedBy) || (a.chain || []).some((s) => s.userId === me))
    .map((a) => {
      const step = a.status === 'Pending' ? currentStep(a) : null
      const since = step ? reachedCurrentLevelAt(a) : null
      return { id: a.id, a, record: recordName(a), category: (a.categories || [a.category]).join(', '), status: a.status, requestedBy: a.requestedBy, requestedByName: db.userById(a.requestedBy)?.name,
        requestedOn: a.requestedOn, approver: step?.userId || null, approverName: step ? db.userById(step.userId)?.name : '', level: step ? db.userById(step.userId)?.role : '',
        waitingDays: since ? Math.floor((Date.now() - since) / DAY) : null, tone: step ? approvalTone(a) : null }
    })
}
const L = useList(source, { searchKeys: ['record', 'requestedByName', 'approverName'], defaultSort: { key: 'requestedOn', dir: 'desc' } })
const quick = [
  { key: 'status', label: 'Status', options: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
  { key: 'category', label: 'Category', options: ['Name', 'Mobile', 'Email', 'Delete Mobile/Email', 'Group Member', 'New Prospect'] },
  { key: 'level', label: 'Waiting with', options: ['TL', 'VP', 'President', 'Admin'] },
]
const columns = [
  { key: 'record', label: 'Record', width: '200px' }, { key: 'category', label: 'Category' }, { key: 'status', label: 'Status' },
  { key: 'requestedBy', label: 'Requested By' }, { key: 'requestedOn', label: 'Requested On' }, { key: 'approver', label: 'Waiting With' }, { key: 'waitingDays', label: 'Waiting', align: 'right' },
]
const fields = columns.map((c) => ({ key: c.key === 'requestedBy' ? 'requestedByName' : c.key === 'approver' ? 'approverName' : c.key, label: c.label }))
const TONE = { amber: 'text-ink-amber-7', red: 'text-ink-red-6' }
const STATUS = { Pending: 'text-ink-amber-7', Approved: 'text-ink-green-7', Rejected: 'text-ink-red-6', Cancelled: 'text-ink-gray-5' }
const selection = ref([])
function open(r) {
  const a = r.a
  if (a.category === 'New Prospect') return router.push({ path: '/prospects', query: { review: a.id } })
  if (a.clientId) router.push({ path: `/record/${a.clientId}`, query: { tab: 'data', approval: a.id } })
}
const empty = computed(() => (L.silentIds.value ? 'No approval request matches' : 'No approval requests'))
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Approvals', to: '/approvals' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Record / name" :quick="quick" :filter-fields="fields" :sort-fields="fields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable v-model:selection="selection" :columns="columns" :rows="L.rows.value" :loading="L.loading.value" :empty-text="empty" empty-hint="Requests appear here when someone asks for a change that needs approval." @row-click="open">
      <template #cell-record="{ row }"><span class="font-medium text-ink-gray-9">{{ row.record }}</span></template>
      <template #cell-status="{ row }"><span :class="STATUS[row.status]">{{ row.status }}</span></template>
      <template #cell-requestedBy="{ row }"><UserChip :user-id="row.requestedBy" /></template>
      <template #cell-requestedOn="{ row }"><span class="text-sm text-ink-gray-7">{{ fmtDateTime(row.requestedOn) }}</span></template>
      <template #cell-approver="{ row }"><span v-if="row.approver" class="text-sm"><UserChip :user-id="row.approver" /> <span class="text-xs text-ink-gray-5">{{ row.level }}</span></span><span v-else class="text-ink-gray-4">-</span></template>
      <template #cell-waitingDays="{ row }"><span v-if="row.waitingDays != null" class="tabular-nums" :class="TONE[row.tone] || 'text-ink-gray-7'" :data-tone="row.tone || undefined">{{ row.waitingDays === 0 ? 'Today' : `${row.waitingDays} d` }}</span><span v-else class="text-ink-gray-4">-</span></template>
    </DataTable>
  </div>
</template>
