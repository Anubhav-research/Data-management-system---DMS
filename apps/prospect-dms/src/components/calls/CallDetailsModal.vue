<script setup>
// "Call Details" pop-up (port of Frappe CRM Modals/CallLogDetailModal.vue; Fig 21531; CALL-011).
// Opened from a call card on the record's Calls tab and from a row on the Call Logs page.
// Recording player only with the "Play Call Recordings" switch (D06 §9.6). The comment is locked after
// saving (CALL-007), so there is no Edit; ⋯ offers Add Note / Add Task like Frappe CRM.
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dialog, Button, Dropdown, Avatar, Tooltip } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { hasSwitch, isAdmin } from '@/services/access'
import { callParties, callWhen, callDuration, callStatusClass, recordingUrl } from '@/services/callView'
import { fmtDateTime } from '@/utils/format'
import NoteModal from '@/components/modals/NoteModal.vue'
import TaskModal from '@/components/modals/TaskModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ call: { type: Object, default: null } })
const open = defineModel('open', { default: false })
const db = useDb(); const router = useRouter()
const l = computed(() => props.call)
const parties = computed(() => (l.value ? callParties(l.value) : null))
const canPlay = computed(() => hasSwitch('play_recordings'))
const src = ref('')
const recordingError = ref(false)
watch([open, l], ([o]) => { if (o && l.value) { recordingError.value = false; src.value = canPlay.value ? recordingUrl(l.value) : '' } }, { immediate: true })
function goToRecord() { open.value = false; router.push({ path: `/record/${l.value.clientId}`, query: { tab: 'calls' } }) }
const noteOpen = ref(false)
const taskOpen = ref(false)
const menu = [{ label: 'Add Note', icon: 'lucide-notebook-pen', onClick: () => (noteOpen.value = true) }, { label: 'Add Task', icon: 'lucide-circle-check-big', onClick: () => (taskOpen.value = true) }]
const empSub = (p) => (p.kind === 'user' && isAdmin() ? p.sub : '')
</script>
<template>
  <Dialog v-model:open="open" size="lg" :show-close-button="false">
    <template #title>
      <div class="flex w-full items-center justify-between">
        <h3 class="text-2xl font-semibold text-ink-gray-9">Call Details</h3>
        <div class="flex items-center gap-1">
          <Dropdown :options="menu"><Button variant="ghost" icon="lucide-ellipsis" aria-label="More" /></Dropdown>
          <Button variant="ghost" icon="lucide-x" aria-label="Close" class="w-7" @click="open = false" />
        </div>
      </div>
    </template>
    <div v-if="l" class="flex flex-col gap-3.5 pb-2 text-base text-ink-gray-8">
      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span :class="l.direction === 'Inbound' ? 'lucide-phone-incoming' : 'lucide-phone-outgoing'" class="size-3.5" /></div>
        <div class="flex min-h-7 items-center">{{ l.direction === 'Inbound' ? 'Incoming Call' : 'Outgoing Call' }}</div></div>

      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-contact-round size-4" /></div>
        <div class="flex min-h-7 flex-wrap items-center gap-1">
          <PersonTip :user-id="parties.caller.userId" :name="parties.caller.label"><Avatar :label="parties.caller.label" size="sm" /></PersonTip><span class="ml-1 leading-tight">{{ parties.caller.label }}<span v-if="empSub(parties.caller)" class="block text-xs tabular text-ink-gray-5">{{ empSub(parties.caller) }}</span></span>
          <span class="lucide-arrow-right mx-1 size-4 text-ink-gray-5" aria-hidden="true" />
          <PersonTip :user-id="parties.receiver.userId" :name="parties.receiver.label"><Avatar :label="parties.receiver.label" size="sm" /></PersonTip><span class="ml-1 leading-tight">{{ parties.receiver.label }}<span v-if="empSub(parties.receiver)" class="block text-xs tabular text-ink-gray-5">{{ empSub(parties.receiver) }}</span></span>
        </div></div>

      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-users size-4" /></div>
        <div class="flex min-h-7 items-center gap-2">{{ l.stageAtCall }}
          <span class="lucide-arrow-up-right size-4 shrink-0 cursor-pointer text-ink-gray-5 hover:text-ink-gray-8" title="Open record" @click="goToRecord" /></div></div>

      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-calendar size-4" /></div>
        <div class="flex min-h-7 items-center"><Tooltip :text="fmtDateTime(l.at)">{{ callWhen(l.at) }}</Tooltip></div></div>

      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-timer size-4" /></div>
        <div class="flex min-h-7 items-center">{{ callDuration(l.duration) }}</div></div>

      <div class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-circle-check size-4" /></div>
        <div class="flex min-h-7 items-center" :class="callStatusClass(l)">{{ l.subStatus }}<span v-if="l.status !== 'Connected'" class="ml-1.5 text-ink-gray-5">· Not Connected</span></div></div>

      <div v-if="l.recording" class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-circle-play size-4" /></div>
        <div class="flex min-h-7 w-full items-center">
          <audio v-if="canPlay && src && !recordingError" class="dms-audio w-full" controls :src="src" @error="recordingError = true" />
          <div v-else-if="!canPlay" class="flex h-9 items-center gap-1.5 text-ink-gray-5"><span class="lucide-lock size-3.5" />You do not have the "Play Call Recordings" permission.</div>
          <div v-else class="flex h-9 items-center text-ink-gray-5">Recording not available</div>
        </div></div>

      <div v-if="l.comment" class="flex gap-2"><div class="grid size-7 shrink-0 place-content-center"><span class="lucide-notebook-pen size-4" /></div>
        <div class="w-full rounded-4 border px-2 py-1.5 text-ink-gray-7"><div class="max-h-24 min-h-12 overflow-y-auto whitespace-pre-line">{{ l.comment }}</div></div></div>
    </div>
  </Dialog>
  <NoteModal v-if="l" v-model:open="noteOpen" :client-id="l.clientId" />
  <TaskModal v-model:open="taskOpen" />
</template>
<style scoped>
.dms-audio { height: 36px; border-radius: 10px; outline: none; }
.dms-audio::-webkit-media-controls-panel { background-color: rgb(237, 237, 237); }
</style>
