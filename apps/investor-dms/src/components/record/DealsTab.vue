<script setup>
// Deals tab (D05 §6.5; DEAL-001, DEAL-007, DEAL-012, DEAL-013; Fig 15866). Investor only.
// Sort: Scheduled nearest first, then finished most recent first (DEAL-012).
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { sortDeals, dealProductsText, dealSchemeText } from '@/services/work'
import { timeAgo, fmtDateTime, inr, initials } from '@/utils/format'
import DealModal from '@/components/modals/DealModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb(); const route = useRoute(); const router = useRouter()
const list = computed(() => sortDeals(db.deals.filter((d) => d.clientId === props.client.id)))
const open = ref(false); const current = ref(null)
const canEdit = computed(() => !props.readonly && props.client.stage === 'Investor')
function create() { current.value = null; open.value = true }
function edit(d) { if (!canEdit.value) return; current.value = d; open.value = true }
onMounted(() => {
  if (route.query.createDeal === '1' && canEdit.value) { create(); router.replace({ query: { ...route.query, createDeal: undefined } }) }
})
const tag = { Scheduled: 'bg-surface-blue-2 text-ink-blue-7', Completed: 'bg-surface-green-2 text-ink-green-7', Rejected: 'bg-surface-red-2 text-ink-red-7', Expired: 'border border-outline-red-3 text-ink-red-7' }
const uname = (id) => db.userById(id)?.name || ''
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Deals</h3>
      <Button v-if="canEdit" variant="solid" icon-left="lucide-plus" label="Create deal" @click="create" />
    </div>
    <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-handshake size-6" /></div>
      <p class="text-base text-ink-gray-7">No deals yet</p>
      <p class="text-sm text-ink-gray-5">Deals are created only inside an Investor record (DEAL-001).</p>
    </div>
    <div v-else class="space-y-4">
      <div v-for="d in list" :key="d.id">
        <div class="mb-1.5 flex items-center justify-between text-base">
          <p class="flex items-center gap-2 text-ink-gray-6">
            <PersonTip :user-id="d.createdBy"><span class="flex size-6 items-center justify-center rounded-full bg-surface-gray-3 text-2xs text-ink-gray-7">{{ initials(uname(d.createdBy)) }}</span></PersonTip>
            <span><span class="font-medium text-ink-gray-8">{{ uname(d.createdBy).split(' ')[0] }}</span> has created the deal</span>
            <span class="rounded-full px-2 py-0.5 text-xs" :class="tag[d.status]">{{ d.status }}</span>
          </p>
          <span class="text-sm text-ink-gray-5">{{ timeAgo(d.updatedAt) }}</span>
        </div>
        <button class="w-full rounded-6 border p-4 text-left" :class="[canEdit ? 'hover:bg-surface-gray-1' : 'cursor-default', d.status !== 'Scheduled' && 'opacity-75']" @click="edit(d)">
          <div v-if="d.status === 'Completed'" class="mb-2 inline-block rounded-full bg-surface-green-2 px-2 py-0.5 text-xs text-ink-green-7">Final Investment: {{ inr(d.finalAmount) }}</div>
          <div class="grid grid-cols-[1fr_1fr_auto] gap-4 text-sm">
            <div><div class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">Products</div><div class="mt-1 text-ink-gray-8">{{ dealProductsText(d) }}</div></div>
            <div><div class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">Scheme / Issuer Details</div><div class="mt-1 text-ink-gray-8">{{ dealSchemeText(d) }}</div></div>
            <div class="text-right">
              <div class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">Total Amount</div>
              <div class="mt-1 text-lg font-semibold text-ink-gray-9" :class="d.status === 'Rejected' && 'line-through'">{{ inr(d.total) }}</div>
              <div class="text-xs text-ink-gray-5">{{ d.allDay ? 'All Day' : fmtDateTime(d.start) }}</div>
            </div>
          </div>
          <p v-if="d.remark" class="mt-3 flex gap-2 rounded-4 bg-surface-gray-1 p-2 text-sm text-ink-gray-7"><span class="lucide-sticky-note mt-0.5 size-3.5 shrink-0" />{{ d.remark }}</p>
        </button>
      </div>
    </div>
    <DealModal v-model:open="open" :client-id="client.id" :deal="current" />
  </div>
</template>
