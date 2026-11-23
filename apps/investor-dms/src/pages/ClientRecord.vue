<script setup>
// Client record (D03 §2; GEN-012, GEN-013; X04 STAGE_TAB_AVAILABILITY; Fig 5234, 8474, 13881).
// Trail shows the client's CURRENT stage. Convert on Pool/Prospect/Lead only. Deals tab only on Investor.
// Fresh view (POOL-016): after a return to Pool, history before `freshViewAfter` is hidden from non-Admin users.
import { initials } from '@/utils/format'
import { computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { STAGE_MODULE, STAGE_ROUTE } from '@/data/masters'
import { canActOn, isAdmin, isSupervisor, visibleUserIds } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import PageHeader from '@/components/PageHeader.vue'
import RecordSidePanel from '@/components/record/RecordSidePanel.vue'
import ActivityTab from '@/components/record/ActivityTab.vue'
import EmailsTab from '@/components/record/EmailsTab.vue'
import DataTab from '@/components/record/DataTab.vue'
import EventsTab from '@/components/record/EventsTab.vue'
import CallsTab from '@/components/record/CallsTab.vue'
import NotesTab from '@/components/record/NotesTab.vue'
import DealsTab from '@/components/record/DealsTab.vue'
import DocumentsTab from '@/components/record/DocumentsTab.vue'
import WhatsAppTab from '@/components/record/WhatsAppTab.vue'
import Invalid from './Invalid.vue'

const props = defineProps({ id: String })
const db = useDb(); const route = useRoute(); const router = useRouter()
const client = computed(() => db.clientById(props.id))
route.meta.stage = client.value?.stage

// Visibility: owner + downline + Admin; Pool records: batch holder, Admin, or supervisors of the holder.
const visible = computed(() => {
  const c = client.value; if (!c) return false
  if (isAdmin()) return true
  if (['Unassigned', 'Junk'].includes(c.stage)) return false
  return visibleUserIds().includes(c.assignedTo)
})
const readonly = computed(() => !canActOn(client.value))
const since = computed(() => (isAdmin() ? 0 : client.value?.freshViewAfter || 0))

const TABS = [
  { value: 'activity', label: 'Activity', comp: ActivityTab },
  { value: 'emails', label: 'Emails', comp: EmailsTab },
  { value: 'data', label: 'Data', comp: DataTab },
  { value: 'events', label: 'Events', comp: EventsTab },
  { value: 'calls', label: 'Calls', comp: CallsTab },
  { value: 'notes', label: 'Notes', comp: NotesTab },
  { value: 'deals', label: 'Deals', comp: DealsTab, investorOnly: true },
  { value: 'documents', label: 'Documents', comp: DocumentsTab },
  { value: 'whatsapp', label: 'WhatsApp', comp: WhatsAppTab },
]
const tabs = computed(() => TABS.filter((t) => !t.investorOnly || client.value?.stage === 'Investor'))
const active = computed({
  get: () => (tabs.value.some((t) => t.value === route.query.tab) ? route.query.tab : 'activity'),
  set: (v) => router.replace({ query: { ...route.query, tab: v } }),
})
const current = computed(() => tabs.value.find((t) => t.value === active.value))
const crumbs = computed(() => {
  const c = client.value
  return [{ label: STAGE_MODULE[c.stage], to: STAGE_ROUTE[c.stage] }, { label: 'List', to: STAGE_ROUTE[c.stage] }, { label: clientName(c) }]
})
// Assigned to (supervisors and Admin; GEN-006): full name with the Money Honey ID below
const owner = computed(() => {
  const c = client.value; if (!c || !isSupervisor() || ['Pool', 'Junk'].includes(c.stage)) return null
  const u = db.userById(c.assignedTo)
  return u ? { name: u.name, mhf: u.mhf_id } : { name: 'Not assigned', mhf: c.stage === 'Unassigned' && db.userById(c.prevOwner) ? `was ${db.userById(c.prevOwner).name}` : '' }
})
const canConvert = computed(() => false) // no Convert in Investor DMS (split prompt §7.2.2)
const convertOpen = ref(false)
watch(() => client.value?.stage, (s) => { route.meta.stage = s })
</script>
<template>
  <Invalid v-if="!client || !visible" />
  <div v-else class="flex h-full flex-col">
    <PageHeader :crumbs="crumbs" separator="›">
      <template #right>
        <span v-if="client.stage === 'Junk'" class="rounded-4 bg-surface-red-2 px-2 py-1 text-sm text-ink-red-7">This record is in Junk (read-only)</span>
        <span v-else-if="client.stage === 'Unassigned'" class="rounded-4 bg-surface-amber-2 px-2 py-1 text-sm text-ink-amber-8">Unassigned Investor (Admin view)</span>
        <span v-else-if="readonly" class="rounded-4 bg-surface-gray-2 px-2 py-1 text-sm text-ink-gray-6">View only</span>
        <div v-if="owner" class="flex h-7 max-w-80 items-center gap-1.5 rounded-full bg-surface-gray-2 py-0.5 pl-0.5 pr-2.5 text-base" :title="owner.mhf && !owner.mhf.startsWith('was') ? `Assigned to ${owner.name} (${owner.mhf})` : owner.mhf ? `Not assigned (previously ${owner.mhf.slice(4)})` : 'Not assigned'" data-testid="owner-chip">
          <span class="flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold" :class="owner.mhf && !owner.mhf.startsWith('was') ? 'bg-surface-gray-7 text-ink-white' : 'bg-surface-gray-4 text-ink-gray-6'">
            <template v-if="owner.mhf && !owner.mhf.startsWith('was')">{{ initials(owner.name) }}</template><span v-else class="lucide-user-x size-3.5" />
          </span>
          <span class="truncate text-ink-gray-8">{{ owner.name }}</span>
          <span v-if="owner.mhf && !owner.mhf.startsWith('was')" class="shrink-0 text-sm tabular text-ink-gray-5">{{ owner.mhf }}</span>
        </div>
        <Button v-if="canConvert" variant="solid" label="Convert" @click="convertOpen = true" />
      </template>
    </PageHeader>
    <div class="flex min-h-0 flex-1">
      <div class="flex min-w-0 flex-1 flex-col">
        <nav class="dms-toolbar-scroll flex h-[46px] shrink-0 items-end gap-6 overflow-x-auto overflow-y-hidden border-b px-5">
          <button v-for="t in tabs" :key="t.value" class="-mb-px whitespace-nowrap border-b-2 pb-2.5 text-base transition"
            :class="active === t.value ? 'border-ink-gray-9 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-6 hover:text-ink-gray-8'" @click="active = t.value">
            {{ t.label }}
          </button>
        </nav>
        <div class="dms-scroll min-h-0 flex-1 overflow-y-auto">
          <component :is="current.comp" :key="client.id + current.value" :client="client" :readonly="readonly" :since="since" />
        </div>
      </div>
      <RecordSidePanel :client="client" :readonly="readonly" @open-tab="(t) => (active = t)" />
    </div>
  </div>
</template>
