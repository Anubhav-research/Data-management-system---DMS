<script setup>
// Exceptions (Admin, read-only list, product owner 24 Nov 2026): the exceptions this website already records (for
// example "Two IS on one family", "Needs Data Code", "Duplicate investor"), so the Dashboard numbers open exactly
// those records. No new data: the existing `exceptions` records.
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { clientName } from '@/services/lifecycle'
import { fmtDateTime } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'

const db = useDb(); const router = useRouter()
const source = () => (db.exceptions || []).map((e) => {
  const c = e.clientId && db.clientById(e.clientId)
  return { id: e.id, e, type: e.type, text: e.text, record: c ? clientName(c) : '—', clientId: c ? c.id : null, at: e.at, status: e.resolved ? 'Resolved' : 'Open', resolvedAt: e.resolvedAt || null }
})
const L = useList(source, { searchKeys: ['type', 'text', 'record'], defaultSort: { key: 'at', dir: 'desc' } })
const types = [...new Set((db.exceptions || []).map((e) => e.type))].sort()
const quick = [{ key: 'status', label: 'Status', options: ['Open', 'Resolved'] }, { key: 'type', label: 'Type', options: types }]
const columns = [{ key: 'type', label: 'Type', width: '200px' }, { key: 'text', label: 'Detail', width: '380px' }, { key: 'record', label: 'Record' }, { key: 'at', label: 'Raised' }, { key: 'status', label: 'Status' }]
const fields = columns.map((c) => ({ key: c.key, label: c.label }))
const selection = ref([])
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Exceptions', to: '/exceptions' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Type / detail / record" :quick="quick" :filter-fields="fields" :sort-fields="fields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable v-model:selection="selection" :columns="columns" :rows="L.rows.value" :loading="L.loading.value" empty-text="No exceptions" empty-hint="Exceptions are raised by the system when data from the other website needs Admin's attention."
      @row-click="(r) => r.clientId && router.push(`/record/${r.clientId}`)">
      <template #cell-type="{ row }"><span class="font-medium text-ink-gray-9">{{ row.type }}</span></template>
      <template #cell-text="{ row }"><span class="line-clamp-2 text-sm text-ink-gray-7">{{ row.text }}</span></template>
      <template #cell-at="{ row }"><span class="text-sm text-ink-gray-7">{{ fmtDateTime(row.at) }}</span></template>
      <template #cell-status="{ row }"><span :class="row.status === 'Open' ? 'text-ink-amber-7' : 'text-ink-green-7'">{{ row.status }}</span></template>
    </DataTable>
  </div>
</template>
