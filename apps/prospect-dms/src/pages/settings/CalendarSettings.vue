<script setup>
// Settings → Calendar (Frappe CRM Calendar Settings layout). Admin sets the calendar's opening view and the
// default event reminders. D05: a reminder is 10 minutes before by default, more than one can be added (Events).
import { ref, computed } from 'vue'
import { Button, Dropdown, Switch, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import SettingsShell from '@/components/settings/SettingsShell.vue'

const db = useDb()
const draft = ref(JSON.parse(JSON.stringify(db.settings)))
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(db.settings))
const VIEWS = ['Day', 'Week', 'Month']
const REMINDERS = [5, 10, 15, 30, 60, 120, 1440]
const label = (m) => (m >= 1440 ? `${m / 1440} day before` : m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''} before` : `${m} minutes before`)
const addOptions = computed(() => REMINDERS.filter((m) => !draft.value.eventReminders.includes(m)).map((m) => ({ label: label(m), onClick: () => draft.value.eventReminders = [...draft.value.eventReminders, m].sort((a, b) => a - b) })))
function save() { db.settings = JSON.parse(JSON.stringify(draft.value)); toast.success('Calendar settings saved') }
</script>
<template>
  <SettingsShell title="Calendar Settings" description="Configure the calendar's default view and event notifications." :not-saved="dirty">
    <template #actions><Button v-if="dirty" variant="solid" label="Save" @click="save" /></template>
    <div class="flex items-center justify-between gap-4 py-3">
      <div class="flex flex-col">
        <div class="text-p-base font-medium text-ink-gray-7">Default View</div>
        <div class="text-p-sm text-ink-gray-5">The view the Calendar opens with.</div>
      </div>
      <Dropdown :options="VIEWS.map((v) => ({ label: v === 'Week' ? 'Weekly' : v === 'Day' ? 'Daily' : 'Monthly', onClick: () => (draft.calendarView = v) }))" align="end">
        <Button :label="draft.calendarView === 'Week' ? 'Weekly' : draft.calendarView === 'Day' ? 'Daily' : 'Monthly'" icon-right="lucide-chevron-down" />
      </Dropdown>
    </div>
    <div class="mx-0 h-px border-t border-outline-gray-1" />
    <div class="py-3">
      <div class="text-p-base font-medium text-ink-gray-7">Event Notifications</div>
      <div class="text-p-sm text-ink-gray-5">Reminders are sent <b>before the event starts</b>. New events start with these; the specialist can change them on the event.</div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span v-for="m in draft.eventReminders" :key="m" class="flex items-center gap-1.5 rounded-4 bg-surface-gray-2 px-2 py-1 text-sm text-ink-gray-8">
          <span class="lucide-bell size-3.5 text-ink-gray-5" />{{ label(m) }}
          <button v-if="draft.eventReminders.length > 1" class="lucide-x size-3.5 text-ink-gray-5 hover:text-ink-gray-8" :aria-label="`Remove ${label(m)}`" @click="draft.eventReminders = draft.eventReminders.filter((x) => x !== m)" />
        </span>
        <Dropdown v-if="addOptions.length" :options="addOptions"><Button icon-left="lucide-plus" label="Add Notification" /></Dropdown>
      </div>
    </div>
    <div class="flex items-center justify-between gap-4 border-t py-3">
      <div class="flex flex-col">
        <div class="text-p-base font-medium text-ink-gray-7">Show busy blocks to supervisors</div>
        <div class="text-p-sm text-ink-gray-5">A supervisor looking at a junior's calendar also sees the junior's Busy blocks from the other DMS (no details). Default off.</div>
      </div>
      <Switch v-model="draft.showBusyToSupervisors" />
    </div>
  </SettingsShell>
</template>
