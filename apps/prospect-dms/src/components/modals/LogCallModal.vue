<script setup>
// Manual "Log a Call" (Calls tab). Step 1 here: call type, number, when, status (+ duration or reason).
// Not Connected saves here. Connected hands over to the standard "Create Call Log" form (CallLogModal) for
// outcome, client name and comment, so every outcome rule stays in one place.
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, toast } from 'frappe-ui'
import { NOT_CONNECTED_REASONS } from '@/data/masters'
import { phoneBook, logManualCall } from '@/services/calls'

const props = defineProps({ client: Object })
const open = defineModel('open', { default: false })
const numbers = computed(() => phoneBook(props.client).flatMap((p) => p.numbers.map((n) => ({ label: `${p.name} +91 ${n}`, value: n }))))
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const blank = () => ({ direction: 'Outbound', mobile: numbers.value[0]?.value || '', at: localNow(), status: 'Connected', minutes: '', reason: '' })
const f = ref(blank())
const error = ref('')
watch(open, (v) => { if (v) { f.value = blank(); error.value = '' } })
const connected = computed(() => f.value.status === 'Connected')

function save() {
  error.value = ''
  if (connected.value && !(Number(f.value.minutes) > 0)) return (error.value = 'Call Duration is mandatory for a connected call.')
  try {
    const r = logManualCall(props.client, {
      direction: f.value.direction, mobile: f.value.mobile, at: new Date(f.value.at).getTime(),
      duration: Math.round(Number(f.value.minutes || 0) * 60), connected: connected.value, reason: f.value.reason,
    })
    open.value = false
    if (r.pending) return // the Create Call Log form opens next
    toast.success('Call logged')
    if (r.junked) toast.info('Pool rule reached – the record moved to Junk.')
    else if (r.inactive) toast.info('Record is now Inactive Pool.')
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <Dialog v-model:open="open" size="xl">
    <template #title><h3 class="text-xl font-semibold text-ink-gray-9">Log a Call</h3></template>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <FormControl v-model="f.direction" label="Call Type" type="select" required :options="['Outbound', 'Inbound']" />
        <FormControl v-model="f.mobile" label="Mobile Number" type="select" required :options="numbers" placeholder="Select number" />
        <FormControl v-model="f.at" label="Date & Time" type="datetime-local" required :max="localNow()" />
        <FormControl v-model="f.status" label="Call Status" type="select" required :options="['Connected', 'Not Connected']" />
        <FormControl v-if="connected" v-model="f.minutes" label="Call Duration (minutes)" type="number" required min="1" placeholder="e.g. 5" />
        <FormControl v-else v-model="f.reason" label="Reason" type="select" required :options="NOT_CONNECTED_REASONS" placeholder="Select reason" />
      </div>
      <p class="text-xs text-ink-gray-5">{{ connected ? 'Next: choose the call outcome and add your comment.' : 'Saved as a Not Connected call.' }}</p>
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" @click="open = false" />
        <Button variant="solid" :label="connected ? 'Next' : 'Save'" @click="save" />
      </div>
    </template>
  </Dialog>
</template>
