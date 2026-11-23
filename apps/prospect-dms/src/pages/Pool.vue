<script setup>
// Pool. IS/TL/VP/President: only their own random batch of 20, no search/filters, NEXT (POOL-002..005, 013..015; Fig 4921).
// NEXT is enabled only while the batch holds fewer than 20 records (work the batch first).
// Admin: whole Pool with search, filters, Total rows and bulk Junk / Convert (D02 §3.10-3.11, D06 §3; Fig 22955, 23433).
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { isAdmin } from '@/services/access'
import { myBatch, nextBatch, clientName, primaryMobile, cityState, adminConvert, adminJunk, plCount } from '@/services/lifecycle'
import { LIMITS } from '@/data/masters'
import { screenBatch } from '@/services/numberCheck'
import { openSettings } from '@/composables/settings'
import ImportDialog from '@/components/modals/ImportDialog.vue'
import { fmtDate, fmtMobile } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import AdvisorPicker from '@/components/modals/AdvisorPicker.vue'
import JunkDialog from '@/components/modals/JunkDialog.vue'

const db = useDb(); const router = useRouter()
const row = (c) => ({ id: c.id, c, name: clientName(c), mobile: primaryMobile(c), cityState: cityState(c), email: c.members[0].emails?.[0]?.email || '--', source: c.source, importDate: c.importDate, state: c.poolHold ? 'Held – matches an existing family' : c.poolState || 'Active', batchOf: c.batchOf })

// ---- Specialist batch ----
const full = computed(() => plCount(db.sessionUserId) >= LIMITS.PL_LIMIT)
const batch = computed(() => (isAdmin() ? [] : myBatch(db.sessionUserId).map(row)))
// F3: a drawn batch is checked against Investor DMS and the platform; matches leave the Pool (split prompt §6.7.4)
onMounted(() => { if (!isAdmin()) screenBatch(db.sessionUserId).then((n) => n && toast.info(`${n} record(s) matched an existing client family and were taken out of the Pool.`)) })
function next() {
  const r = nextBatch(db.sessionUserId)
  screenBatch(db.sessionUserId)
  if (r.full) return
  if (r.count === 0) dialog.confirm({ title: 'No records available', message: 'No records available right now. Please wait and click Next in a few minutes.', actions: [] }) // POOL-014
  else if (r.count < LIMITS.POOL_BATCH) toast.info(`Showing ${r.count} available records. More records will become available shortly.`) // POOL-013
  else toast.success('New batch of 20 records')
}
const canNext = computed(() => batch.value.length < LIMITS.POOL_BATCH)

