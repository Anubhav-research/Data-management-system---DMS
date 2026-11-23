<script setup>
// Remove Group Member wizard (D03 §21; Fig 29651/29716 -> 29507/29434/29599 -> 29341/29390).
// Step 1 select members (Primary cannot be removed); 2 Keep together / Keep separate + destination; 3 Review.
import { ref, computed, watch } from 'vue'
import { Dialog, Button, toast } from 'frappe-ui'
import { submitRequest, NON_FAMILY_RELATIONSHIPS } from '@/services/approvals'
import { fullName, assertRoom } from '@/services/lifecycle'

const props = defineProps({ client: Object })
const open = defineModel('open', { default: false })
const step = ref(1)
const sel = ref([])
const mode = ref('together')
const primaryKey = ref('')
const destination = ref('Stay')
const destinations = ref({})
watch(open, (v) => { if (v) { step.value = 1; sel.value = []; mode.value = 'together'; destination.value = 'Stay'; destinations.value = {} } })
const members = computed(() => props.client.members.slice(1).filter((m) => !m.investor)) // investors are handled in Investor DMS
const isFamily = computed(() => props.client.stage === 'Investor Family')
// DECISION-17 (default, confirm): from an Investor Family, Release to Pool only for Reference / Other
const canRelease = (keys) => !isFamily.value || keys.every((k) => NON_FAMILY_RELATIONSHIPS.includes(props.client.members.find((m) => m.key === k)?.relationship))
const chosen = computed(() => members.value.filter((m) => sel.value.includes(m.key)))
const stayLabel = computed(() => (props.client.stage === 'Lead' ? 'Stay in Lead' : isFamily.value ? 'Become a Prospect (same IS)' : 'Stay in Prospect'))
const destLabel = (d) => (d === 'Stay' ? stayLabel.value : 'Release to Pool')
watch(sel, (v) => { primaryKey.value = v[0] || ''; v.forEach((k) => { if (!destinations.value[k]) destinations.value[k] = 'Stay' }) })
const single = computed(() => chosen.value.length === 1)
const effectiveMode = computed(() => (single.value ? 'together' : mode.value))
function next() {
  if (step.value === 1 && !sel.value.length) return toast.error('Select at least one group member.')
  step.value++
}
function submit() {
  const payload = { op: 'remove', memberKeys: [...sel.value], mode: effectiveMode.value, primaryKey: primaryKey.value, destination: destination.value, destinations: { ...destinations.value } }
  try {
    const stays = effectiveMode.value === 'together' ? (destination.value === 'Stay' ? 1 : 0) : sel.value.filter((k) => destinations.value[k] === 'Stay').length
    if (stays) assertRoom(props.client.assignedTo, stays) // 1500 check at submit (D03 §21.7)
    const r = submitRequest({ clientId: props.client.id, category: 'Group Member', payload })
    toast.success(r.status === 'Approved' ? 'Group members removed' : 'Removal sent for approval')
    open.value = false
  } catch (e) { toast.error(e.message) }
}
const steps = ['Select members', 'Group & destination', 'Review']
</script>
<template>
  <Dialog v-model:open="open" size="2xl">
    <template #title>
      <div>
        <h3 class="text-xl font-semibold text-ink-gray-9">Remove Group Member</h3>
        <p class="mt-1 text-sm text-ink-gray-6">Choose what should happen to the selected members after they leave this group.</p>
        <div class="mt-3 flex items-center gap-2 text-sm">
          <template v-for="(s, i) in steps" :key="s">
            <span v-if="i" class="h-px w-6 bg-outline-gray-2" />
            <span class="flex items-center gap-1.5" :class="step === i + 1 ? 'font-medium text-ink-gray-9' : 'text-ink-gray-5'">
              <span class="flex size-5 items-center justify-center rounded-full text-2xs" :class="step > i + 1 ? 'bg-surface-green-7 text-white' : step === i + 1 ? 'bg-surface-gray-9 text-white' : 'bg-surface-gray-3'">
                <span v-if="step > i + 1" class="lucide-check size-3" /><template v-else>{{ i + 1 }}</template>
              </span>{{ s }}
            </span>
          </template>
        </div>
      </div>
    </template>
    <!-- Step 1 -->
    <div v-if="step === 1" class="space-y-2">
      <p class="text-sm text-ink-gray-6">Select one or more Group Members. Primary cannot be removed from this action.</p>
      <label v-for="(m, i) in members" :key="m.key" class="flex cursor-pointer items-center gap-3 rounded-6 border p-3 hover:bg-surface-gray-1" :class="sel.includes(m.key) && 'border-outline-gray-4 bg-surface-gray-1'">
        <input v-model="sel" type="checkbox" :value="m.key" class="rounded-1" />
        <div class="flex-1"><div class="text-base font-medium text-ink-gray-8">{{ fullName(m) }}</div><div class="text-sm text-ink-gray-5">Group Member-{{ i + 1 }} · {{ m.relationship }}</div></div>
        <span class="rounded-4 bg-surface-gray-2 px-1.5 py-0.5 text-xs text-ink-gray-6">{{ client.stage }}</span>
      </label>
      <p v-if="!members.length" class="py-6 text-center text-sm text-ink-gray-5">This record has no group members.</p>
      <p class="rounded-4 bg-surface-blue-1 px-3 py-2 text-xs text-ink-blue-7">Removing a member changes the group relationship; it does not delete the person's DMS record.</p>
    </div>
    <!-- Step 2 -->
    <div v-else-if="step === 2" class="space-y-4">
      <template v-if="!single">
        <p class="text-sm text-ink-gray-7">How should these selected members be kept after removal?</p>
        <div class="grid grid-cols-2 gap-3">
          <label v-for="o in [{ v: 'together', t: 'Keep together', d: 'All selected members stay in the same group after removal.' }, { v: 'separate', t: 'Keep separate', d: 'Each selected member is handled as an individual group.' }]" :key="o.v"
            class="cursor-pointer rounded-6 border p-3" :class="mode === o.v && 'border-outline-gray-5 bg-surface-gray-1'">
            <div class="flex items-center gap-2 text-base font-medium"><input v-model="mode" type="radio" :value="o.v" />{{ o.t }}</div>
            <p class="mt-1 text-sm text-ink-gray-6">{{ o.d }}</p>
          </label>
        </div>
      </template>
      <div v-if="effectiveMode === 'together'" class="space-y-3 rounded-6 border p-3">
        <div class="text-sm font-medium text-ink-gray-7">New group structure · {{ chosen.length }} member(s)</div>
        <div v-if="!single" class="grid grid-cols-2 gap-3">
          <label class="text-sm text-ink-gray-6">PRIMARY MEMBER
            <select v-model="primaryKey" class="mt-1 w-full rounded-4 border-outline-gray-2 py-1.5 text-base"><option v-for="m in chosen" :key="m.key" :value="m.key">{{ fullName(m) }}</option></select>
          </label>
        </div>
        <label class="block text-sm text-ink-gray-6">GROUP DESTINATION
          <select v-model="destination" class="mt-1 w-full rounded-4 border-outline-gray-2 py-1.5 text-base"><option value="Stay">{{ stayLabel }}</option><option v-if="canRelease(sel)" value="Release">Release to Pool</option></select>
        </label>
      </div>
      <div v-else class="space-y-2">
        <p class="text-sm text-ink-gray-6">Each selected member is handled independently. A member sent to {{ stayLabel.replace('Stay in ', '') }} becomes Primary automatically.</p>
        <div v-for="m in chosen" :key="m.key" class="flex items-center justify-between rounded-6 border p-3">
          <div><div class="text-base font-medium">{{ fullName(m) }}</div><div class="text-sm text-ink-gray-5">{{ client.stage }} · Non-Investor</div></div>
          <select v-model="destinations[m.key]" class="w-44 rounded-4 border-outline-gray-2 py-1.5 text-sm"><option value="Stay">{{ stayLabel }}</option><option v-if="canRelease([m.key])" value="Release">Release to Pool</option></select>
        </div>
      </div>
    </div>
    <!-- Step 3 -->
    <div v-else class="space-y-3">
      <p class="text-sm text-ink-gray-6">Review the final group structure and destination before sending the request for approval.</p>
      <div class="rounded-6 border p-3 text-base">
        <template v-if="effectiveMode === 'together'">
          <div class="mb-2 text-sm font-medium text-ink-gray-7">One new group</div>
          <div class="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <span class="text-ink-gray-5">Members</span><span>{{ chosen.map(fullName).join(', ') }}</span>
            <span class="text-ink-gray-5">Primary</span><span>{{ fullName(chosen.find((m) => m.key === primaryKey) || chosen[0]) }}</span>
            <span class="text-ink-gray-5">Destination</span><span>{{ destLabel(destination) }}</span>
          </div>
        </template>
        <template v-else>
          <div class="mb-2 text-sm font-medium text-ink-gray-7">Separate outcomes</div>
          <div v-for="m in chosen" :key="m.key" class="text-sm">{{ fullName(m) }} — {{ destLabel(destinations[m.key]) }}</div>
        </template>
      </div>
      <p class="rounded-4 bg-surface-blue-1 px-3 py-2 text-xs text-ink-blue-7">No family change happens immediately. The configured approval hierarchy must be completed first.</p>
    </div>
    <template #actions>
      <div class="flex justify-between">
        <Button v-if="step > 1" label="Back" @click="step--" /><span v-else />
        <div class="flex gap-2">
          <Button label="Cancel" @click="open = false" />
          <Button v-if="step < 3" variant="solid" label="Continue" @click="next" />
          <Button v-else variant="solid" label="Submit for Approval" @click="submit" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
