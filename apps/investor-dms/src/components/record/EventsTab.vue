<script setup>
// Events tab (D03 §5; EVT-001..005; Fig 11025). Cards newest first by event date; no deletion.
// Editing: creator and the owner's seniors (D05 §4.6). Creating on a Pool record converts it to Prospect (POOL-012).
import { ref, computed } from 'vue'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { EVENT_COLOR } from '@/data/masters'
import { visibleUserIds, isAdmin } from '@/services/access'
import { timeAgo, fmtDayDate, fmtTimeShort, initials } from '@/utils/format'
import EventModal from '@/components/modals/EventModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const list = computed(() => db.events.filter((e) => e.clientId === props.client.id && e.createdAt >= (props.since || 0)).sort((a, b) => {
  // DMS rule: nearest upcoming at the top, then later ones; past events below, most recent first
  const now = Date.now(), fa = a.start >= now, fb = b.start >= now
  return fa !== fb ? (fa ? -1 : 1) : fa ? a.start - b.start : b.start - a.start
}))
const createOpen = ref(false)
const editEvent = ref(null); const editOpen = ref(false)
const canEdit = (e) => !props.readonly && (e.createdBy === db.sessionUserId || isAdmin() || (visibleUserIds().includes(props.client.assignedTo) && db.sessionUserId !== props.client.assignedTo))
function open(e) { if (!canEdit(e)) return; editEvent.value = e; editOpen.value = true }
const border = { blue: 'border-l-[#3b82f6]', violet: 'border-l-[#8b5cf6]', green: 'border-l-[#22c55e]', orange: 'border-l-[#f97316]', gray: 'border-l-[#9ca3af]' }
const dot = { blue: 'bg-surface-blue-7', violet: 'bg-surface-violet-7', green: 'bg-surface-green-7', orange: 'bg-surface-orange-7', gray: 'bg-surface-gray-7' }
const uname = (id) => db.userById(id)?.name || ''
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Events</h3>
      <Button v-if="!readonly && !['Junk', 'Unassigned'].includes(client.stage)" variant="solid" icon-left="lucide-plus" label="Schedule an Event" @click="createOpen = true" />
    </div>
    <p v-if="client.stage === 'Pool' && !readonly" class="mb-4 rounded-4 bg-surface-blue-1 px-3 py-2 text-sm text-ink-blue-7">Creating an event on a Pool record converts it to your Prospect (POOL-012).</p>
    <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-calendar size-6" /></div>
      <p class="text-base text-ink-gray-7">No events scheduled</p>
    </div>
    <ol v-else class="relative space-y-5 before:absolute before:bottom-0 before:left-[15px] before:top-2 before:border-l before:border-outline-gray-2">
      <li v-for="e in list" :key="e.id" class="relative flex gap-3">
        <span class="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface-base"><span class="lucide-calendar size-3.5 text-ink-gray-6" /></span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between pt-1.5 text-base">
            <p class="text-ink-gray-6"><span class="font-medium text-ink-gray-8">{{ uname(e.createdBy).split(' ')[0] }}</span> has created an event</p>
            <span class="text-sm text-ink-gray-5">{{ timeAgo(e.createdAt) }}</span>
          </div>
          <button class="mt-2 w-full rounded-6 border border-l-4 p-3 text-left" :class="[border[EVENT_COLOR[e.type]], canEdit(e) ? 'hover:bg-surface-gray-1' : 'cursor-default']" @click="open(e)">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-1.5 text-sm text-ink-gray-6"><span class="size-2 rounded-full" :class="dot[EVENT_COLOR[e.type]]" />{{ e.type }}</div>
                <div class="mt-1 text-base font-medium text-ink-gray-9">{{ e.title }}</div>
                <div class="mt-0.5 text-sm text-ink-gray-6">{{ e.allDay ? 'All Day' : `${fmtTimeShort(e.start)} – ${fmtTimeShort(e.end)}` }} · {{ fmtDayDate(e.start) }}</div>
                <div v-if="e.clientNames?.length" class="mt-2 flex items-center gap-1 text-xs text-ink-gray-5">Client
                  <PersonTip v-for="n in e.clientNames" :key="n" :name="n"><span class="flex size-6 items-center justify-center rounded-full bg-surface-gray-3 text-2xs text-ink-gray-7">{{ initials(n) }}</span></PersonTip>
                </div>
              </div>
              <div class="flex -space-x-1.5">
                <PersonTip v-for="a in e.attendees" :key="a" :user-id="a"><span class="flex size-6 items-center justify-center rounded-full border border-white text-2xs" :class="a === e.createdBy ? 'bg-surface-gray-8 text-white' : 'bg-surface-gray-3 text-ink-gray-7'">{{ initials(uname(a)) }}</span></PersonTip>
              </div>
            </div>
          </button>
        </div>
      </li>
    </ol>
    <EventModal v-model:open="createOpen" :client-id="client.id" />
    <EventModal v-model:open="editOpen" :client-id="client.id" :event="editEvent" title="Update Event" submit-label="Update" />
  </div>
</template>