// ---- Admin ----
const L = useList(() => (isAdmin() ? db.clients.filter((c) => c.stage === 'Pool').map(row) : []), { searchKeys: ['name', 'mobile'], defaultSort: { key: 'importDate', dir: 'desc' }, quickMatch: { cityState: (r, v) => r.cityState.includes(v), importDate: (r, v) => r.importDate >= v.from && r.importDate <= v.to } })
const sources = computed(() => db.poolSources.map((s) => s.name))
const quick = computed(() => [
  { key: 'cityState', label: 'City and State', options: [...new Set(db.clients.filter((c) => c.stage === 'Pool').map((c) => cityState(c).split(', ')[1]).filter(Boolean))] },
  { key: 'source', label: 'Source', options: sources.value },
  { key: 'importDate', label: 'Import Date', date: true },
])
const selection = ref([])
const junkOpen = ref(false)
function doJunk(comment) { adminJunk(selection.value, comment); toast.success('Moved to Junk'); selection.value = [] }
const pick = ref({ open: false, to: 'Prospect' })
function convert(advisorId) {
  try { adminConvert(selection.value, pick.value.to, advisorId); toast.success(`${selection.value.length} record(s) converted to ${pick.value.to} for ${db.userById(advisorId).name}`); selection.value = [] }
  catch (e) { toast.error(e.message) }
}
const bulkMenu = computed(() => [
  { label: 'Junk', icon: 'lucide-trash-2', onClick: () => (junkOpen.value = true) }, // D06 §3.4: Junk, not Delete
  { label: 'Convert to Prospect', icon: 'lucide-user-plus', onClick: () => (pick.value = { open: true, to: 'Prospect' }) },
  { label: 'Convert to Lead', icon: 'lucide-user-check', onClick: () => (pick.value = { open: true, to: 'Lead' }) },
])
// Columns per D02 §3.10 / D06 §3.3 and Fig 22955: checkbox, Name, Mobile No., City State, Email, Source, Import Date
const adminColumns = [{ key: 'name', label: 'Name', width: '200px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'cityState', label: 'City State' }, { key: 'email', label: 'Email' }, { key: 'source', label: 'Source' }, { key: 'importDate', label: 'Import Date' }]
const importOpen = ref(false)
const adminMore = [{ label: 'Import', icon: 'lucide-upload', onClick: () => (importOpen.value = true) }, { label: 'Import History', icon: 'lucide-history', onClick: () => openSettings('import') }, { label: 'Pool Source Visibility', icon: 'lucide-eye', onClick: () => openSettings('pool-sources') }]
const batchColumns = [{ key: 'name', label: 'Name', width: '220px' }, { key: 'mobile', label: 'Mobile No.' }, { key: 'cityState', label: 'City, State' }, { key: 'email', label: 'Email' }]
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Pool', to: '/pool' }, { label: 'List', chevron: true }]" />

    <!-- ADMIN POOL -->
    <template v-if="isAdmin()">
      <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
        placeholder="Name / Mobile No." :quick="quick" :filter-fields="adminColumns.map((c) => ({ key: c.key, label: c.label }))" :sort-fields="adminColumns.map((c) => ({ key: c.key, label: c.label }))" :more="adminMore" @refresh="L.refresh" />
      <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
      <DataTable v-model:selection="selection" :bulk-options="bulkMenu" :columns="adminColumns" :rows="L.rows.value" :loading="L.loading.value" selectable
        :total-label="`Total rows: ${L.rows.value.length.toLocaleString('en-IN')}`" @row-click="(r) => router.push(`/record/${r.id}`)">
        <template #cell-name="{ row }"><UserChip :name="row.name" full /></template>
        <template #cell-mobile="{ row }"><span class="tabular">{{ fmtMobile(row.mobile) }}</span></template>
        <template #cell-importDate="{ row }">{{ fmtDate(row.importDate) }}</template>
      </DataTable>
      <AdvisorPicker v-model:open="pick.open" :title="`Convert to ${pick.to}`" :message="`Are you sure you want to convert ${selection.length} Clients to ${pick.to}?`" confirm-label="CONVERT" @pick="convert" />
      <JunkDialog v-model:open="junkOpen" :count="selection.length" @confirm="doJunk" />
      <ImportDialog v-model:open="importOpen" />
    </template>

    <!-- SPECIALIST BATCH -->
    <template v-else>
      <div v-if="full" class="m-5 rounded-6 border border-outline-amber-3 bg-surface-amber-2 p-4 text-p-sm text-ink-amber-8">
        Your Prospect and Lead limit of 1500 is full. Release or convert records to free space; your Pool batch will return once you are below 1500.
      </div>
      <DataTable v-else :columns="batchColumns" :rows="batch" :page-sizes="[20]" empty-text="No records available right now." empty-hint="Please wait and click Next in a few minutes."
        @row-click="(r) => router.push(`/record/${r.id}`)">
        <template #cell-name="{ row }"><UserChip :name="row.name" full /></template>
        <template #cell-mobile="{ row }"><span class="tabular">{{ row.mobile }}</span></template>
        <template #cell-email="{ row }"><span :class="row.email !== '--' && 'text-ink-blue-link'">{{ row.email }}</span></template>
        <template #footer-left><span class="mr-2">Rows per page:</span><span class="rounded-4 bg-surface-gray-2 px-2 py-1 font-medium text-ink-gray-8">20</span></template>
      </DataTable>
      <div v-if="!full" class="flex items-center justify-end gap-3 border-t px-5 py-2">
        <span v-if="!canNext" class="text-sm text-ink-gray-5">Work your current {{ batch.length }} records first. NEXT unlocks when fewer than {{ LIMITS.POOL_BATCH }} remain.</span>
        <Button variant="solid" theme="blue" label="NEXT" icon-right="lucide-arrow-right" :disabled="!canNext" @click="next" />
      </div>
    </template>
  </div>
</template>
