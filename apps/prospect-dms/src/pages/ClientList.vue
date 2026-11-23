<script setup>
// Prospects / Leads / Investor Family lists (D02 §4.4; X03 PROSPECT; Fig 8069; split prompt §6.4).
// Prospects / Leads: default sort Rem. Days ascending (PL-007). Investor Family: Converted On, newest first; no timers,
// no bulk actions (owner follows the family log F2). Supervisor-only columns for TL+ (GEN-006).
// Investor Family columns (product owner, 13 Nov 2026) are built around the CONTACT PERSON: the first member who is
// not an investor yet (the primary is usually an investor, with details removed). Family ID · Contact person ·
// Mobile No. · Remaining (not yet investors, "2 of 4") · Call Status · Last Called · Upcoming Event · Converted On ·
// Assigned To (TL+). A family where everyone is an investor stays in the list ("All converted").
// Product owner, 23 Nov 2026: a family whose last member has been accepted by Investor DMS leaves this list (the
// advisor who converted gets a congratulation notification). Quick filters (4): Call Status, Last Called and Upcoming
// Event (date filters: 30/60/90-day presets or a custom date), Assigned to (TL+) or Converted On.
import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button, Dropdown, Badge, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { PRODUCT_INTEREST, LANGUAGES } from '@/data/masters'
import { visibleUserIds, isSupervisor, isAdmin, hasSwitch } from '@/services/access'
import { clientName, fullName, primaryMobile, remDays, cityState, moveToLead, adminJunk, adminAssign, adminRelease } from '@/services/lifecycle'
import JunkDialog from '@/components/modals/JunkDialog.vue'
import { myPendingApprovals } from '@/services/approvals'
import { fmtDateTime, fmtDate, fmtMobile, now } from '@/utils/format'
import { isFullyConverted, isInvestorMember, workableMembers, MASK, isFamilyComplete } from '@/services/family'
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
const title = { Prospect: 'Prospects', Lead: 'Leads', 'Investor Family': 'Investor Family' }[props.stage]
const isFamily = props.stage === 'Investor Family'

