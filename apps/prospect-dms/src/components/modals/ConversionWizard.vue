<script setup>
// Conversion to Investor (split prompt §5.2): replaces the old Convert to Investor modal; same look (Figma 13365).
// One screen: verify on the Transaction Platform, then Convert. Verified people move to Investor DMS; the rest stay
// here as Investor Family (no keep / move / release choice). When the family primary is not verified and several
// people are, the specialist picks the investor primary on the same screen.
import { ref, computed, watch } from 'vue'
import { Dialog, Button, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { initials } from '@/utils/format'
import PersonTip from '@/components/PersonTip.vue'
import { investorMembers } from '@/services/family'
import { fullName } from '@/services/lifecycle'
import { wizardRows, verifyRow, classifyRows, blockReason, defaultInvestorPrimary, confirmConversion } from '@/services/handover'

const props = defineProps({ clientId: String, preverify: { type: String, default: null } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['done'])
const db = useDb()
const client = computed(() => db.clientById(props.clientId))
const rows = ref([])
const primaryKey = ref(null)
const error = ref('')
const busy = ref(false)
const isLater = computed(() => client.value?.stage === 'Investor Family') // a later registration joins the existing investor group

watch(open, async (v) => {
  if (!v || !client.value) return
  error.value = ''; busy.value = false; primaryKey.value = null
  rows.value = wizardRows(client.value)
  // self-registration (DECISION-21): open with that person already verified
  const pre = rows.value.find((r) => r.key === props.preverify)
  if (pre) await verify(pre)
})
async function verify(r) {
  error.value = ''
  await verifyRow(r)
  classifyRows(client.value, rows.value)
}
async function verifyAll() { for (const r of rows.value) if (r.value && !['verified', 'checking'].includes(r.state)) await verifyRow(r); classifyRows(client.value, rows.value) }
const reason = computed(() => blockReason(rows.value))
const verified = computed(() => rows.value.filter((r) => r.state === 'verified'))
const familyPrimaryVerified = computed(() => verified.value.some((r) => r.key === client.value?.members[0].key))
// investor primary: chosen only when the family primary is not verified and more than one person is
const choosePrimary = computed(() => !isLater.value && !familyPrimaryVerified.value && verified.value.length > 1)
watch(verified, (v) => { if (!v.some((r) => r.key === primaryKey.value)) primaryKey.value = v.length ? defaultInvestorPrimary(client.value, rows.value) : null })
async function confirm() {
  classifyRows(client.value, rows.value)
  if (reason.value) { error.value = reason.value; return }
  if (!primaryKey.value) primaryKey.value = defaultInvestorPrimary(client.value, rows.value)
  error.value = ''; busy.value = true
  try {
    const id = await confirmConversion(client.value.id, rows.value, primaryKey.value)
    toast.success('Converted to Investor. Family moved to Investor Family.')
    open.value = false
    emit('done', id)
  } catch (e) { error.value = e.message } finally { busy.value = false }
}
const STATE = {
  verified: { icon: 'lucide-circle-check', cls: 'text-ink-green-5', text: 'Verified ✓' },
  nomatch: { icon: 'lucide-circle-x', cls: 'text-ink-red-5', text: 'No match found' },
  invalid: { icon: 'lucide-circle-x', cls: 'text-ink-red-5', text: 'Invalid format (AAAAA9999A or CID)' },
  'other-advisor': { icon: 'lucide-ban', cls: 'text-ink-red-5', text: 'Already an investor with {advisor}' },
  'other-family': { icon: 'lucide-ban', cls: 'text-ink-red-5', text: 'Different family on the platform' },
  error: { icon: 'lucide-wifi-off', cls: 'text-ink-amber-6', text: 'Transaction Platform not reachable' },
  checking: { icon: 'lucide-loader-circle animate-spin', cls: 'text-ink-gray-5', text: 'Checking…' },
}
const stateText = (r) => (STATE[r.state]?.text || '').replace('{advisor}', r.tp?.advisorName || r.tp?.advisorMhfId || '')
</script>
<template>
  <Dialog v-model:open="open" size="2xl" :dismissible="!busy">
    <template #title>
      <div>
        <h3 class="text-xl font-semibold text-ink-gray-9">Convert to Investor</h3>
        <p class="mt-1 text-sm text-ink-gray-6">Verify on the Transaction Platform</p>
      </div>
    </template>
    <div v-if="client">
        <p class="mb-3 text-p-sm text-ink-gray-6">Enter PAN/CID for the primary client and any group members you have information for. Not everyone needs to be entered — you can continue as long as at least one person verified.</p>
        <div v-if="investorMembers(client).length" class="mb-3 rounded-4 bg-surface-green-1 px-3 py-2 text-sm text-ink-green-8">
          Already investors in this family: {{ investorMembers(client).map(fullName).join(', ') }}. New investors from the same family on the Transaction Platform join their investor group in Investor DMS; someone registered in a different platform family becomes a separate investor group.
        </div>
        <div class="space-y-1" data-testid="wizard-rows">
          <div v-for="(r, i) in rows" :key="r.key" class="flex items-center gap-3 py-1.5" :data-person="r.name">
            <PersonTip :name="r.name"><span class="flex size-7 items-center justify-center rounded-full bg-surface-gray-3 text-2xs font-medium">{{ initials(r.name) }}</span></PersonTip>
            <div class="min-w-0 flex-1"><div class="truncate text-base text-ink-gray-8">{{ r.name }}</div><div class="text-sm text-ink-gray-5">{{ i === 0 && r.rel === 'Primary' ? 'Primary client' : r.rel }}</div></div>
            <div class="w-72">
              <div class="flex items-center gap-2">
                <input v-model="r.value" placeholder="PAN / CID" class="w-full rounded-4 py-1 text-sm uppercase" :class="['nomatch', 'invalid', 'other-advisor', 'other-family'].includes(r.state) ? 'border-outline-red-3' : 'border-outline-gray-2'" @input="r.state = ''" @keydown.enter="verify(r)" />
                <Button size="sm" label="Verify" :loading="r.state === 'checking'" @click="verify(r)" />
                <span v-if="STATE[r.state]" :class="[STATE[r.state].icon, STATE[r.state].cls]" class="size-4 shrink-0" />
              </div>
              <div v-if="r.state && r.state !== 'checking'" class="mt-0.5 text-xs" :class="r.state === 'verified' ? 'text-ink-green-7' : 'text-ink-red-7'" data-testid="row-state">{{ stateText(r) }}</div>
              <div v-if="r.separate" class="mt-0.5 text-xs text-ink-amber-8" data-testid="row-separate">Different family on the Transaction Platform. Becomes a separate investor group in Investor DMS.</div>
            </div>
          </div>
        </div>
        <div class="mt-2 flex justify-end"><Button size="sm" variant="ghost" icon-left="lucide-refresh-cw" label="Verify all" @click="verifyAll" /></div>
      <div v-if="choosePrimary" class="mt-3 rounded-4 border px-3 py-2.5 text-sm" data-testid="choose-primary">
        <div class="mb-1.5 text-ink-gray-7">{{ fullName(client.members[0]) }} isn't verified. Who becomes the investor primary?</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <label v-for="r in verified" :key="r.key" class="flex items-center gap-1.5 text-ink-gray-8"><input v-model="primaryKey" type="radio" :value="r.key" class="focus:ring-0" />{{ r.name }}</label>
        </div>
      </div>
      <p v-if="error || (reason && rows.some((r) => r.state))" class="mt-3 text-sm text-ink-red-7" data-testid="wizard-error">{{ error || reason }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" :disabled="busy" @click="open = false" />
        <Button variant="solid" label="Convert" :disabled="!!reason" :loading="busy" @click="confirm" />
      </div>
    </template>
  </Dialog>
</template>
