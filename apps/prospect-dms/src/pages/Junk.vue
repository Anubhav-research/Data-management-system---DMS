<script setup>
// Junk folder (Admin only; D06 §6.4-6.5; Fig 22599). Records are never deleted (D06 §1.3).
// Bulk: Restore to Pool (counters reset), Convert to Prospect / Lead. Unassigned Investors live in Investor DMS.
// (advisor pick, 1500 all-or-nothing).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dropdown, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { fullName } from '@/services/lifecycle'
import { workableMembers, isInvestorMember } from '@/services/family'
import { clientName, primaryMobile, cityState, restoreFromJunk, restoreFamiliesFromJunk, familyRestoreTargets, adminConvert, junkLogCsv } from '@/services/lifecycle'
import { fmtDateTime, fmtMobile, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import AdvisorPicker from '@/components/modals/AdvisorPicker.vue'

const db = useDb(); const router = useRouter()
// A junked Investor Family shows its contact person, as in the Investor Family list: the first member who is not an
// investor (the investor's details are removed from Prospect DMS). Product owner, 13 Nov 2026.
const shownPerson = (c) => (isInvestorMember(c.members[0]) ? workableMembers(c)[0] || null : c.members[0])
const placeOf = (m) => { const a = m?.addresses?.[0]; return a ? [a.city, a.state].filter(Boolean).join(', ') || '-' : '-' }
const source = () => db.clients.filter((c) => c.stage === 'Junk').map((c) => {
  const p = shownPerson(c); const isPrimary = p === c.members[0]
  return {
    id: c.id, name: p ? fullName(p) : clientName(c), rel: !isPrimary && p ? p.relationship : '', familyId: c.movedFrom === 'Investor Family' ? c.familyId : '',
    mobile: isPrimary ? primaryMobile(c) : p?.contacts?.find((x) => x.mobile && !x.pendingAdd)?.mobile || '',
    cityState: isPrimary ? cityState(c) : placeOf(p), email: p?.emails?.[0]?.email || '--',
    source: c.source || '-', movedFrom: c.movedFrom || '-', movedOn: c.movedOn, movedBy: c.movedBy, totalCalls: c.totalCalls || 0,
  }
})
const { search, quickValues, advanced, sort, rows, loading, refresh, silentIds, clearSilent } = useList(source, {
  searchKeys: ['name', 'mobile'],
  defaultSort: { key: 'movedOn', dir: 'desc' },
  quickMatch: { movedOn: (r, v) => r.movedOn && Date.now() - r.movedOn <= Number(v) * DAY },
})
const quick = computed(() => [
  { key: 'movedFrom', label: 'Moved From', options: ['Pool', 'Prospect', 'Lead', 'Investor Family'] },
  { key: 'source', label: 'Source', options: db.poolSources.map((s) => s.name) },
  { key: 'movedOn', label: 'Moved On', options: [{ label: 'Last 7 Days', value: 7 }, { label: 'Last 30 Days', value: 30 }, { label: 'Last 90 Days', value: 90 }] },
])
const columns = [
  { key: 'name', label: 'Name', width: '190px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'cityState', label: 'City & State' }, { key: 'email', label: 'Email' },
  { key: 'source', label: 'Source' }, { key: 'movedFrom', label: 'Moved From' }, { key: 'movedOn', label: 'Moved On' }, { key: 'totalCalls', label: 'Total Calls', align: 'right' },
]
const selection = ref([])
// Simulated CSV Junk log (GEN-010, D02 §3.11): every Admin move to Junk (full record) and every restore
function downloadLog() {
  if (!db.junkLog.length) { toast.info('The Junk log is empty. Admin moves to Junk and restores are logged here.'); return }
  const url = URL.createObjectURL(new Blob([junkLogCsv()], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'dms-junk-log.csv'; a.click(); URL.revokeObjectURL(url)
}
const pick = ref({ open: false, to: 'Prospect' })
function convert(advisorId) {
  try {
    selection.value.forEach((id) => { db.clientById(id).poolState = null })
    adminConvert(selection.value, pick.value.to, advisorId)
    toast.success(`${selection.value.length} record(s) converted to ${pick.value.to} for ${db.userById(advisorId).name}`)
    selection.value = []
  } catch (e) { toast.error(e.message) }
}
// An Investor Family can only go back to Investor Family, with its family advisor (product owner, 13 Nov 2026)
const isFam = (id) => db.clientById(id)?.movedFrom === 'Investor Family'
function restoreFamilies() {
  const ids = [...selection.value]
  const lines = familyRestoreTargets(ids).map(({ c, advisor }) => `${clientName(c)} (${c.familyId}) → ${advisor ? `${advisor.name} (${advisor.mhf_id})` : 'no family IS'}`)
  dialog.confirm({
    title: 'Restore to Investor Family?',
    message: `${ids.length === 1 ? 'This family goes' : `These ${ids.length} families go`} back to Investor Family with their family IS, and to no one else:\n\n${lines.join('\n')}`,
    confirmLabel: 'OK',
    onConfirm: () => { try { restoreFamiliesFromJunk(ids); toast.success('Restored to Investor Family'); selection.value = [] } catch (e) { toast.error(e.message) } },
  })
}
const familyMenu = [{ label: 'Restore to Investor Family', icon: 'lucide-house', onClick: restoreFamilies }]
const mixedMenu = [{ label: 'Select Investor Family records on their own', icon: 'lucide-info', onClick: () => toast.info('Investor Family records go back only to Investor Family. Select them separately from Pool, Prospect and Lead records.') }]
const bulkMenu = computed(() => {
  const fam = selection.value.filter(isFam).length
  if (fam && fam === selection.value.length) return familyMenu
  if (fam) return mixedMenu
  return otherMenu.value
})
const otherMenu = computed(() => [
  { label: 'Restore to Pool', icon: 'lucide-undo-2', onClick: () => dialog.confirm({ title: 'Restore records?', message: `${selection.value.length} record(s) will be restored. Records return to the Active Pool under the same Source with counters reset. Restore is blocked if a number or PAN now matches an owned record or an existing client family.`, confirmLabel: 'Restore', onConfirm: () => { try { restoreFromJunk(selection.value); toast.success('Records restored'); selection.value = [] } catch (e) { toast.error(e.message) } } }) },
  { label: 'Convert to Prospect', icon: 'lucide-user-plus', onClick: () => (pick.value = { open: true, to: 'Prospect' }) },
  { label: 'Convert to Lead', icon: 'lucide-user-check', onClick: () => (pick.value = { open: true, to: 'Lead' }) },
])
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Junk', to: '/junk' }, { label: 'List', chevron: true }]">
      <template #right>
        <Button label="Junk log (CSV)" icon-left="lucide-download" :title="`${db.junkLog.length} log entries. GEN-010: kept at least 2 years, never removed from the back end.`" @click="downloadLog" />
      </template>
    </PageHeader>
    <SilentFilterBar v-if="silentIds" :count="rows.length" @clear="clearSilent" />
    <ListToolbar v-model:search="search" v-model:quick-values="quickValues" v-model:advanced="advanced" v-model:sort="sort"
      placeholder="Name / Mobile No." :quick="quick" :filter-fields="columns.map((c) => ({ key: c.key, label: c.label }))"
      :sort-fields="columns.map((c) => ({ key: c.key, label: c.label }))" @refresh="refresh" />
    <DataTable :bulk-options="bulkMenu" v-model:selection="selection" :columns="columns" :rows="rows" :loading="loading" selectable
      :total-label="`Total rows: ${rows.length}`" empty-text="The Junk folder is empty" @row-click="(r) => router.push(`/record/${r.id}`)">
      <template #cell-name="{ row }"><span class="flex min-w-0 items-center gap-1.5"><UserChip :name="row.name" :full="!!row.familyId" /><span v-if="row.rel" class="shrink-0 text-sm text-ink-gray-5">· {{ row.rel }}</span></span></template>
      <template #cell-mobile="{ row }"><span class="tabular">{{ row.mobile ? fmtMobile(row.mobile) : '-' }}</span></template>
      <template #cell-movedOn="{ row }"><span class="text-sm">{{ fmtDateTime(row.movedOn) }}</span><span class="ml-1 text-xs text-ink-gray-5">· {{ row.movedBy }}</span></template>
      <template #cell-totalCalls="{ row }"><span class="tabular">{{ row.totalCalls }}</span></template>
    </DataTable>
    <AdvisorPicker v-model:open="pick.open" :title="`Convert to ${pick.to}`" :message="`Are you sure you want to convert ${selection.length} Clients to ${pick.to}?`" confirm-label="CONVERT" @pick="convert" />
  </div>
</template>
