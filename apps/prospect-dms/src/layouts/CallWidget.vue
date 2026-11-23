<script setup>
// Call widget (Fig 5612 full / 7592 minimised; D04 §2.3). Persists on every page while the call lasts.
// DEMO: the phone system is simulated - the user chooses how the call ends.
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { endCall } from '@/services/calls'
import { NOT_CONNECTED_REASONS } from '@/data/masters'
import { fmtDurationShort, initials } from '@/utils/format'
import PersonTip from '@/components/PersonTip.vue'

const db = useDb(); const router = useRouter()
const call = computed(() => db.activeCall)
const tick = ref(Date.now())
const t = setInterval(() => (tick.value = Date.now()), 1000)
onUnmounted(() => clearInterval(t))
const elapsed = computed(() => (call.value ? fmtDurationShort((tick.value - call.value.startedAt) / 1000) : ''))
const masked = computed(() => {
  const c = call.value && db.clientById(call.value.clientId)
  return c?.stage === 'Pool' ? `+91 ${call.value.mobile.slice(0, 5)}XXXXX` : `+91 ${call.value?.mobile}`
})
function finish(connected, reason) {
  const r = endCall({ connected, reason })
  if (r?.junked) toast.warning(`Not connected. Junk rule ${r.junked} reached - the record moved to Junk.`) // D06 §6.2.2
  else if (r?.inactive) { toast.info(`Not connected (${reason}). Record moved to Inactive Pool for 30 days.`); router.push('/pool') }
  else if (!connected) toast.info(`Not connected (${reason}). Call logged automatically.`)
}
const notConnectedMenu = NOT_CONNECTED_REASONS.map((r) => ({ label: r, onClick: () => finish(false, r) }))
</script>
<template>
  <div v-if="call" class="fixed bottom-6 right-6 z-[60]">
    <div v-if="!call.minimized" class="w-72 rounded-7 bg-black p-6 text-center text-white shadow-2xl">
      <div class="flex justify-end"><button class="lucide-minimize-2 size-4 text-gray-400 hover:text-white" title="Minimise" @click="call.minimized = true" /></div>
      <button class="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/15 text-xl font-semibold" title="Open record" @click="router.push(`/record/${call.clientId}`)">{{ initials(call.personName) }}</button>
      <div class="text-lg font-medium">{{ call.personName }}</div>
      <div class="text-sm text-gray-400">{{ masked }}</div>
      <div class="mt-1 text-sm tabular text-gray-300">{{ elapsed }}</div>
      <div class="mt-5 flex items-center justify-center gap-3">
        <button class="flex h-10 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-medium hover:bg-green-500" @click="finish(true)"><span class="lucide-phone-off size-4" />End (connected)</button>
        <Dropdown :options="notConnectedMenu" side="top">
          <button class="flex size-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-500" title="Not connected – choose reason"><span class="lucide-phone-missed size-4" /></button>
        </Dropdown>
      </div>
      <p class="mt-3 text-[11px] leading-tight text-gray-500">Demo: phone system simulated. Choose how the call ends.</p>
    </div>
    <div v-else class="flex h-12 w-64 items-center justify-between rounded-full bg-black px-2 text-white shadow-xl">
      <button class="flex items-center gap-2" @click="call.minimized = false">
        <PersonTip :name="call.personName"><span class="flex size-8 items-center justify-center rounded-full bg-white/15 text-xs">{{ initials(call.personName) }}</span></PersonTip>
        <span class="text-sm">{{ call.personName.split(' ')[0] }}</span>
      </button>
      <span class="text-sm tabular">{{ elapsed }}</span>
      <button class="flex size-8 items-center justify-center rounded-full bg-red-600" title="End call (connected)" @click="finish(true)"><span class="lucide-phone-off size-4" /></button>
    </div>
  </div>
</template>
