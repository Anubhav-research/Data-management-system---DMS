<script setup>
// Prospects / Leads / Investors lists (D02 §4.4, §5.5; X03 PROSPECT, INVESTOR; Fig 8069, 13508).
// Default sort Rem. Days ascending (PL-007). Supervisor-only columns for TL+ (GEN-006).
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, Dropdown, Badge, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { PRODUCT_INTEREST, INV_STATUS, LANGUAGES } from '@/data/masters'
import { visibleUserIds, isSupervisor, isAdmin, hasSwitch } from '@/services/access'
import { clientName, primaryMobile, remDays, cityState, adminAssign, familyExtras } from '@/services/lifecycle'
import JunkDialog from '@/components/modals/JunkDialog.vue'
import { myPendingApprovals } from '@/services/approvals'
import { fmtDateTime, fmtDate, timeAgo, inr, inrShort, fmtMobile, now } from '@/utils/format'
import { investmentSignals, shownInLists, signalMatch, signalQuick, SIGNAL_FIELDS, ADVISORS_FIELD } from '@/services/investorSignals'
import AumCell from '@/components/cells/AumCell.vue'
import LastInvestmentCell from '@/components/cells/LastInvestmentCell.vue'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import StatusDot from '@/components/StatusDot.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import PersonFormModal from '@/components/modals/PersonFormModal.vue'
import AdvisorPicker from '@/components/modals/AdvisorPicker.vue'

const props = defineProps({ stage: String })
const db = useDb(); const router = useRouter(); const route = useRoute()
const short = Object.fromEntries(PRODUCT_INTEREST.map((p) => [p.key, p.short]))
const title = { Prospect: 'Prospects', Lead: 'Leads', Investor: 'Investors' }[props.stage]

const upcomingEvent = (c) => db.events.filter((e) => e.clientId === c.id && !e.cancelled && e.start > now()).sort((a, b) => a.start - b.start)[0]?.start || null
const upcomingDeal = (c) => db.deals.filter((d) => d.clientId === c.id && d.status === 'Scheduled').sort((a, b) => a.start - b.start)[0]?.start || null
const source = () => {
  const ids = visibleUserIds()
  return db.clients.filter((c) => c.stage === props.stage && shownInLists(c) && (isAdmin() || ids.includes(c.assignedTo))).map((c) => ({
    id: c.id, c, name: clientName(c), mobile: primaryMobile(c), language: c.members[0].language || '-',
    product: (c.members[0].product || []).map((k) => short[k]).join(', '), productKeys: c.members[0].product || [],
    callStatus: c.callStatus, lastCalled: c.lastCallAt, event: upcomingEvent(c), deal: upcomingDeal(c), rem: remDays(c),
    assignedTo: c.assignedTo, assignedName: db.userById(c.assignedTo)?.name, city: c.members[0].addresses?.[0]?.city, cityState: cityState(c),
    invStatus: c.invStatus, sourceIs: c.sourceIs, sourceName: db.userById(c.sourceIs)?.name, dataCode: c.dataCode, cid: c.cid,
    ...investmentSignals(c), // same investment signals as Unassigned and Junk (services/investorSignals.js)
  }))
}
const L = useList(source, {
  searchKeys: ['name', 'mobile', 'cid'],
  defaultSort: { key: 'rem', dir: 'asc' },
  quickMatch: { ...signalMatch, product: (r, v) => r.productKeys.includes(v) },
})
const { search, quickValues, advanced, sort, rows, silentIds, clearSilent, loading, refresh } = L

