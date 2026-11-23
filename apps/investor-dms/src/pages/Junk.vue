<script setup>
// Junk folder (Admin only; D06 §6.4-6.5; Fig 22599). Records are never deleted (D06 §1.3).
// Bulk: Restore to Unassigned Investors. (Pool, Prospects and Leads live in Prospect DMS.)
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { clientName, primaryMobile, cityState, restoreFromJunk } from '@/services/lifecycle'
import { investmentSignals, shownInLists, signalMatch, signalQuick, SIGNAL_FIELDS, ADVISORS_FIELD } from '@/services/investorSignals'
import { fmtDate, inr, inrShort, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import AumCell from '@/components/cells/AumCell.vue'
import LastInvestmentCell from '@/components/cells/LastInvestmentCell.vue'

const db = useDb(); const router = useRouter()
// The page answers one question: 'is this investor worth trying again?' (product owner, 14 Nov 2026). The signals:
//   value      - AUM today and the total ever invested; AUM / total = how much money is still with Money Honey
//   recency    - how long since the last investment, and in what product
//   effort     - how many specialists already held them, and why they were junked
// The investment signals are shared with the Investors and Unassigned lists (services/investorSignals.js).
const source = () => db.clients.filter((c) => c.stage === 'Junk' && shownInLists(c)).map((c) => ({
  id: c.id, cid: c.cid || '-', name: clientName(c), mobile: primaryMobile(c), cityState: cityState(c), ...investmentSignals(c),
  advisorId: c.sourceIs, advisorName: db.userById(c.sourceIs)?.name || null, prevDataCode: c.prevDataCode || null,
  movedOn: c.movedOn, movedBy: c.movedBy, reason: c.junkComment || null,
}))
const { search, quickValues, advanced, sort, rows, loading, refresh } = useList(source, {
  searchKeys: ['cid', 'name', 'mobile'],
  defaultSort: { key: 'movedOn', dir: 'desc' },
  quickMatch: { ...signalMatch, movedOn: (r, v) => r.movedOn && Date.now() - r.movedOn <= Number(v) * DAY },
})
const quick = computed(() => {
  const list = source()
  return [
    ...signalQuick(list, inrShort),
    { key: 'advisorId', label: 'Previous IS', multiple: true, searchable: true, options: [...new Set(list.map((r) => r.advisorId).filter(Boolean))].map((id) => ({ label: db.userById(id)?.name || id, sub: db.userById(id)?.mhf_id, value: id })) },
    { key: 'movedOn', label: 'Junked On', options: [{ label: 'Last 7 Days', value: 7 }, { label: 'Last 30 Days', value: 30 }, { label: 'Last 90 Days', value: 90 }] },
  ]
})
const columns = [
  { key: 'cid', label: 'Client ID' }, { key: 'name', label: 'Name', width: '170px' }, { key: 'cityState', label: 'City & State' },
  { key: 'aum', label: 'AUM', align: 'right' },
  { key: 'lastInvAmount', label: 'Last Investment', width: '200px' }, { key: 'advisorsTried', label: 'Past IS', align: 'right' },
  { key: 'advisorName', label: 'Previous IS', width: '160px' }, { key: 'movedOn', label: 'Junked On', width: '200px' },
]
// Filter and Sort offer every part of a column separately (amount, product, date of the last investment; the reason)
const fields = [
  { key: 'cid', label: 'Client ID' }, { key: 'name', label: 'Name' }, { key: 'cityState', label: 'City & State' }, ...SIGNAL_FIELDS, ADVISORS_FIELD,
  { key: 'advisorName', label: 'Previous IS' }, { key: 'prevDataCode', label: 'Previous Data Code' },
  { key: 'movedOn', label: 'Junked On' }, { key: 'reason', label: 'Junk Reason' },
]
const selection = ref([])
// Investor DMS: Junk holds only records junked from Unassigned Investors; Restore returns them there (split prompt §7.2.2)
const bulkMenu = computed(() => [
  { label: 'Restore to Unassigned', icon: 'lucide-undo-2', onClick: () => dialog.confirm({ title: 'Restore records?', message: `${selection.value.length} record(s) will return to Unassigned Investors.`, confirmLabel: 'Restore', onConfirm: () => { try { restoreFromJunk(selection.value); toast.success('Records restored'); selection.value = [] } catch (e) { toast.error(e.message) } } }) },
])
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Junk', to: '/junk' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="search" v-model:quick-values="quickValues" v-model:advanced="advanced" v-model:sort="sort"
      placeholder="Client ID / Name / Mobile" :quick="quick" :filter-fields="fields" :sort-fields="fields" @refresh="refresh" />
    <DataTable :bulk-options="bulkMenu" v-model:selection="selection" :columns="columns" :rows="rows" :loading="loading" selectable
      :total-label="`Total rows: ${rows.length}`" empty-text="The Junk folder is empty" @row-click="(r) => router.push(`/record/${r.id}`)">
      <template #cell-cid="{ row }"><span class="tabular text-ink-gray-6">{{ row.cid }}</span></template>
      <template #cell-name="{ row }"><UserChip :name="row.name" full /></template>
      <template #cell-aum="{ row }"><AumCell :row="row" /></template>
      <template #cell-lastInvAmount="{ row }"><LastInvestmentCell :row="row" /></template>
      <template #cell-advisorsTried="{ row }"><span class="tabular">{{ row.advisorsTried || '-' }}</span></template>
      <template #cell-advisorName="{ row }"><UserChip v-if="row.advisorId" :user-id="row.advisorId" /><span v-else class="text-ink-gray-5">-</span></template>
      <template #cell-movedOn="{ row }">
        <div class="leading-tight">
          <div>{{ fmtDate(row.movedOn) }} <span class="text-xs text-ink-gray-5">by {{ row.movedBy }}</span></div>
          <div v-if="row.reason" class="max-w-[190px] truncate text-xs text-ink-gray-5" :title="row.reason">{{ row.reason }}</div>
        </div>
      </template>
    </DataTable>
  </div>
</template>
