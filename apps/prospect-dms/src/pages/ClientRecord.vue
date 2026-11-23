<script setup>
// Client record (D03 §2; GEN-012, GEN-013; X04 STAGE_TAB_AVAILABILITY; Fig 5234, 8474, 13881).
// Trail shows the client's CURRENT stage. Convert on Pool/Prospect/Lead, and on an Investor Family for its
// non-investor members (split prompt §6.3). 8 tabs, no Deals (§6.8). Unassigned Family: Admin view only, no Convert.
// Fresh view (POOL-016): after a return to Pool, history before `freshViewAfter` is hidden from non-Admin users.
import { initials } from '@/utils/format'
import { computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast, dialog } from 'frappe-ui'
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
import DocumentsTab from '@/components/record/DocumentsTab.vue'
import WhatsAppTab from '@/components/record/WhatsAppTab.vue'
import ConvertModal from '@/components/modals/ConvertModal.vue'
import Invalid from './Invalid.vue'
import { isFullyConverted, isFamilyComplete, workableMembers, memberCounts } from '@/services/family'
import { pendingHandover, failedHandover, retryHandover, revertHandover } from '@/services/handover'
import { fullName } from '@/services/lifecycle'

const props = defineProps({ id: String })
const db = useDb(); const route = useRoute(); const router = useRouter()
const client = computed(() => db.clientById(props.id))
route.meta.stage = client.value?.stage

// Visibility: owner + downline + Admin; Pool records: batch holder, Admin, or supervisors of the holder.
const visible = computed(() => {
  const c = client.value; if (!c) return false
  if (isAdmin()) return true
  if (['Unassigned Family', 'Junk'].includes(c.stage)) return false
  if (c.stage === 'Pool') return !c.batchOf || visibleUserIds().includes(c.batchOf)
  return visibleUserIds().includes(c.assignedTo)
})
// Assigned to (supervisors and Admin; GEN-006): full name with the Money Honey ID below, beside Convert
const owner = computed(() => {
  const c = client.value; if (!c || !isSupervisor() || ['Pool', 'Junk'].includes(c.stage)) return null
  const u = db.userById(c.assignedTo)
  return u ? { name: u.name, mhf: u.mhf_id } : { name: 'Not assigned', mhf: '' }
})
const readonly = computed(() => !canActOn(client.value) || isFullyConverted(client.value)) // a fully converted family stays here, read-only
const since = computed(() => (isAdmin() ? 0 : client.value?.freshViewAfter || 0))

