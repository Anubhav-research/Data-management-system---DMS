<script setup>
// Event notifications, as Frappe CRM (Event Notifications rows: type · before · interval). A summary line on top
// ("15 minutes before, 10 minutes before"), then one block per notification: [Notification ▾] [×] and
// [number] [minutes before ▾]; "Add Notification" adds 10 minutes before. Default for a new event: 10 minutes before.
import { computed } from 'vue'
import { Button, FormControl } from 'frappe-ui'

const rows = defineModel({ type: Array, default: () => [] }) // [{ type: 'Notification' | 'Email', before: number, interval: 'minutes' | 'hours' | 'days' | 'weeks' }]
const TYPES = ['Notification', 'Email']
const UNITS = [
  { label: 'minutes before', value: 'minutes' },
  { label: 'hours before', value: 'hours' },
  { label: 'days before', value: 'days' },
  { label: 'weeks before', value: 'weeks' },
]
const one = { minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week' }
const text = (r) => `${r.before} ${Number(r.before) === 1 ? one[r.interval] : r.interval} before`
const summary = computed(() => rows.value.map(text).join(', '))
function add() { rows.value = [...rows.value, { type: 'Notification', before: 10, interval: 'minutes' }] }
function remove(i) { rows.value = rows.value.filter((_, k) => k !== i) }
function setBefore(r, v) { const n = Math.max(1, Math.floor(Number(v) || 1)); r.before = n }
</script>
<template>
  <div class="flex flex-col gap-2" data-testid="event-notifications">
    <div class="flex h-7 items-center truncate rounded border border-outline-gray-2 px-2 text-base" :class="summary ? 'text-ink-gray-8' : 'text-ink-gray-4'">{{ summary || 'No notifications' }}</div>
    <template v-for="(r, i) in rows" :key="i">
      <div v-if="i" class="my-1 h-px bg-outline-gray-1" />
      <div class="flex items-center gap-2">
        <FormControl v-model="r.type" type="select" :options="TYPES" class="flex-1" />
        <Button variant="ghost" icon="lucide-x" :aria-label="`Remove notification ${i + 1}`" @click="remove(i)" />
      </div>
      <div class="flex items-center gap-2 pr-9">
        <FormControl :model-value="r.before" type="number" :min="1" class="w-28" @update:model-value="(v) => setBefore(r, v)" />
        <FormControl v-model="r.interval" type="select" :options="UNITS" class="flex-1" />
      </div>
    </template>
    <Button class="w-full" icon-left="lucide-bell" label="Add Notification" @click="add" />
  </div>
</template>