// Investors: the 4-5 most used filters stay outside - Inv Status, Call Status, AUM, Last Investment, and Assigned to for
// team leaders and above; every other field is in Filter (product owner, 21 Nov 2026)
const quick = computed(() => (props.stage === 'Investor' ? [
  { key: 'invStatus', label: 'Inv Status', options: INV_STATUS },
  { key: 'callStatus', label: 'Call Status', options: ['Followup', 'Not Interested', 'Passive Communication', 'Interested', 'Disconnected'] },
  ...signalQuick(source(), inrShort, { advisors: false }).filter((q) => ['aum', 'yearsSinceInv'].includes(q.key)),
  ...(isSupervisor() ? [{ key: 'assignedTo', label: 'Assigned to', multiple: true, searchable: true, options: db.users.filter((u) => visibleUserIds().includes(u.id) && u.role !== 'Admin').map((u) => ({ label: u.name, sub: u.mhf_id, value: u.id })) }] : []),
] : [
  { key: 'language', label: 'Language', multiple: true, searchable: true, options: LANGUAGES },
  { key: 'product', label: 'Product Interest', multiple: true, options: PRODUCT_INTEREST.map((p) => ({ label: p.label, value: p.key })) },
  { key: 'callStatus', label: 'Call Status', options: ['Followup', 'Not Interested', 'Wrong Number', 'Disconnected'] },
  ...(isSupervisor() ? [{ key: 'assignedTo', label: 'Assigned to', multiple: true, searchable: true, options: db.users.filter((u) => visibleUserIds().includes(u.id) && u.role !== 'Admin').map((u) => ({ label: u.name, sub: u.mhf_id, value: u.id })) }] : []),
]))
const columns = computed(() => {
  const sup = isSupervisor()
  if (props.stage === 'Investor') return [
    // same style as Junk / Unassigned (product owner, 14 Nov 2026): related values share a cell, and each part of a
    // cell is its own field in Filter and Sort (filterFields below)
    { key: 'cid', label: 'Client ID' }, { key: 'name', label: 'Name', width: '170px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'language', label: 'Language' },
    { key: 'product', label: 'Product Interest' }, { key: 'invStatus', label: 'Inv Status' }, { key: 'aum', label: 'AUM', align: 'right' },
    { key: 'lastInvAmount', label: 'Last Investment', width: '200px' },
    { key: 'callStatus', label: 'Last Call Status', width: '170px' }, { key: 'event', label: 'Upcoming', width: '190px' },
    { key: 'rem', label: 'Rem. Days', align: 'right' }, ...(sup ? [{ key: 'sourceIs', label: 'Source IS' }, { key: 'assignedTo', label: 'Assigned to' }] : []),
  ]
  return [
    { key: 'name', label: 'Name', width: '190px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'language', label: 'Language' }, { key: 'product', label: 'Product Interest' },
    { key: 'callStatus', label: 'Last Call Status' }, { key: 'lastCalled', label: 'Last called' }, { key: 'event', label: 'Upcoming Event' }, { key: 'rem', label: 'Rem. Days', align: 'right' },
    ...(sup ? [{ key: 'assignedTo', label: 'Assigned to' }] : []),
  ]
})
const filterFields = computed(() => {
  if (props.stage !== 'Investor') return columns.value.map((c) => ({ key: c.key === 'assignedTo' ? 'assignedName' : c.key, label: c.label }))
  const sup = isSupervisor()
  return [
    { key: 'cid', label: 'Client ID' }, ...(sup ? [{ key: 'dataCode', label: 'Data Code' }] : []), { key: 'name', label: 'Name' }, { key: 'mobile', label: 'Mobile No.' },
    { key: 'language', label: 'Language' }, { key: 'cityState', label: 'City & State' }, { key: 'product', label: 'Product Interest' }, { key: 'invStatus', label: 'Inv Status' },
    ...SIGNAL_FIELDS, { key: 'callStatus', label: 'Last Call Status' }, { key: 'lastCalled', label: 'Last Called' },
    { key: 'event', label: 'Upcoming Event' }, { key: 'deal', label: 'Upcoming Deal' }, { key: 'rem', label: 'Rem. Days' },
    ...(sup ? [{ ...ADVISORS_FIELD, label: 'IS So Far' }, { key: 'sourceName', label: 'Source IS' }, { key: 'assignedName', label: 'Assigned to' }] : []),
  ]
})
const sortFields = computed(() => (props.stage === 'Investor' ? filterFields.value : columns.value.map((c) => ({ key: c.key, label: c.label }))))
const statusTheme = { Active: 'green', Inactive: 'gray', Prospect: 'blue', Followup: 'blue', Interested: 'green', 'Not Interested': 'red', 'Passive Communication': 'violet', Disconnected: 'gray', 'Wrong Number': 'amber' }
const remClass = (d) => (d <= 7 ? 'text-ink-red-6 font-semibold' : d <= 30 ? 'text-ink-amber-7' : '')

// Create Prospect (PL-001; D06 §9.6 switch "Create Prospect")
const canCreate = computed(() => false) // records arrive only by the handover, the migration or a platform investment (split prompt §7.2.1)
const createOpen = ref(false)
// Approver: pending New Prospect requests (N-21 opens review mode)
const reviewReq = ref(null); const reviewOpen = ref(false)
const pendingNew = computed(() => (props.stage === 'Prospect' ? myPendingApprovals().filter((a) => a.category === 'New Prospect') : []))
function openReview(req) { reviewReq.value = req; reviewOpen.value = true }
onMounted(() => { if (route.query.review) { const r = db.approvals.find((a) => a.id === route.query.review); if (r) openReview(r) } })
const myRequests = computed(() => db.approvals.filter((a) => a.category === 'New Prospect' && a.requestedBy === db.sessionUserId && a.status === 'Pending'))

// Admin bulk actions (X04 BULK_ACTIONS, D06 §6.2.1)
const selection = ref([])
const pickOpen = ref(false)
function bulkReassign(advisorId) {
  try {
    const extra = familyExtras(selection.value) // DECISION-20: other groups of the same family move together
    adminAssign(selection.value, advisorId)
    if (extra.length) toast.info(`${extra.length} more group(s) of the same family moved with them (DECISION-20).`)
    toast.success(`${selection.value.length} record(s) assigned to ${db.userById(advisorId).name}`); selection.value = [] }
  catch (e) { toast.error(e.message) }
}
const junkOpen = ref(false)
function doJunk() {} // no Junk from the Investor list
// Investors: Assign to only. No Release to Pool (no path back to Prospect DMS) and no Junk (only from Unassigned) - split prompt §7.2.2
const bulkMenu = computed(() => [
  { label: 'Assign to', icon: 'lucide-user-plus', onClick: () => (pickOpen.value = true) },
])
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: title, to: route.path }, { label: 'List', chevron: true }]">
      <template #right>
        <Button v-if="canCreate" variant="solid" icon-left="lucide-plus" label="Create" @click="createOpen = true" />
      </template>
    </PageHeader>
    <div v-if="pendingNew.length" class="flex flex-wrap items-center gap-2 border-b bg-surface-amber-1 px-5 py-2 text-sm text-ink-amber-8">
      <span class="lucide-badge-check size-4" />{{ pendingNew.length }} new Prospect request(s) pending your approval:
      <Button v-for="r in pendingNew" :key="r.id" size="sm" :label="`Review ${r.payload.client.members[0].first_name}`" @click="openReview(r)" />
    </div>
    <div v-if="myRequests.length" class="flex flex-wrap items-center gap-2 border-b bg-surface-gray-1 px-5 py-1.5 text-sm text-ink-gray-6">
      <span class="lucide-hourglass size-3.5" />Your Prospect requests awaiting approval:
      <button v-for="r in myRequests" :key="r.id" class="underline" @click="openReview(r)">{{ r.payload.client.members[0].first_name }}</button>
    </div>
    <ListToolbar v-model:search="search" v-model:quick-values="quickValues" v-model:advanced="advanced" v-model:sort="sort"
      placeholder="Search Name or Mobile" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="refresh" />
    <SilentFilterBar v-if="silentIds" :count="rows.length" @clear="clearSilent" />
    <DataTable :bulk-options="bulkMenu" v-model:selection="selection" :columns="columns" :rows="rows" :loading="loading" :selectable="isAdmin()"
      :empty-text="`No ${title.toLowerCase()} found`" @row-click="(r) => router.push(`/record/${r.id}`)">
      <template #cell-name="{ row }"><UserChip :name="row.name" full /><span class="sr-only">{{ row.name }}</span></template>
      <template #cell-mobile="{ row }"><span class="tabular">{{ fmtMobile(row.mobile) }}</span></template>
      <template #cell-product="{ row }"><span class="text-ink-gray-7">{{ row.product || '-' }}</span></template>
      <template #cell-callStatus="{ row }">
        <div v-if="stage === 'Investor'" class="leading-tight">
          <StatusDot v-if="row.callStatus" :label="row.callStatus" :theme="statusTheme[row.callStatus]" /><span v-else class="text-ink-gray-5">-</span>
          <div class="text-xs text-ink-gray-5">{{ row.lastCalled ? timeAgo(row.lastCalled) : 'never called' }}</div>
        </div>
        <StatusDot v-else :label="row.callStatus" :theme="statusTheme[row.callStatus]" />
      </template>
      <template #cell-invStatus="{ row }"><StatusDot :label="row.invStatus" :theme="statusTheme[row.invStatus]" :hollow="row.invStatus !== 'Active'" /></template>
      <template #cell-lastCalled="{ row }"><span class="text-ink-gray-7">{{ row.lastCalled ? timeAgo(row.lastCalled) : '-' }}</span></template>
      <template #cell-event="{ row }">
        <div v-if="stage === 'Investor'" class="leading-tight text-sm">
          <div v-if="row.event" class="text-ink-gray-7"><span class="text-ink-gray-5">Event </span>{{ fmtDateTime(row.event) }}</div>
          <div v-if="row.deal" class="text-ink-gray-7"><span class="text-ink-gray-5">Deal </span>{{ fmtDateTime(row.deal) }}</div>
          <span v-if="!row.event && !row.deal" class="text-ink-gray-5">-</span>
        </div>
        <span v-else class="text-sm text-ink-gray-7">{{ row.event ? fmtDateTime(row.event) : '-' }}</span>
      </template>
      <template #cell-deal="{ row }"><span class="text-sm text-ink-gray-7">{{ row.deal ? fmtDateTime(row.deal) : '-' }}</span></template>
      <template #cell-lastInvDate="{ row }">{{ row.lastInvDate ? fmtDate(row.lastInvDate) : '-' }}</template>
      <template #cell-aum="{ row }"><AumCell :row="row" /></template>
      <template #cell-lastInvAmount="{ row }"><LastInvestmentCell :row="row" /></template>
      <template #cell-cid="{ row }">
        <div class="leading-tight"><div class="tabular text-ink-gray-7">{{ row.cid || '-' }}</div><div v-if="isSupervisor()" class="text-xs tabular text-ink-gray-5" title="Data Code">{{ row.dataCode || '-' }}</div></div>
      </template>
      <template #cell-dataCode="{ row }"><span class="text-ink-gray-6 tabular">{{ row.dataCode || '-' }}</span></template>
      <template #cell-rem="{ row }"><span class="tabular" :class="remClass(row.rem)">{{ row.rem ?? '-' }}</span></template>
      <template #cell-sourceIs="{ row }"><UserChip :user-id="row.sourceIs" /></template>
      <template #cell-assignedTo="{ row }"><UserChip :user-id="row.assignedTo" /></template>
    </DataTable>
    <PersonFormModal v-model:open="createOpen" mode="prospect" />
    <PersonFormModal v-if="reviewReq" v-model:open="reviewOpen" mode="prospect" :request="reviewReq" />
    <AdvisorPicker v-model:open="pickOpen" :count="selection.length" title="Assign to" @pick="bulkReassign" />
    <JunkDialog v-model:open="junkOpen" :count="selection.length" @confirm="doJunk" />
  </div>
</template>
