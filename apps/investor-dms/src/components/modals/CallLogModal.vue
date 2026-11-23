<script setup>
// "Create Call Log" (Fig 7637 / 7704 / 14548; D04 §5; CALL-003..008, CALL-013, CALL-014).
// Opens automatically after a connected call and cannot be dismissed until saved.
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, Button, FormControl, toast, dialog } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { CALL_OUTCOMES } from '@/data/masters'
import { saveCallLog, needsEvent } from '@/services/calls'
import { fullName } from '@/services/lifecycle'
import { fmtDuration } from '@/utils/format'
import EventModal from './EventModal.vue'

const db = useDb(); const router = useRouter()
const p = computed(() => db.pendingLog)
const open = computed({ get: () => !!p.value && !eventOpen.value, set: () => {} })
const client = computed(() => (p.value ? db.clientById(p.value.clientId) : null))
const f = ref({ outcome: '', clientName: '', comment: '' })
const error = ref('')
watch(p, (v) => { if (v) { f.value = { outcome: '', clientName: v.personName || '', comment: '' }; error.value = '' } }, { immediate: true })
const outcomes = computed(() => (client.value ? CALL_OUTCOMES[client.value.stage] || CALL_OUTCOMES.Prospect : []))
const names = computed(() => (client.value ? [...client.value.members.map(fullName), 'Others'] : []))
const isNext = computed(() => needsEvent(f.value.outcome))
const eventOpen = ref(false)

function validate() {
  if (!f.value.outcome) return 'Call Outcome is mandatory.'
  if (!f.value.clientName) return 'Client Name is mandatory.'
  if (!f.value.comment.trim()) return 'Comment is mandatory on every connected call.'
  return ''
}
function primaryAction() {
  error.value = validate(); if (error.value) return
  if (isNext.value) { eventOpen.value = true; return } // CALL-013: event required before save
  finish()
}
function finish() {
  try {
    const stageBefore = client.value.stage
    const id = client.value.id
    const r = saveCallLog({ outcome: f.value.outcome, clientNameSel: f.value.clientName, comment: f.value.comment })
    toast.success('Call log saved')
    if (r.converted) toast.success(`Record converted to ${r.converted}`)
    if (r.offerDeal) {
      dialog.confirm({ title: 'Create Deal?', message: 'The investor is interested. Do you want to create a deal now?', confirmLabel: 'Create Deal', onConfirm: () => router.push({ path: `/record/${id}`, query: { tab: 'deals', createDeal: '1' } }) })
    }
    if (stageBefore !== 'Pool') router.replace({ path: `/record/${id}`, query: { tab: 'calls' } }).catch(() => {})
  } catch (e) { error.value = e.message }
}
function onEventCreated() { eventOpen.value = false; finish() }
function onEventCancel() { eventOpen.value = false } // stays in the call-log pop-up (D04 §5.4)
</script>
<template>
  <Dialog v-model:open="open" :dismissible="false" :show-close-button="false" size="xl">
    <template #title><h3 class="text-xl font-semibold text-ink-gray-9">Create Call Log</h3></template>
    <div v-if="p" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <FormControl label="Call Type" required :model-value="p.direction" disabled />
        <FormControl label="Mobile Number" required :model-value="p.mobile" disabled />
        <FormControl label="Call Duration" :model-value="fmtDuration(p.duration)" disabled />
        <FormControl label="Call Status" required model-value="Connected" disabled :description="p.manual ? 'Logged manually' : 'Set by the phone system'" />
        <FormControl v-model="f.outcome" label="Call Outcome" type="select" required :options="outcomes" placeholder="Select outcome" />
      </div>
      <div class="border-t pt-4">
        <FormControl v-model="f.clientName" label="Client Name" type="select" required :options="names" placeholder="Select Client" />
      </div>
      <FormControl v-model="f.comment" label="Comment" type="textarea" required :rows="3" placeholder="Enter discussion notes..." />
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <!-- a manually logged call can be abandoned; a real call's log cannot (CALL-003) -->
        <Button v-if="p?.manual" label="Cancel" @click="db.pendingLog = null" />
        <Button variant="solid" :label="isNext ? 'Next' : 'Save'" @click="primaryAction" />
      </div>
    </template>
  </Dialog>
  <EventModal v-if="client" v-model:open="eventOpen" :client-id="client.id" after-call :dismissible="false" @created="onEventCreated" @cancel="onEventCancel" />
</template>
