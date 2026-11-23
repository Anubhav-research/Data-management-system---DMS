<script setup>
// "Create an Event" (Fig 7978/25046; D05 §4.4; EVT-001/002). Used from: record Events tab, after a Followup /
// Interested call (Internal Meeting not offered), and Calendar "Create" (Linked With picker, Fig 21784).
import EventNotifications from '@/components/EventNotifications.vue'
import AttendeePicker from '@/components/AttendeePicker.vue'
import { timeOptions, TIME_FORMAT, todayIso, nextMinute, pastReason } from '@/utils/timeOptions'
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, Switch, MultiSelect, Combobox, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { EVENT_TYPES } from '@/data/masters'
import { createEvent, updateEvent } from '@/services/work'
import { loadOtherBusy, overlapsBusy, publishBusy, OVERLAP_WARNING } from '@/services/busy'
import { clientName, fullName } from '@/services/lifecycle'
import { visibleUserIds } from '@/services/access'
import { toInputDate, toInputTime, combineDateTime } from '@/utils/format'

const props = defineProps({
  clientId: String, // fixed client (record tab / after call)
  afterCall: Boolean, // opened by call log -> no Internal Meeting, type preset Call Follow-up
  event: Object, // edit mode
  title: { type: String, default: 'Create an Event' },
  submitLabel: { type: String, default: 'Create' },
  dismissible: { type: Boolean, default: true },
})
const open = defineModel('open', { default: false })
const emit = defineEmits(['created', 'cancel'])
const db = useDb()

