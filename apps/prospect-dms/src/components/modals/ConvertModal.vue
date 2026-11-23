<script setup>
// "Convert Client – Choose the next stage for this client" (Fig 7608, 11663; X06 CONVERT_OPTIONS; POOL-018).
// mandatory=true for the Pool decision after a connected call (cannot be dismissed).
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, Button, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { CONVERT_OPTIONS } from '@/data/masters'
import { convertFromPool, releaseToPool, moveToLead, moveToProspect, RuleError } from '@/services/lifecycle'
import ConversionWizard from './ConversionWizard.vue'

const props = defineProps({ clientId: String, mandatory: Boolean, preverify: { type: String, default: null } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['done'])
const db = useDb(); const router = useRouter()
const client = computed(() => db.clientById(props.clientId))
const options = computed(() => CONVERT_OPTIONS[client.value?.stage] || [])
const choice = ref('')
const error = ref('')
const invOpen = ref(false)
watch(open, (v) => { if (v) { choice.value = options.value.length === 1 ? options.value[0] : ''; error.value = '' } })
/** Open the wizard straight away (self-registration banner, DECISION-21). */
function openWizard() { invOpen.value = true }
defineExpose({ openWizard })

function submit() {
  error.value = ''
  if (!choice.value) { error.value = 'Choose one option.'; return }
  const c = client.value
  try {
    if (choice.value === 'Convert to Investor') { open.value = false; setTimeout(() => (invOpen.value = true), 150); return } // close first: nested modal layers block input
    if (choice.value === 'Move to Prospect' || choice.value === 'Move to Lead') {
      if (c.stage === 'Pool') convertFromPool(c, choice.value === 'Move to Prospect' ? 'Prospect' : 'Lead', c.batchOf || db.sessionUserId)
      else if (choice.value === 'Move to Prospect') moveToProspect(c) // Lead -> Prospect, nothing restarts (D02 §4.8)
      else moveToLead(c)
      toast.success(`Moved to ${c.stage}`)
    }
    if (choice.value === 'Release to Pool') {
      const r = releaseToPool(c)
      toast.success(r === 'Junk' ? 'The record reached a Junk rule and moved to Junk.' : r === 'Inactive' ? 'Released to Pool (inactive for 30 days)' : 'Released to Pool')
    }
    if (db.pendingConvert?.clientId === c.id) db.pendingConvert = null
    open.value = false
    emit('done', choice.value)
    if (choice.value === 'Release to Pool' && props.mandatory === false) router.push(c.prevOwner ? '/prospects' : '/pool')
  } catch (e) { error.value = e instanceof RuleError ? e.message : String(e.message) }
}
function onInvestor() { invOpen.value = false; open.value = false; if (db.pendingConvert?.clientId === props.clientId) db.pendingConvert = null; emit('done', 'Convert to Investor') }
</script>
<template>
  <Dialog v-model:open="open" :dismissible="!mandatory" :show-close-button="!mandatory" size="sm">
    <template #title>
      <div>
        <h3 class="text-xl font-semibold text-ink-gray-9">Convert Client</h3>
        <p class="mt-1 text-sm text-ink-gray-6">Choose the next stage for this client</p>
      </div>
    </template>
    <div class="space-y-1">
      <label v-for="o in options" :key="o" class="flex cursor-pointer items-center gap-3 rounded-4 px-2 py-2.5 text-base hover:bg-surface-gray-2">
        <input v-model="choice" type="radio" :value="o" class="text-ink-gray-9 focus:ring-0" />{{ o }}
      </label>
      <p v-if="mandatory" class="pt-2 text-xs text-ink-gray-5">A decision is required after a connected Pool call (POOL-018).</p>
      <p v-if="error" class="pt-2 text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end"><Button variant="solid" label="SUBMIT" @click="submit" /></div>
    </template>
  </Dialog>
  <ConversionWizard v-if="client" v-model:open="invOpen" :client-id="client.id" :preverify="preverify" @done="onInvestor" />
</template>
