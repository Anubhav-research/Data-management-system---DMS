<script setup>
// Create / Update Deal (D05 §6.6-6.8; DEAL-003..011; Fig 14362 create, 14798 update).
// Rows change by product (DEAL-005); + Add product and Create deal disabled until rows complete (DEAL-006);
// total is system-calculated (DEAL-004); Completed needs Final Investment Amount + Remark (DEAL-008).
import { timeOptions, TIME_FORMAT, todayIso, nextMinute, pastReason } from '@/utils/timeOptions'
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, Switch, toast } from 'frappe-ui'
import { DEAL_PRODUCTS, DEAL_STATUSES, AMCS, FD_COMPANIES, FD_TENURES, NCD_ISSUERS } from '@/data/masters'
import { createDeal, updateDeal, rowComplete } from '@/services/work'
import { inr, toInputDate, toInputTime, combineDateTime } from '@/utils/format'

const props = defineProps({ clientId: String, deal: { type: Object, default: null } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['saved'])
const blankRow = () => ({ product: '', amc: '', scheme: '', company: '', tenure: '', issuer: '', amount: '' })
const f = ref({})
const error = ref('')
watch(open, (v) => {
  if (!v) return
  error.value = ''
  if (props.deal) {
    const d = props.deal
    f.value = { allDay: d.allDay, date: toInputDate(d.start), startT: toInputTime(d.start), endT: toInputTime(d.end), rows: d.rows.map((r) => ({ ...blankRow(), ...r })), status: d.status === 'Expired' ? 'Scheduled' : d.status, finalAmount: d.finalAmount || '', remark: d.remark || '' }
  } else {
    const s = nextMinute() // never in the past
    f.value = { allDay: false, date: toInputDate(s), startT: toInputTime(s), endT: toInputTime(s.getTime() + 2 * 60000), rows: [blankRow()], status: 'Scheduled', finalAmount: '', remark: '' }
  }
})
const isUpdate = computed(() => !!props.deal)
const allComplete = computed(() => f.value.rows?.length && f.value.rows.every(rowComplete))
const total = computed(() => (f.value.rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0))
const isMF = (p) => p?.startsWith('MF')
// End time: picking a start always sets the end to start + 2 minutes (the default length). Same as the event form.
const dMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0) }
const dHHMM = (n) => { n = Math.max(0, Math.min(23 * 60 + 59, n)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
watch(() => [f.value, f.value?.startT], ([form, now], [formBefore]) => {
  if (form !== formBefore || !now) return // a new or opened deal fills the whole form: keep its own end time
  form.endT = dHHMM(dMin(now) + 2)
})
function setProduct(r, p) { Object.assign(r, blankRow(), { product: p, amount: r.amount }) }
function payload() {
  const v = f.value
  const start = combineDateTime(v.date, v.allDay ? '00:00' : v.startT)
  const end = combineDateTime(v.date, v.allDay ? '23:59' : v.endT)
  const rows = v.rows.map((r) => {
    const o = { product: r.product, amount: Number(r.amount) }
    if (isMF(r.product)) Object.assign(o, { amc: r.amc, scheme: r.scheme })
    if (r.product === 'FD') Object.assign(o, { company: r.company, tenure: r.tenure })
    if (r.product === 'NCD') Object.assign(o, { issuer: r.issuer })
    return o
  })
  return { allDay: v.allDay, start, end, rows }
}
function submit() {
  error.value = ''
  const v = f.value
  if (!v.date) { error.value = 'Date is mandatory.'; return }
  if (!v.allDay && v.endT < v.startT) { error.value = 'End time cannot be before start time.'; return }
  // nothing in the past: a new deal, or an opened one whose date or time was changed
  { const st = combineDateTime(v.date, v.allDay ? '00:00' : v.startT); if (!props.deal || st !== props.deal.start) { const why = v.allDay ? (v.date < todayIso() ? 'Date must be today or later.' : '') : pastReason(st); if (why) { error.value = why; return } } }
  if (v.rows.some((r) => r.amount !== '' && !(Number(r.amount) > 0 && Number.isInteger(Number(r.amount))))) { error.value = 'Amounts must be whole rupees above zero.'; return }
  try {
    if (isUpdate.value) {
      updateDeal(props.deal, { ...payload(), status: v.status, finalAmount: v.status === 'Completed' ? Number(v.finalAmount) : null, remark: v.remark })
      toast.success('Deal updated')
    } else {
      createDeal(props.clientId, payload())
      toast.success('Deal created (Scheduled)')
    }
    open.value = false; emit('saved')
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <Dialog v-model:open="open" :title="isUpdate ? 'Update Deal' : 'Create Deal'" size="3xl">
    <div class="space-y-4" v-if="f.rows">
      <div class="flex items-center gap-3"><span class="w-28 text-base text-ink-gray-6">All Day</span><Switch v-model="f.allDay" /></div>
      <div class="flex items-center gap-3">
        <span class="w-28 text-base text-ink-gray-6">Date &amp; Time <span class="text-ink-red-5">*</span></span>
        <div class="grid min-w-0 flex-1 gap-2" :class="f.allDay ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]'">
          <FormControl v-model="f.date" type="date" format="MMM D, YYYY" :min="todayIso()" class="min-w-0 [&_input]:w-full" />
          <template v-if="!f.allDay">
            <FormControl v-model="f.startT" type="time" :format="TIME_FORMAT" :options="timeOptions({ date: f.date, keep: f.startT })" class="min-w-0 [&_input]:w-full" />
            <FormControl v-model="f.endT" type="time" :format="TIME_FORMAT" :options="timeOptions({ after: f.startT, keep: f.endT })" class="min-w-0 [&_input]:w-full" />
          </template>
        </div>
      </div>
      <div>
        <div class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-gray-5">Product Details</div>
        <div class="space-y-2">
          <div v-for="(r, i) in f.rows" :key="i" class="flex items-end gap-2 rounded-6 border p-2">
            <FormControl :model-value="r.product" type="select" label="Product" :options="DEAL_PRODUCTS" placeholder="Select product" class="w-40" @update:model-value="(p) => setProduct(r, p)" />
            <template v-if="isMF(r.product)">
              <FormControl v-model="r.amc" type="select" label="AMC" :options="Object.keys(AMCS)" placeholder="Fund house" class="flex-1" @update:model-value="r.scheme = ''" />
              <FormControl v-model="r.scheme" type="select" label="Scheme Name" :options="AMCS[r.amc] || []" placeholder="Scheme" class="flex-1" :disabled="!r.amc" />
            </template>
            <template v-else-if="r.product === 'FD'">
              <FormControl v-model="r.company" type="select" label="Company" :options="FD_COMPANIES" class="flex-1" />
              <FormControl v-model="r.tenure" type="select" label="Tenure" :options="FD_TENURES" class="w-32" />
            </template>
            <template v-else-if="r.product === 'NCD'">
              <FormControl v-model="r.issuer" type="select" label="Issuer" :options="NCD_ISSUERS" class="flex-1" />
            </template>
            <div v-else class="flex-1" />
            <FormControl v-if="r.product" v-model="r.amount" type="number" label="Amount (₹)" placeholder="0" class="w-36" />
            <Button variant="ghost" icon="lucide-trash-2" :disabled="f.rows.length === 1" @click="f.rows.splice(i, 1)" />
          </div>
        </div>
        <Button class="mt-2" variant="ghost" icon-left="lucide-plus" label="Add product" :disabled="!allComplete" @click="f.rows.push(blankRow())" />
      </div>
      <div class="flex items-center justify-between rounded-6 bg-surface-gray-1 px-3 py-2">
        <span class="text-base text-ink-gray-6">Total deal amount</span>
        <span class="text-lg font-semibold text-ink-gray-9">{{ inr(total) }}</span>
      </div>
      <div v-if="isUpdate" class="grid grid-cols-2 gap-3 border-t pt-4">
        <FormControl v-model="f.status" type="select" label="Status" :options="DEAL_STATUSES" />
        <FormControl v-if="f.status === 'Completed'" v-model="f.finalAmount" type="number" label="Final Investment Amount (₹)" required />
        <div class="col-span-2">
          <FormControl v-model="f.remark" type="textarea" label="Remark" :required="f.status === 'Completed'" :rows="2" placeholder="e.g. Client invested ₹75,000 in FD after the discussion." />
          <p v-if="f.status === 'Completed'" class="mt-1 text-xs text-ink-gray-5">This field is mandatory for completed deals.</p>
        </div>
      </div>
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" @click="open = false" />
        <Button variant="solid" :label="isUpdate ? 'Update deal' : 'Create deal'" :disabled="!allComplete" @click="submit" />
      </div>
    </template>
  </Dialog>
</template>
