<script setup>
// Calls tab (D03 §6; D04 §2, §6; CALL-001..008; Fig 9830) - Frappe CRM CallArea timeline: direction icon on
// the line, "<caller> has made a call / has reached out", a card with Inbound/Outbound Call, caller + receiver
// avatars and badges (date, duration, Listen, outcome); the comment sits under the card.
// Clicking a card opens Call Details (same pop-up as the Call Logs page). "Listen" plays inline.
// Calls are placed from the phone button in the record side panel. "Log a Call" records a call manually
// (product owner, 06 Nov 2026 - relaxes CALL-001 "system-created only").
import { ref, reactive, computed } from 'vue'
import { Button, Badge, Avatar, Tooltip } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { hasSwitch } from '@/services/access'
import { callParties, callTitle, callVerb, callIcon, callDay, callDuration, callTheme, recordingUrl } from '@/services/callView'
import { timeAgo, fmtDateTime } from '@/utils/format'
import LogCallModal from '@/components/modals/LogCallModal.vue'
import AudioPlayer from '@/components/calls/AudioPlayer.vue'
import CallDetailsModal from '@/components/calls/CallDetailsModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const list = computed(() => db.calls.filter((c) => c.clientId === props.client.id && c.at >= (props.since || 0)).sort((a, b) => b.at - a.at)
  .map((c) => ({ c, ...callParties(c) })))
const canCall = computed(() => !props.readonly && !['Junk', 'Unassigned Family'].includes(props.client.stage))
const canListen = computed(() => hasSwitch('play_recordings'))
const logOpen = ref(false)
const showRec = reactive({})
const details = ref({ open: false, call: null })
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Calls</h3>
      <Button v-if="canCall" variant="solid" label="Log a Call" icon-left="lucide-plus" @click="logOpen = true" />
    </div>
    <LogCallModal v-if="canCall" v-model:open="logOpen" :client="client" />

    <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-phone size-6" /></div>
      <p class="text-base text-ink-gray-7">No calls yet</p>
      <p v-if="canCall" class="text-sm text-ink-gray-5">Place a call from the phone button at the top of the record, or use “Log a Call”.</p>
    </div>

    <div v-else>
      <div v-for="({ c, caller, receiver }, i) in list" :key="c.id" class="grid grid-cols-[30px_minmax(auto,_1fr)] gap-2 sm:gap-4">
        <!-- timeline: direction icon on the line -->
        <div class="relative flex justify-center after:absolute after:left-[50%] after:top-0 after:border-l after:border-outline-gray-2"
          :class="i !== list.length - 1 ? 'after:h-full' : 'after:h-4'">
          <div class="z-10 mt-2.5 flex size-8 items-center justify-center rounded-6 border border-outline-gray-2 bg-surface-base text-ink-gray-7">
            <span :class="callIcon(c)" class="size-4" />
          </div>
        </div>
        <div class="mb-4 min-w-0">
          <div class="mb-1 flex items-center gap-2 py-1 text-base">
            <div class="inline-flex flex-wrap items-center gap-1 text-ink-gray-5">
              <PersonTip :user-id="caller.userId" :name="caller.label"><Avatar :label="caller.label" size="md" /></PersonTip>
              <span class="ml-1 font-medium text-ink-gray-8">{{ caller.label.split(' ')[0] }}</span>
              <span>{{ callVerb(c) }}</span>
            </div>
            <Tooltip :text="fmtDateTime(c.at)"><span class="ml-auto whitespace-nowrap text-sm text-ink-gray-5">{{ timeAgo(c.at) }}</span></Tooltip>
          </div>

          <div class="flex cursor-pointer flex-col gap-2 rounded-7 border border-outline-gray-2 bg-surface-base px-3 py-2.5 text-ink-gray-9 shadow-sm hover:border-outline-gray-3"
            @click="details = { open: true, call: c }">
            <div class="flex items-center justify-between">
              <div class="text-base font-medium">{{ callTitle(c) }}</div>
              <div class="flex -space-x-1.5" @click.stop>
                <PersonTip :user-id="caller.userId" :name="caller.label"><Avatar :label="caller.label" size="sm" class="ring-2 ring-surface-base" /></PersonTip>
                <PersonTip :user-id="receiver.userId" :name="receiver.label"><Avatar :label="receiver.label" size="sm" class="ring-2 ring-surface-base" /></PersonTip>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Badge :label="callDay(c.at)"><template #prefix><span class="lucide-calendar size-3" /></template></Badge>
              <Badge v-if="c.status === 'Connected'" :label="callDuration(c.duration)"><template #prefix><span class="lucide-timer size-3" /></template></Badge>
              <Badge v-if="c.recording && canListen" class="cursor-pointer" :label="showRec[c.id] ? 'Hide Recording' : 'Listen'" @click.stop="showRec[c.id] = !showRec[c.id]">
                <template #prefix><span class="lucide-play size-3" /></template>
              </Badge>
              <Badge :label="c.subStatus" :theme="callTheme(c)" />
            </div>
            <AudioPlayer v-if="showRec[c.id] && c.recording && canListen" :src="recordingUrl(c)" :name="`call-${c.id}`" />
          </div>

          <div v-if="c.comment" class="mt-2 flex gap-2 border-l-2 border-outline-gray-3 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-7">
            <span class="lucide-notebook-pen mt-0.5 size-4 shrink-0 text-ink-gray-5" /><span class="whitespace-pre-line">{{ c.comment }}</span>
          </div>
        </div>
      </div>
    </div>
    <CallDetailsModal v-model:open="details.open" :call="details.call" />
  </div>
</template>
