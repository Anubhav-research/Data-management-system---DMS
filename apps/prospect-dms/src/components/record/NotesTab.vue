<script setup>
// Notes tab (D03 §7; NOTE-001..009; Fig 10242). Client Notes, 2 per row, pin limit 3 per client tab (NOTE-007/008).
// Only the creator edits; seniors read (NOTE-003). Fresh view after Pool return (POOL-016).
import { ref, computed } from 'vue'
import { Button, Dropdown, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { togglePin, isPinned } from '@/services/work'
import { timeAgo, initials } from '@/utils/format'
import NoteModal from '@/components/modals/NoteModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const list = computed(() => db.notes.filter((n) => n.clientId === props.client.id && n.createdAt >= (props.since || 0))
  .sort((a, b) => (isPinned(b, 'client') ? 1 : 0) - (isPinned(a, 'client') ? 1 : 0) || b.updatedAt - a.updatedAt))
const open = ref(false); const current = ref(null)
function create() { current.value = null; open.value = true }
function view(n) { current.value = n; open.value = true }
function pin(n) { try { toast.success(togglePin(n, 'client') ? 'Pinned' : 'Unpinned') } catch (e) { toast.error(e.message) } }
const uname = (id) => db.userById(id)?.name || ''
const plain = (h) => String(h || '').replace(/<[^>]+>/g, ' ')
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Notes</h3>
      <Button v-if="!readonly && !['Junk', 'Unassigned Family'].includes(client.stage)" variant="solid" icon-left="lucide-plus" label="New Note" @click="create" />
    </div>
    <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-file-text size-6" /></div>
      <p class="text-base text-ink-gray-7">No notes yet</p>
    </div>
    <div v-else class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div v-for="n in list" :key="n.id" class="flex cursor-pointer flex-col rounded-6 border p-3 hover:bg-surface-gray-1" @click="view(n)">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-1.5 text-base font-semibold text-ink-gray-9"><span v-if="isPinned(n, 'client')" class="lucide-pin size-3.5 text-ink-amber-6" />{{ n.title }}</div>
          <div @click.stop>
            <Dropdown :options="[{ label: isPinned(n, 'client') ? 'Unpin' : 'Pin', icon: isPinned(n, 'client') ? 'lucide-pin-off' : 'lucide-pin', onClick: () => pin(n) }]" align="end">
              <Button variant="ghost" size="sm" icon="lucide-ellipsis" />
            </Dropdown>
          </div>
        </div>
        <p class="mt-1 line-clamp-3 flex-1 text-sm text-ink-gray-6">{{ plain(n.content) }}</p>
        <div class="mt-3 flex items-center gap-2 text-sm text-ink-gray-5">
          <PersonTip :user-id="n.createdBy"><span class="flex size-5 items-center justify-center rounded-full bg-surface-gray-3 text-2xs text-ink-gray-7">{{ initials(uname(n.createdBy)) }}</span></PersonTip>
          {{ uname(n.createdBy).split(' ')[0] }} · {{ timeAgo(n.updatedAt) }}
        </div>
      </div>
    </div>
    <NoteModal v-model:open="open" :note="current" :client-id="client.id" />
  </div>
</template>
