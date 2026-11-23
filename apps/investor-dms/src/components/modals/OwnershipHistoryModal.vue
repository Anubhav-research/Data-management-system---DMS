<script setup>
// Ownership History (Fig 15423; D03 §10). Admin only, Investors only. Read-only, built from Client Transfers.
import { computed } from 'vue'
import { Dialog } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { clientName } from '@/services/lifecycle'
import { fmtDate, DAY } from '@/utils/format'

const props = defineProps({ clientId: String })
const open = defineModel('open', { default: false })
const db = useDb()
const client = computed(() => db.clientById(props.clientId))
const hist = computed(() => [...(client.value?.ownershipHistory || [])].sort((a, b) => b.from - a.from))
function dur(from, to) {
  const days = Math.max(0, Math.round(((to || Date.now()) - from) / DAY))
  const m = Math.floor(days / 30)
  return m >= 1 ? `${m} month${m === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'}`
}
const specialists = computed(() => new Set(hist.value.map((h) => h.userId)).size)
const firstFrom = computed(() => (hist.value.length ? Math.min(...hist.value.map((h) => h.from)) : null))
const current = computed(() => hist.value.find((h) => !h.to))
</script>
<template>
  <Dialog v-model:open="open" size="3xl">
    <template #title>
      <div>
        <h3 class="text-xl font-semibold text-ink-gray-9">Ownership History — {{ clientName(client) }}</h3>
        <p class="mt-1 text-sm text-ink-gray-6">Every specialist and data code this investor has been held under, in order.</p>
      </div>
    </template>
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-6 border p-3"><div class="text-2xl font-semibold">{{ specialists }}</div><div class="text-sm text-ink-gray-5">Specialists held this record</div></div>
      <div class="rounded-6 border p-3"><div class="text-2xl font-semibold">{{ firstFrom ? dur(firstFrom) : '-' }}</div><div class="text-sm text-ink-gray-5">Total time on book</div></div>
      <div class="rounded-6 border p-3"><div class="text-2xl font-semibold">{{ current ? db.userById(current.userId)?.name.split(' ')[0] : '-' }}</div><div class="text-sm text-ink-gray-5">Current holder{{ current ? ` — ${dur(current.from)} so far` : '' }}</div></div>
    </div>
    <table class="mt-4 w-full text-sm">
      <thead class="bg-surface-gray-2 text-ink-gray-6"><tr><th class="px-3 py-2 text-left font-medium">Investment Specialist</th><th class="px-3 text-left font-medium">Data Code</th><th class="px-3 text-left font-medium">From</th><th class="px-3 text-left font-medium">To</th><th class="px-3 text-left font-medium">Duration</th></tr></thead>
      <tbody>
        <tr v-for="(h, i) in hist" :key="i" class="border-b">
          <td class="px-3 py-2">{{ db.userById(h.userId)?.name }} <span class="text-ink-gray-5">{{ db.userById(h.userId)?.mhf_id }}</span></td>
          <td class="px-3 tabular">{{ h.dataCode || '-' }}</td>
          <td class="px-3">{{ fmtDate(h.from) }}</td>
          <td class="px-3">{{ h.to ? fmtDate(h.to) : 'Current' }}</td>
          <td class="px-3">{{ dur(h.from, h.to) }}{{ h.to ? '' : ' (ongoing)' }}</td>
        </tr>
        <tr v-if="!hist.length"><td colspan="5" class="px-3 py-6 text-center text-ink-gray-5">No ownership history recorded.</td></tr>
      </tbody>
    </table>
    <p class="mt-3 text-xs text-ink-gray-5">Ordered most recent first. This history is generated automatically from every Client Transfer that touched this record — it cannot be edited manually.</p>
  </Dialog>
</template>
