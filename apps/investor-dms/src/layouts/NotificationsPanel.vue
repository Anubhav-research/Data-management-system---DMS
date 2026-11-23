<script setup>
// Notifications panel (GEN-011; Fig 13453): tabs All / Events, empty state. Clicking applies the
// notification's silent filter to its target list (X07 NOTIFICATION_BEHAVIOUR).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button, TabButtons } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { myNotifications } from '@/services/notify'
import { timeAgo } from '@/utils/format'

const emit = defineEmits(['close'])
const db = useDb(); const router = useRouter()
const tab = ref('All')
const list = computed(() => myNotifications().filter((n) => tab.value === 'All' || n.tab === 'Events' || n.code === 'N-04'))
function open(n) {
  n.read = true
  if (n.link) {
    const query = { ...(n.link.query || {}) }
    if (n.filterIds?.length) query.ids = n.filterIds.join(',')
    router.push({ path: n.link.path, query })
  }
  emit('close')
}
function markAll() { myNotifications().forEach((n) => (n.read = true)) }
</script>
<template>
  <div class="absolute left-full top-0 z-50 flex h-screen w-[400px] flex-col border-r bg-surface-base shadow-[8px_0_8px_rgba(0,0,0,0.08)]">
    <div class="flex items-center justify-between border-b px-4 py-3">
      <div>
        <div class="text-lg font-semibold text-ink-gray-9">Notifications</div>
        <div class="text-sm text-ink-gray-5">Recent Events</div>
      </div>
      <div class="flex gap-1">
        <Button variant="ghost" icon="lucide-check-check" tooltip="Mark all as read" @click="markAll" />
        <Button variant="ghost" icon="lucide-x" @click="emit('close')" />
      </div>
    </div>
    <div class="px-4 pt-3"><TabButtons v-model="tab" :options="[{ label: 'All', value: 'All' }, { label: 'Events', value: 'Events' }]" /></div>
    <div class="dms-scroll flex-1 overflow-y-auto py-2">
      <button v-for="n in list" :key="n.id" class="flex w-full gap-2.5 px-4 py-2.5 text-left hover:bg-surface-gray-2" @click="open(n)">
        <span class="mt-2 size-[6px] shrink-0 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-surface-gray-10'" />
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-gray-3"><span class="lucide-bell size-3.5 text-ink-gray-6" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-p-sm text-ink-gray-8" :class="!n.read && 'font-medium'">{{ n.text }}</span>
          <span class="mt-1 block text-xs text-ink-gray-5">{{ timeAgo(n.at) }}</span>
        </span>
      </button>
      <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
        <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-bell-off size-6" /></div>
        <p class="text-base text-ink-gray-7">No New Notifications</p>
        <p class="text-sm text-ink-gray-5">You have no new notifications</p>
      </div>
    </div>
  </div>
</template>