const upcomingEvent = (c) => db.events.filter((e) => e.clientId === c.id && !e.cancelled && e.start > now()).sort((a, b) => a.start - b.start)[0]?.start || null
/** Investor Family: the first member who is not an investor (the person the specialist still works with). */
const contactOf = (c) => workableMembers(c)[0] || null
const DAY = 86400000
const sod = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const daysAgo = (t) => (t ? Math.round((sod(Date.now()) - sod(t)) / DAY) : null) // calendar days
const source = () => {
  const ids = visibleUserIds()
  // Investor Family: a complete family (last member accepted by Investor DMS) is no longer listed
  return db.clients.filter((c) => c.stage === props.stage && (isAdmin() || ids.includes(c.assignedTo)) && !(isFamily && isFamilyComplete(c))).map((c) => {
    const ct = isFamily ? contactOf(c) : null
    return {
    lastCalledDays: daysAgo(c.lastCallAt),
    id: c.id, c, name: clientName(c), mobile: primaryMobile(c), primaryInvestor: isInvestorMember(c.members[0]), language: c.members[0].language || '-',
    familyId: c.familyId, convertedOn: c.convertedAt || null, fully: isFullyConverted(c),
    contact: ct ? fullName(ct) : '', contactRel: ct?.relationship || '', contactMobile: ct?.contacts?.find((x) => x.mobile && !x.pendingAdd)?.mobile || '',
    contactCity: ct?.addresses?.[0]?.city || '', remaining: workableMembers(c).length, total: c.members.length,
    allNames: c.members.map(fullName).join(' '),
    product: (c.members[0].product || []).map((k) => short[k]).join(', '), productKeys: c.members[0].product || [],
    callStatus: c.callStatus, lastCalled: c.lastCallAt, event: upcomingEvent(c), rem: remDays(c),
    assignedTo: c.assignedTo, assignedName: db.userById(c.assignedTo)?.name, city: isFamily ? ct?.addresses?.[0]?.city : c.members[0].addresses?.[0]?.city, cityState: cityState(c),
  }
  })
}
const L = useList(source, {
  searchKeys: isFamily ? ['allNames', 'contactMobile', 'familyId'] : ['name', 'mobile', 'familyId'],
  defaultSort: isFamily ? { key: 'convertedOn', dir: 'desc' } : { key: 'rem', dir: 'asc' },
  quickMatch: {
    product: (r, v) => r.productKeys.includes(v), fully: (r, v) => (v === 'Yes') === r.fully,
    convertedOn: (r, v) => r.convertedOn && r.convertedOn >= v.from && r.convertedOn <= v.to,
    lastCalled: (r, v) => r.lastCalled && r.lastCalled >= v.from && r.lastCalled <= v.to,
    event: (r, v) => r.event && r.event >= v.from && r.event <= v.to,
  },
})
const { search, quickValues, advanced, sort, rows, silentIds, clearSilent, loading, refresh } = L
// Last Called (Prospects, Leads and Investor Family; product owner, 23 Nov 2026): the date, then how many days ago (amber over 30 days, red over 60: the business periods)
const ageClass = (d) => (d > 60 ? 'text-ink-red-6' : d > 30 ? 'text-ink-amber-7' : 'text-ink-gray-5')
const ageText = (d) => (d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`)
// date-filter presets: Last Called in the 30 / 60 / 90-day business periods, Upcoming Event looking ahead (plus Custom)
const sodNow = () => sod(Date.now())
const LAST_CALLED = {
  d30: ['Within 30 days', () => [sodNow() - 30 * DAY, sodNow() + DAY - 1]],
  d60: ['31 - 60 days ago', () => [sodNow() - 60 * DAY, sodNow() - 31 * DAY + DAY - 1]],
  d90: ['61 - 90 days ago', () => [sodNow() - 90 * DAY, sodNow() - 61 * DAY + DAY - 1]],
  over90: ['Over 90 days ago', () => [0, sodNow() - 91 * DAY + DAY - 1]],
}
const UPCOMING = {
  today: ['Today', () => [Date.now(), sodNow() + DAY - 1]],
  next7: ['Next 7 days', () => [Date.now(), sodNow() + 7 * DAY - 1]],
  next30: ['Next 30 days', () => [Date.now(), sodNow() + 30 * DAY - 1]],
}

const assignedQuick = () => ({ key: 'assignedTo', label: 'Assigned to', multiple: true, searchable: true, options: db.users.filter((u) => visibleUserIds().includes(u.id) && u.role !== 'Admin').map((u) => ({ label: u.name, sub: u.mhf_id, value: u.id })) })
const quick = computed(() => {
  // Investor Family (product owner, 23 Nov 2026): four quick filters; the rest are under Filter
  if (isFamily) return [
    { key: 'callStatus', label: 'Last Call Status', options: ['Followup', 'Not Interested', 'Wrong Number', 'Disconnected'] },
    { key: 'lastCalled', label: 'Last Called', date: true, presets: LAST_CALLED },
    { key: 'event', label: 'Upcoming Event', date: true, presets: UPCOMING, future: true },
    isSupervisor() ? assignedQuick() : { key: 'convertedOn', label: 'Converted On', date: true },
  ]
  return [
    { key: 'language', label: 'Language', multiple: true, searchable: true, options: LANGUAGES },
    { key: 'product', label: 'Product Interest', multiple: true, options: PRODUCT_INTEREST.map((p) => ({ label: p.label, value: p.key })) },
    { key: 'callStatus', label: 'Call Status', options: ['Followup', 'Not Interested', 'Wrong Number', 'Disconnected'] },
    ...(isSupervisor() ? [assignedQuick()] : []),
  ]
})
const columns = computed(() => {
  const sup = isSupervisor()
  if (isFamily) return [
    { key: 'familyId', label: 'Family ID' }, { key: 'contact', label: 'Contact person', width: '220px' }, { key: 'contactMobile', label: 'Mobile No.' },
    { key: 'remaining', label: 'Remaining', align: 'right' },
    { key: 'callStatus', label: 'Last Call Status' }, { key: 'lastCalled', label: 'Last Called' }, { key: 'event', label: 'Upcoming Event' },
    { key: 'convertedOn', label: 'Converted On' }, ...(sup ? [{ key: 'assignedTo', label: 'Assigned To' }] : []),
  ]
  return [
    { key: 'name', label: 'Name', width: '190px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'language', label: 'Language' }, { key: 'product', label: 'Product Interest' },
    { key: 'callStatus', label: 'Last Call Status' }, { key: 'lastCalled', label: 'Last Called' }, { key: 'event', label: 'Upcoming Event' }, { key: 'rem', label: 'Rem. Days', align: 'right' },
    ...(sup ? [{ key: 'assignedTo', label: 'Assigned to' }] : []),
  ]
})
const filterFields = computed(() => columns.value.map((c) => ({ key: c.key === 'assignedTo' ? 'assignedName' : c.key, label: c.label })))
const sortFields = computed(() => columns.value.map((c) => ({ key: c.key, label: c.label })))
const statusTheme = { Followup: 'blue', 'Not Interested': 'red', Disconnected: 'gray', 'Wrong Number': 'amber' }
const remClass = (d) => (d <= 7 ? 'text-ink-red-6 font-semibold' : d <= 30 ? 'text-ink-amber-7' : '')

// Create Prospect (PL-001; D06 §9.6 switch "Create Prospect")
const canCreate = computed(() => props.stage === 'Prospect' && hasSwitch('create_prospect'))
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
  try { adminAssign(selection.value, advisorId); toast.success(`${selection.value.length} record(s) assigned to ${db.userById(advisorId).name}`); selection.value = [] }
  catch (e) { toast.error(e.message) }
}
const junkOpen = ref(false)
function doJunk(comment) { try { adminJunk(selection.value, comment); toast.success('Moved to Junk'); selection.value = [] } catch (e) { toast.error(e.message) } }
// D02 §4.12 (Prospects/Leads: assign, move Prospects to Lead, release, Junk). Investor Family: Junk only (Admin)
const bulkMenu = computed(() => (isFamily ? [{ label: 'Junk', icon: 'lucide-trash-2', theme: 'red', onClick: () => (junkOpen.value = true) }] : [
  { label: 'Assign to', icon: 'lucide-user-plus', onClick: () => (pickOpen.value = true) },
  ...(props.stage === 'Prospect' ? [{ label: 'Move to Lead', icon: 'lucide-arrow-right', onClick: () => { selection.value.forEach((id) => moveToLead(db.clientById(id))); toast.success('Moved to Lead'); selection.value = [] } }] : []),
  { label: 'Release to Pool', icon: 'lucide-undo-2', onClick: () => dialog.confirm({ title: 'Release to Pool?', message: `${selection.value.length} record(s) will return to the Pool.`, onConfirm: () => { adminRelease(selection.value); toast.success('Released to Pool'); selection.value = [] } }) },
  { label: 'Junk', icon: 'lucide-trash-2', theme: 'red', onClick: () => (junkOpen.value = true) },
]))
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
      <template #cell-name="{ row }"><UserChip :name="row.name" /><span class="sr-only">{{ row.name }}</span><span v-if="row.primaryInvestor" class="ml-1.5 rounded-4 border border-outline-green-3 bg-surface-green-1 px-1 text-2xs font-semibold text-ink-green-7">INVESTOR</span></template>
      <template #cell-mobile="{ row }"><span class="tabular" :class="row.primaryInvestor && 'text-ink-gray-5'">{{ row.primaryInvestor ? MASK : fmtMobile(row.mobile) }}</span></template>
      <template #cell-familyId="{ row }"><span class="tabular text-ink-gray-7">{{ row.familyId }}</span><span v-if="row.fully" class="ml-1.5 rounded-4 bg-surface-amber-1 px-1.5 text-2xs text-ink-amber-7">Waiting for Investor DMS</span></template>
      <template #cell-contact="{ row }">
        <span v-if="row.contact" class="flex min-w-0 items-center gap-1.5"><UserChip :name="row.contact" full /><span v-if="row.contactRel" class="shrink-0 text-sm text-ink-gray-5">· {{ row.contactRel }}</span></span>
        <span v-else class="text-sm text-ink-gray-5">All converted</span>
      </template>
      <template #cell-contactMobile="{ row }"><span class="tabular" :class="!row.contactMobile && 'text-ink-gray-5'">{{ row.contactMobile ? fmtMobile(row.contactMobile) : row.contact ? '-' : 'All converted' }}</span></template>
      <template #cell-remaining="{ row }"><span class="tabular" :class="!row.remaining && 'text-ink-gray-5'" :title="`${row.remaining} of ${row.total} members are not investors yet`">{{ row.remaining }} of {{ row.total }}</span></template>
      <template #cell-convertedOn="{ row }"><span class="text-sm text-ink-gray-7">{{ row.convertedOn ? fmtDate(row.convertedOn) : '-' }}</span></template>
      <template #cell-product="{ row }"><span class="text-ink-gray-7">{{ row.product || '-' }}</span></template>
      <template #cell-callStatus="{ row }"><StatusDot :label="row.callStatus" :theme="statusTheme[row.callStatus]" /></template>
      <template #cell-lastCalled="{ row }">
        <span class="block leading-tight" data-testid="last-called">
          <template v-if="row.lastCalled">
            <span class="block tabular text-ink-gray-8">{{ fmtDate(row.lastCalled) }}</span>
            <span class="block text-xs" :class="ageClass(row.lastCalledDays)" :data-days="row.lastCalledDays">{{ ageText(row.lastCalledDays) }}</span>
          </template>
          <span v-else class="text-ink-gray-5">-</span>
        </span>
      </template>
      <template #cell-event="{ row }"><span class="text-sm text-ink-gray-7">{{ row.event ? fmtDateTime(row.event) : '-' }}</span></template>
      <template #cell-rem="{ row }"><span class="tabular" :class="remClass(row.rem)">{{ row.rem ?? '-' }}</span></template>
      <template #cell-assignedTo="{ row }"><UserChip :user-id="row.assignedTo" /></template>
    </DataTable>
    <PersonFormModal v-model:open="createOpen" mode="prospect" />
    <PersonFormModal v-if="reviewReq" v-model:open="reviewOpen" mode="prospect" :request="reviewReq" />
    <AdvisorPicker v-model:open="pickOpen" :count="selection.length" title="Assign to" @pick="bulkReassign" />
    <JunkDialog v-model:open="junkOpen" :count="selection.length" @confirm="doJunk" />
  </div>
</template>