const TABS = [
  { value: 'activity', label: 'Activity', comp: ActivityTab },
  { value: 'emails', label: 'Emails', comp: EmailsTab },
  { value: 'data', label: 'Data', comp: DataTab },
  { value: 'events', label: 'Events', comp: EventsTab },
  { value: 'calls', label: 'Calls', comp: CallsTab },
  { value: 'notes', label: 'Notes', comp: NotesTab },
  { value: 'documents', label: 'Documents', comp: DocumentsTab },
  { value: 'whatsapp', label: 'WhatsApp', comp: WhatsAppTab },
]
const tabs = computed(() => TABS)
const active = computed({
  get: () => (tabs.value.some((t) => t.value === route.query.tab) ? route.query.tab : 'activity'),
  set: (v) => router.replace({ query: { ...route.query, tab: v } }),
})
const current = computed(() => tabs.value.find((t) => t.value === active.value))
const crumbs = computed(() => {
  const c = client.value
  return [{ label: STAGE_MODULE[c.stage], to: STAGE_ROUTE[c.stage] }, { label: 'List', to: STAGE_ROUTE[c.stage] }, { label: clientName(c) }]
})
const canConvert = computed(() => {
  const c = client.value; if (!c || readonly.value) return false
  if (['Pool', 'Prospect', 'Lead'].includes(c.stage)) return true
  return c.stage === 'Investor Family' && workableMembers(c).length > 0 // non-investor members only
})
const pendingH = computed(() => client.value && pendingHandover(client.value))
const failedH = computed(() => client.value && failedHandover(client.value))
const convertRef = ref(null)
const preverify = ref(route.query.selfreg || null)
const selfReg = computed(() => {
  const s = client.value?.selfRegistration; if (!s || !['Prospect', 'Lead'].includes(client.value.stage)) return null
  const m = client.value.members.find((x) => x.key === s.memberKey); return m ? { ...s, name: fullName(m) } : null
})
function reviewSelfReg() { preverify.value = selfReg.value.memberKey; convertRef.value?.openWizard() }
if (route.query.selfreg) setTimeout(() => convertRef.value?.openWizard(), 400)
async function doRetry() { try { await retryHandover(failedH.value.id); toast.success('Conversion sent again.') } catch (e) { toast.error(e.message) } }
function doRevert() {
  const id = failedH.value.id
  dialog.confirm({ title: 'Revert this conversion?', message: 'The Investor tag is removed and the record returns to the stage it was converted from.', confirmLabel: 'Revert', onConfirm: async () => { try { await revertHandover(id); toast.success('Conversion reverted.') } catch (e) { toast.error(e.message) } } })
}
const convertOpen = ref(false)
watch(() => client.value?.stage, (s) => { route.meta.stage = s })
</script>
<template>
  <Invalid v-if="!client || !visible" />
  <div v-else class="flex h-full flex-col">
    <PageHeader :crumbs="crumbs" separator="›">
      <template #right>
        <span v-if="client.stage === 'Junk'" class="rounded-4 bg-surface-red-2 px-2 py-1 text-sm text-ink-red-7">This record is in Junk (read-only)</span>
        <span v-else-if="client.stage === 'Unassigned Family'" class="rounded-4 bg-surface-amber-2 px-2 py-1 text-sm text-ink-amber-8">Unassigned Family (Admin view)</span>
        <span v-else-if="isFullyConverted(client)" class="rounded-4 bg-surface-gray-2 px-2 py-1 text-sm text-ink-gray-6" data-testid="record-archived">{{ isFamilyComplete(client) ? 'Converted to Investor DMS (read-only)' : 'Fully converted (read-only)' }}</span>
        <span v-else-if="client.ownershipPending" class="rounded-4 bg-surface-amber-2 px-2 py-1 text-sm text-ink-amber-8">Ownership update pending</span>
        <span v-else-if="readonly" class="rounded-4 bg-surface-gray-2 px-2 py-1 text-sm text-ink-gray-6">View only</span>
        <span v-if="pendingH" class="rounded-4 bg-surface-amber-2 px-2 py-1 text-sm text-ink-amber-8" data-testid="handover-pending" :title="pendingH.lastError || ''">Conversion pending</span>
        <span v-if="failedH" class="rounded-4 bg-surface-red-2 px-2 py-1 text-sm text-ink-red-7" data-testid="handover-failed">Conversion failed – contact Admin</span>
        <template v-if="failedH && isAdmin()"><Button size="sm" label="Retry" @click="doRetry" /><Button size="sm" theme="red" label="Revert" @click="doRevert" /></template>
        <span v-if="client.callBlocked" class="rounded-4 bg-surface-red-2 px-2 py-1 text-sm text-ink-red-7">Calls blocked: {{ client.callBlocked.reason }}</span>
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
    <div v-if="selfReg" class="flex items-center gap-2 border-b bg-surface-blue-1 px-5 py-2 text-sm text-ink-blue-8" data-testid="selfreg-banner">
      <span class="lucide-badge-check size-4" />{{ selfReg.name }} registered on the Transaction Platform. Tap to review.
      <Button v-if="canConvert" size="sm" variant="solid" label="Review" @click="reviewSelfReg" />
    </div>
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
    <ConvertModal ref="convertRef" v-model:open="convertOpen" :client-id="client.id" :mandatory="false" :preverify="preverify" />
  </div>
</template>
