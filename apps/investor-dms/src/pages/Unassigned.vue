<script setup>
// Unassigned Investors (Admin only; UN-001..006, D02 §6, D06 §5; Fig 21931 / 22176 / 22202).
// Entry is system-only (UN-002). Admin assigns to an IS + destination Data Code (INV-009: fresh 12 months /
// fresh 90 days). Receiving IS gets N-14 "Bonus Investors".
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, Button, FormControl, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { PRODUCT_INTEREST } from '@/data/masters'
import { clientName, primaryMobile, cityState, assignUnassigned, adminJunk } from '@/services/lifecycle'
import { investmentSignals, shownInLists, signalMatch, signalQuick, SIGNAL_FIELDS, ADVISORS_FIELD } from '@/services/investorSignals'
import JunkDialog from '@/components/modals/JunkDialog.vue'
import { inr, inrShort, fmtDate, fmtMobile, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import StatusDot from '@/components/StatusDot.vue'
import AumCell from '@/components/cells/AumCell.vue'
import LastInvestmentCell from '@/components/cells/LastInvestmentCell.vue'

const db = useDb(); const router = useRouter()
const short = Object.fromEntries(PRODUCT_INTEREST.map((p) => [p.key, p.short]))
// Same style as Junk (product owner, 14 Nov 2026): the Admin decides whom to assign by value (AUM, total invested,
// how much is still invested), recency (last investment) and effort so far (advisors tried, calls).
const source = () => db.clients.filter((c) => c.stage === 'Unassigned' && shownInLists(c)).map((c) => ({
  id: c.id, cid: c.cid, name: clientName(c), mobile: primaryMobile(c),
  language: c.members[0].language || '-', product: (c.members[0].product || []).map((k) => short[k]).join(', '), productKeys: c.members[0].product || [],
  invStatus: c.invStatus, sourceIs: c.sourceIs, sourceName: db.userById(c.sourceIs)?.name, ...investmentSignals(c),
  totalCalls: c.totalCalls || 0, lastCallAt: c.lastCallAt || null,
  days: c.unassignedSince ? Math.max(0, Math.floor((Date.now() - c.unassignedSince) / DAY)) : 0, cityState: cityState(c),
}))
const DAYS = [{ label: 'Under 7 days', value: '0-7' }, { label: '7 – 30 days', value: '7-30' }, { label: '30 – 90 days', value: '30-90' }, { label: '90 days or more', value: '90+' }]
const inDays = (d, v) => { const [a, b] = v.split('-').map(Number); return v === '90+' ? d >= 90 : d >= a && d < b }
const { search, quickValues, advanced, sort, rows, silentIds, clearSilent, loading, refresh } = useList(source, {
  searchKeys: ['cid', 'name', 'mobile'],
  defaultSort: { key: 'days', dir: 'desc' }, // UN-004: longest waiting first
  quickMatch: {
    ...signalMatch,
    cityState: (r, v) => r.cityState.includes(v),
    product: (r, v) => r.productKeys.includes(v),
    days: (r, v) => inDays(r.days, v),
  },
})
const quick = computed(() => {
  const list = source()
  return [
    { key: 'invStatus', label: 'Inv Status', options: ['Prospect', 'Inactive'] },
    ...signalQuick(list, inrShort),
    { key: 'sourceIs', label: 'Source IS', multiple: true, searchable: true, options: [...new Set(list.map((r) => r.sourceIs).filter(Boolean))].map((id) => ({ label: db.userById(id)?.name || id, sub: db.userById(id)?.mhf_id, value: id })) },
    { key: 'days', label: 'Days Unassigned', multiple: true, options: DAYS },
    { key: 'cityState', label: 'City and State', multiple: true, searchable: true, options: [...new Set(list.map((r) => r.cityState.split(', ')[1]).filter(Boolean))].sort() },
    { key: 'product', label: 'Product Preference', multiple: true, options: PRODUCT_INTEREST.map((p) => ({ label: p.label, value: p.key })) },
  ]
})
const columns = [
  { key: 'cid', label: 'Client ID' }, { key: 'name', label: 'Client Name', width: '170px' },
  { key: 'mobile', label: 'Mobile Number' }, { key: 'language', label: 'Language' }, { key: 'invStatus', label: 'Inv Status' },
  { key: 'aum', label: 'AUM', align: 'right' },
  { key: 'lastInvAmount', label: 'Last Investment', width: '200px' }, { key: 'advisorsTried', label: 'Past IS', align: 'right' },
  { key: 'sourceIs', label: 'Source IS', width: '160px' }, { key: 'totalCalls', label: 'Calls' }, { key: 'days', label: 'Days Unassigned', align: 'right' },
]
// Filter and Sort: every part of a column is a field of its own (Calls / Last Called; Last Investment).
// No Data Code: an Unassigned investor is not in any Data Code (product owner, 17 Nov 2026).
const filterFields = [
  { key: 'cid', label: 'Client ID' }, { key: 'name', label: 'Client Name' }, { key: 'mobile', label: 'Mobile Number' },
  { key: 'language', label: 'Language' }, { key: 'cityState', label: 'City & State' }, { key: 'invStatus', label: 'Inv Status' }, ...SIGNAL_FIELDS, ADVISORS_FIELD,
  { key: 'sourceName', label: 'Source IS' }, { key: 'totalCalls', label: 'Total Calls' }, { key: 'lastCallAt', label: 'Last Called Date' }, { key: 'days', label: 'Days Unassigned' },
]
const sortFields = filterFields

// ---- Assign To (UN-005 / UN-006; Fig 22202) ----
const selection = ref([])
const junkOpen = ref(false) // D06 §5: bar offers Assign to and Junk
function doJunk(comment) { adminJunk(selection.value, comment); toast.success('Moved to Junk'); selection.value = [] }
const assignOpen = ref(false)
const assignTo = ref('')
const dataCode = ref('')
const specialists = computed(() => db.users.filter((u) => u.active && u.role !== 'Admin').map((u) => ({ label: `${u.name} - ${u.mhf_id}`, value: u.id })))
const codeCount = (code) => db.clients.filter((c) => c.stage === 'Investor' && c.dataCode === code).length
const codes = computed(() => {
  const u = db.userById(assignTo.value); if (!u) return []
  return (u.dataCodes || []).map((code, i) => ({ code, count: codeCount(code), self: i === 0 }))
})
watch(assignTo, () => { dataCode.value = codes.value[0]?.code || '' })
function openAssign() { assignTo.value = ''; dataCode.value = ''; assignOpen.value = true }
function doAssign() {
  if (!assignTo.value || !dataCode.value) return
  const n = selection.value.length
  assignUnassigned(selection.value, assignTo.value, dataCode.value)
  toast.success(`${n} investor(s) assigned to ${db.userById(assignTo.value).name} (${dataCode.value})`)
  selection.value = []; assignOpen.value = false
}
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Unassigned Investors', to: '/unassigned' }, { label: 'List', chevron: true }]" />
    <JunkDialog v-model:open="junkOpen" :count="selection.length" @confirm="doJunk" />
    <ListToolbar v-model:search="search" v-model:quick-values="quickValues" v-model:advanced="advanced" v-model:sort="sort"
      placeholder="Client ID/Name/Mobile" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="refresh" />
    <SilentFilterBar v-if="silentIds" :count="rows.length" @clear="clearSilent" />
    <DataTable :bulk-options="[{ label: 'Assign to', icon: 'lucide-user-plus', onClick: openAssign }, { label: 'Junk', icon: 'lucide-trash-2', onClick: () => (junkOpen = true) }]" v-model:selection="selection" :columns="columns" :rows="rows" :loading="loading" selectable
      empty-text="No unassigned investors" empty-hint="Investors arrive here only through the system timers (UN-002)." @row-click="(r) => router.push(`/record/${r.id}`)">
      <template #cell-cid="{ row }">
        <span class="tabular text-ink-gray-7">{{ row.cid || '-' }}</span>
      </template>
      <template #cell-name="{ row }"><UserChip :name="row.name" full /></template>
      <template #cell-mobile="{ row }"><span class="tabular">{{ fmtMobile(row.mobile) }}</span></template>
      <template #cell-invStatus="{ row }"><StatusDot :label="row.invStatus" :theme="row.invStatus === 'Prospect' ? 'blue' : 'gray'" hollow /></template>
      <template #cell-aum="{ row }"><AumCell :row="row" /></template>
      <template #cell-lastInvAmount="{ row }"><LastInvestmentCell :row="row" /></template>
      <template #cell-advisorsTried="{ row }"><span class="tabular">{{ row.advisorsTried || '-' }}</span></template>
      <template #cell-sourceIs="{ row }"><UserChip v-if="row.sourceIs" :user-id="row.sourceIs" /><span v-else class="text-ink-gray-5">-</span></template>
      <template #cell-totalCalls="{ row }">
        <div class="leading-tight"><div class="tabular">{{ row.totalCalls }} call{{ row.totalCalls === 1 ? '' : 's' }}</div><div class="text-xs text-ink-gray-5">{{ row.lastCallAt ? `last ${fmtDate(row.lastCallAt)}` : row.totalCalls ? '' : 'never called' }}</div></div>
      </template>
      <template #cell-days="{ row }"><span class="tabular">{{ row.days }}</span></template>
    </DataTable>

    <Dialog v-model:open="assignOpen" size="md">
      <template #title><h3 class="text-lg font-semibold uppercase tracking-wide text-ink-gray-9">Assign to</h3></template>
      <div class="space-y-4">
        <p class="text-p-sm text-ink-gray-6">{{ selection.length }} investor(s) selected. All go to the same specialist and Data Code. Inactive investors get a fresh 12 months, Prospect Investors a fresh 90 days (INV-009).</p>
        <FormControl v-model="assignTo" type="select" label="ASSIGNED TO" required :options="specialists" placeholder="Select specialist" />
        <div v-if="assignTo">
          <div class="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-gray-6">Select destination data code</div>
          <div v-if="!codes.length" class="rounded-4 bg-surface-red-2 px-3 py-2 text-sm text-ink-red-7">This specialist has no Data Code, so nothing can be selected. A Data Code is issued at profile creation.</div>
          <label v-for="c in codes" :key="c.code" class="mb-1 flex cursor-pointer items-center gap-3 rounded-4 border px-3 py-2 text-base hover:bg-surface-gray-1" :class="dataCode === c.code && 'border-outline-gray-5 bg-surface-gray-1'">
            <input v-model="dataCode" type="radio" :value="c.code" class="text-ink-gray-9 focus:ring-0" />
            <span class="flex-1 tabular">{{ c.code }}<span v-if="c.self" class="ml-2 rounded-4 bg-surface-blue-2 px-1.5 py-0.5 text-xs text-ink-blue-7">Self</span></span>
            <span class="text-sm text-ink-gray-5">{{ c.count }}</span>
          </label>
        </div>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" @click="assignOpen = false" />
          <Button variant="solid" label="ASSIGN" :disabled="!assignTo || !dataCode" @click="doAssign" />
        </div>
      </template>
    </Dialog>
  </div>
</template>
