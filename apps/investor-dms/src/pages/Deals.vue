<script setup>
// Deals home (Fig 20582; D05 §6.11; DEAL-001, DEAL-012..014). View-only: deals are created only inside an
// Investor record (DEAL-001). Amounts in rupees (Figma "$" is a known error, OPEN_QUESTIONS G1).
// Row click opens the investor's Deals tab (OPEN_QUESTIONS E6).
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { DEAL_PRODUCTS, DEAL_STATUS_THEME } from '@/data/masters'
import { visibleUserIds, isAdmin, isSupervisor } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import { sortDeals, dealProductsText, dealSchemeText } from '@/services/work'
import { fmtDateTime, fmtDate, inr, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'

const db = useDb(); const router = useRouter()
const source = () => {
  const ids = visibleUserIds()
  const list = db.deals.filter((d) => { const c = db.clientById(d.clientId); return c && (isAdmin() || ids.includes(c.assignedTo)) })
  return sortDeals(list).map((d) => {
    const c = db.clientById(d.clientId)
    return { id: d.id, d, clientId: d.clientId, cid: c.cid || c.id, clientName: clientName(c), products: dealProductsText(d), productList: d.rows.map((r) => r.product),
      scheme: dealSchemeText(d), total: d.total, status: d.status, start: d.start, assignedTo: c.assignedTo, assignedName: db.userById(c.assignedTo)?.name, updatedAt: d.updatedAt, finalAmount: d.finalAmount }
  })
}
const L = useList(source, {
  searchKeys: ['cid', 'clientName'],
  upcomingKeys: ['start'],
  quickMatch: {
    product: (r, v) => r.productList.includes(v),
    amount: (r, v) => { const [a, b] = v.split('-').map(Number); return r.total >= a && (!b || r.total <= b) },
    when: (r, v) => { const now = Date.now(); return v === 'upcoming' ? r.start >= now : v === 'past' ? r.start < now : r.start >= now - 30 * DAY },
  },
})
const quick = computed(() => [
  { key: 'product', label: 'Product', options: DEAL_PRODUCTS },
  { key: 'amount', label: 'Amount', options: [{ label: 'Up to ₹50,000', value: '0-50000' }, { label: '₹50,000 – ₹2,00,000', value: '50000-200000' }, { label: 'Above ₹2,00,000', value: '200000-' }] },
  { key: 'status', label: 'Status', options: ['Scheduled', 'Completed', 'Rejected', 'Expired'] },
  { key: 'when', label: 'Deal Date', options: [{ label: 'Upcoming', value: 'upcoming' }, { label: 'Past', value: 'past' }, { label: 'Last 30 days', value: 'recent' }] },
  ...(isSupervisor() ? [{ key: 'assignedTo', label: 'IS Name', multiple: true, searchable: true, options: db.users.filter((u) => (isAdmin() || visibleUserIds().includes(u.id)) && u.role !== 'Admin').map((u) => ({ label: u.name, sub: u.mhf_id, value: u.id })) }] : []),
])
const columns = computed(() => [
  { key: 'cid', label: 'Client ID' }, { key: 'clientName', label: 'Client Name' }, { key: 'products', label: 'Products' }, { key: 'scheme', label: 'Scheme Name' },
  { key: 'total', label: 'Total Amount', align: 'right' }, { key: 'status', label: 'Status' }, { key: 'start', label: 'Deal Date' },
  ...(isSupervisor() ? [{ key: 'assignedTo', label: 'Assigned to' }] : []), { key: 'updatedAt', label: 'Created Date' },
])
const filterFields = [{ key: 'clientName', label: 'Client Name' }, { key: 'cid', label: 'Client ID' }, { key: 'products', label: 'Products' }, { key: 'scheme', label: 'Scheme Name' }, { key: 'total', label: 'Total Amount' }, { key: 'status', label: 'Status' }, ...(isSupervisor() ? [{ key: 'assignedName', label: 'Assigned to' }] : [])]
const sortFields = [{ key: 'start', label: 'Deal Date' }, { key: 'total', label: 'Total Amount' }, { key: 'updatedAt', label: 'Created Date' }, { key: 'clientName', label: 'Client Name' }]
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Deals', to: '/deals' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Client ID/ Name" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable :columns="columns" :rows="L.rows.value" :loading="L.loading.value" uppercase empty-text="No deals found"
      :row-class="(r) => (r.status !== 'Scheduled' ? 'text-ink-gray-5' : '')" @row-click="(r) => router.push(`/record/${r.clientId}?tab=deals`)">
      <template #cell-cid="{ row }"><span class="tabular text-ink-gray-6">{{ row.cid }}</span></template>
      <template #cell-total="{ row }">
        <span class="tabular font-medium" :class="row.status === 'Rejected' && 'line-through text-ink-gray-5'">{{ inr(row.total) }}</span>
        <div v-if="row.status === 'Completed' && row.finalAmount" class="text-xs text-ink-green-7">Final: {{ inr(row.finalAmount) }}</div>
      </template>
      <template #cell-status="{ row }"><Badge :label="row.status" :theme="DEAL_STATUS_THEME[row.status]" :variant="row.status === 'Expired' ? 'outline' : 'subtle'" /></template>
      <template #cell-start="{ row }"><span class="whitespace-nowrap text-sm">{{ fmtDateTime(row.start) }}</span></template>
      <template #cell-assignedTo="{ row }"><UserChip :user-id="row.assignedTo" /></template>
      <template #cell-updatedAt="{ row }">{{ fmtDate(row.updatedAt) }}</template>
    </DataTable>
  </div>
</template>