// Notifications (Frappe CRM rows: type · before · interval). Old events kept minutes in "reminders".
const MIN = { minutes: 1, hours: 60, days: 1440, weeks: 10080 }
const toMinutes = (n) => (Number(n.before) || 0) * (MIN[n.interval] || 1)
const fromMinutes = (m) => (m % 10080 === 0 ? { type: 'Notification', before: m / 10080, interval: 'weeks' } : m % 1440 === 0 ? { type: 'Notification', before: m / 1440, interval: 'days' } : m % 60 === 0 && m >= 60 ? { type: 'Notification', before: m / 60, interval: 'hours' } : { type: 'Notification', before: m, interval: 'minutes' })
const defaultNotifications = () => (db.settings?.eventReminders?.length ? db.settings.eventReminders : [10]).map(fromMinutes)
const notificationsOf = (e) => (e.notifications?.length ? e.notifications.map((n) => ({ ...n })) : (e.reminders || []).map(fromMinutes))
const blank = () => {
  const s = nextMinute() // never in the past
  const e = new Date(s.getTime() + 2 * 60000) // default length 2 minutes (product owner, 13 Nov 2026)
  return { type: 'Call Follow-up', title: '', allDay: false, date: toInputDate(s), startT: toInputTime(s), endT: toInputTime(e), clientId: props.clientId || '', clientNames: [], attendees: [db.sessionUserId], description: '', notifications: defaultNotifications() }
}
const f = ref(blank())
const busyClash = computed(() => {
  const st = combineDateTime(f.value.date, f.value.allDay ? '00:00' : f.value.startT); const en = combineDateTime(f.value.date, f.value.allDay ? '23:59' : f.value.endT)
  return !!(st && en && overlapsBusy(st, en))
})
const error = ref('')
watch(open, (v) => {
  if (!v) return
  error.value = ''
  loadOtherBusy(db.sessionUserId) // F4: the other website's busy times of the signed-in user
  if (props.event) {
    const e = props.event
    f.value = { type: e.type, title: e.title, allDay: e.allDay, date: toInputDate(e.start), startT: toInputTime(e.start), endT: toInputTime(e.end), clientId: e.clientId || '', clientNames: [...(e.clientNames || [])], attendees: [...e.attendees], description: e.description || '', notifications: notificationsOf(e) }
  } else f.value = blank()
})
const typeOptions = computed(() => EVENT_TYPES.filter((t) => !(props.afterCall && t.value === 'Internal Meeting')).map((t) => ({ label: t.value, value: t.value })))
const client = computed(() => db.clientById(f.value.clientId))
const groupPeople = computed(() => (client.value ? client.value.members.filter((m) => !m.investor).map((m) => fullName(m)) : [])) // investors are not in event Client Name
watch(client, (c) => { if (c && !f.value.clientNames.length) f.value.clientNames = [clientName(c)] }, { immediate: true })
const linkable = computed(() => {
  const ids = visibleUserIds()
  return db.clients.filter((c) => ['Prospect', 'Lead', 'Investor Family'].includes(c.stage) && c.members.some((m) => !m.investor) && (db.me.role === 'Admin' || ids.includes(c.assignedTo))).map((c) => ({ label: `${clientName(c)} · ${c.stage}`, value: c.id }))
})
// Attendees: creator + direct senior + own team (D03 §5). Colleagues under the same senior count as "team" only for an
// Investment Specialist (same TL). Team Leaders (and VPs) are independent of each other: another TL under the same VP,
// and that TL's team, are not offered (product owner, 13 Nov 2026).
const attendeeOptions = computed(() => {
  const me = db.me
  return db.users.filter((u) => u.active && (u.id === me.id || u.id === me.reportsTo || u.reportsTo === me.id || (me.role === 'IS' && me.reportsTo && u.reportsTo === me.reportsTo))).map((u) => ({ label: `${u.name} (${u.role})`, name: u.name, sub: `${u.mhf_id} · ${u.role}`, value: u.id }))
})
// End time: picking a start always sets the end to start + 2 minutes (the default length); the end can then be
// changed, its list offering only times after the start (product owner, 13 Nov 2026).
const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0) }
const toHHMM = (n) => { n = Math.max(0, Math.min(23 * 60 + 59, n)); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` }
watch(() => [f.value, f.value.startT], ([form, now], [formBefore]) => {
  if (form !== formBefore || !now) return // a new or opened event fills the whole form: keep its own end time
  form.endT = toHHMM(toMin(now) + 2)
})
const dot = { blue: 'bg-surface-blue-7', violet: 'bg-surface-violet-7', green: 'bg-surface-green-7', orange: 'bg-surface-orange-7', gray: 'bg-surface-gray-7' }

function submit() {
  error.value = ''
  try {
    const start = combineDateTime(f.value.date, f.value.allDay ? '00:00' : f.value.startT)
    const end = combineDateTime(f.value.date, f.value.allDay ? '23:59' : f.value.endT)
    // nothing in the past: a new event, or an opened one whose date or time was changed
    if (!props.event || start !== props.event.start) { const why = f.value.allDay ? (f.value.date < todayIso() ? 'Date must be today or later.' : '') : pastReason(start); if (why) { error.value = why; return } }
    const payload = { type: f.value.type, title: f.value.title, allDay: f.value.allDay, start, end, clientId: f.value.clientId || null, clientNames: f.value.clientNames, attendees: f.value.attendees.length ? f.value.attendees : [db.sessionUserId], description: f.value.description, notifications: f.value.notifications.map((n) => ({ ...n })), reminders: f.value.notifications.filter((n) => n.type === 'Notification').map(toMinutes) }
    if (props.event) { updateEvent(props.event, payload); publishBusy(); toast.success('Event updated'); open.value = false; return }
    const wasPool = client.value?.stage === 'Pool'
    const e = createEvent(payload)
    publishBusy()
    if (wasPool) toast.success('Event created. The record is now your Prospect.')
    else toast.success('Event created')
    open.value = false
    emit('created', e)
  } catch (e) { error.value = e.message }
}
function cancel() { open.value = false; emit('cancel') }
</script>
<template>
  <Dialog v-model:open="open" :title="title" size="xl" :dismissible="dismissible">
    <div class="space-y-4">
      <div class="grid grid-cols-[110px_1fr] items-center gap-x-4 gap-y-4 text-base">
        <label class="text-ink-gray-6">Title <span class="text-ink-red-5">*</span></label>
        <div class="flex gap-2">
          <div class="w-48 shrink-0">
            <FormControl v-model="f.type" type="select" :options="typeOptions" />
          </div>
          <FormControl v-model="f.title" class="flex-1" placeholder="e.g. Portfolio review call" />
        </div>
        <label class="text-ink-gray-6">All Day</label>
        <Switch v-model="f.allDay" />
        <label class="text-ink-gray-6">Date &amp; Time <span class="text-ink-red-5">*</span></label>
        <!-- date keeps its width next to the two times (it used to shrink to nothing); end time offers only times after the start (as Frappe CRM) -->
        <div class="grid gap-2" :class="f.allDay ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]'">
          <FormControl v-model="f.date" type="date" format="MMM D, YYYY" :min="todayIso()" class="min-w-0 [&_input]:w-full" data-testid="event-date" />
          <template v-if="!f.allDay">
            <FormControl v-model="f.startT" type="time" :format="TIME_FORMAT" :options="timeOptions({ date: f.date, keep: f.startT })" class="min-w-0 [&_input]:w-full" data-testid="event-start" />
            <FormControl v-model="f.endT" type="time" :format="TIME_FORMAT" :options="timeOptions({ after: f.startT, keep: f.endT })" class="min-w-0 [&_input]:w-full" data-testid="event-end" />
          </template>
        </div>
        <template v-if="!clientId && f.type !== 'Internal Meeting'">
          <label class="text-ink-gray-6">Linked With <span class="text-ink-red-5">*</span></label>
          <Combobox v-model="f.clientId" :options="linkable" placeholder="Add Prospect/Lead or Investor" />
        </template>
        <template v-if="groupPeople.length > 1">
          <label class="text-ink-gray-6">Client Name</label>
          <MultiSelect v-model="f.clientNames" :options="groupPeople.map((p) => ({ label: p, value: p }))" placeholder="Select Client" />
        </template>
        <label class="text-ink-gray-6">Attendees</label>
        <AttendeePicker v-model="f.attendees" :options="attendeeOptions" />
        <template v-if="!afterCall">
          <label class="self-start pt-1.5 text-ink-gray-6">Notifications</label>
          <EventNotifications v-model="f.notifications" />
        </template>
        <label class="self-start pt-1.5 text-ink-gray-6">Description</label>
        <FormControl v-model="f.description" type="textarea" placeholder="Add Description." :rows="3" />
      </div>
      <div class="flex items-center gap-2 text-sm text-ink-gray-5">
        <span class="size-2 rounded-full" :class="dot[EVENT_TYPES.find((t) => t.value === f.type)?.color]" />
        {{ f.type }}<span v-if="client"> · linked to {{ clientName(client) }} ({{ client.stage }})</span>
      </div>
      <p v-if="busyClash" class="flex items-center gap-1.5 rounded-4 bg-surface-amber-2 px-3 py-1.5 text-sm text-ink-amber-8" data-testid="busy-warning"><span class="lucide-triangle-alert size-4" />{{ OVERLAP_WARNING }}</p>
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" @click="cancel" />
        <Button variant="solid" :label="submitLabel" @click="submit" />
      </div>
    </template>
  </Dialog>
</template>
