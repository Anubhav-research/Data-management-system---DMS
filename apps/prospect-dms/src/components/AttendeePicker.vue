<script setup>
// Attendees, as Frappe CRM: an "Add Attendee" search box whose list shows each person with an avatar, the name and a
// second line (Frappe shows the email; DMS users have none, so the Money Honey ID and role). Chosen people show as
// chips with ×. Only the people in `options` can be chosen (rule in the event form).
import { ref, computed, nextTick } from 'vue'
import { Popover } from 'frappe-ui'
import { initials } from '@/utils/format'

const props = defineProps({ options: { type: Array, default: () => [] } }) // [{ value, name, sub }]
const model = defineModel({ type: Array, default: () => [] })
const open = ref(false); const q = ref(''); const box = ref(null)
const byId = computed(() => Object.fromEntries(props.options.map((o) => [o.value, o])))
const chosen = computed(() => model.value.map((id) => byId.value[id]).filter(Boolean))
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return props.options.filter((o) => !model.value.includes(o.value) && (!s || `${o.name} ${o.sub}`.toLowerCase().includes(s)))
})
function add(o) { model.value = [...model.value, o.value]; q.value = ''; nextTick(() => box.value?.focus()) }
function remove(id) { model.value = model.value.filter((x) => x !== id) }
function onOpen(o) { open.value = o; if (o) { q.value = ''; nextTick(() => box.value?.focus()) } }
</script>
<template>
  <div class="flex flex-col gap-1.5" data-testid="attendee-picker">
    <Popover :open="open" placement="bottom-start" @update:open="onOpen">
      <template #trigger>
        <button type="button" class="flex h-7 w-full items-center justify-between rounded bg-surface-gray-2 px-2 text-left text-base text-ink-gray-4 hover:bg-surface-gray-3">
          Add Attendee<span class="lucide-chevron-down size-4 text-ink-gray-5" />
        </button>
      </template>
      <template #default>
        <div class="w-72 p-1">
          <input ref="box" v-model="q" placeholder="Add Attendee" class="mb-1 h-7 w-full rounded border-0 bg-surface-gray-2 px-2 text-base placeholder:text-ink-gray-4 focus:ring-0" @keydown="(e) => e.key !== 'Escape' && e.stopPropagation()" @keydown.enter.prevent="shown[0] && add(shown[0])" />
          <div class="dms-scroll max-h-60 overflow-y-auto">
            <button v-for="o in shown" :key="o.value" type="button" class="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left hover:bg-surface-gray-2" @click="add(o)">
              <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-xs font-medium text-ink-gray-7">{{ initials(o.name) }}</span>
              <span class="min-w-0">
                <span class="block truncate text-base text-ink-gray-8">{{ o.name }}</span>
                <span class="block truncate text-sm text-ink-gray-5">{{ o.sub }}</span>
              </span>
            </button>
            <div v-if="!shown.length" class="px-2 py-3 text-center text-sm text-ink-gray-5">{{ q ? 'No match' : 'Everyone is added' }}</div>
          </div>
        </div>
      </template>
    </Popover>
    <div v-if="chosen.length" class="flex flex-wrap gap-1.5">
      <span v-for="o in chosen" :key="o.value" class="flex items-center gap-1.5 rounded-full border bg-surface-base py-0.5 pl-0.5 pr-1.5 text-sm text-ink-gray-8" :title="o.sub">
        <span class="flex size-5 items-center justify-center rounded-full bg-surface-gray-3 text-2xs font-medium text-ink-gray-7">{{ initials(o.name) }}</span>
        {{ o.name }}
        <button type="button" class="lucide-x size-3.5 text-ink-gray-5 hover:text-ink-gray-8" :aria-label="`Remove ${o.name}`" @click="remove(o.value)" />
      </span>
    </div>
  </div>
</template>
