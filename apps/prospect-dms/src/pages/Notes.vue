<script setup>
// Notes home (Fig 18514; D05 §2.3-2.8; NOTE-001..009). Visibility: creator + seniors in creator's chain
// (read-only for seniors, NOTE-003). Sort default: pinned first, then last updated desc (X03).
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dropdown, TextInput, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { visibleUserIds, isAdmin, isSupervisor } from '@/services/access'
import { togglePin, isPinned } from '@/services/work'
import { clientName } from '@/services/lifecycle'
import { timeAgo } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import UserChip from '@/components/UserChip.vue'
import NoteModal from '@/components/modals/NoteModal.vue'

const db = useDb(); const router = useRouter()
const titleQ = ref(''); const contentQ = ref('')
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const source = () => {
  const ids = visibleUserIds()
  return db.notes
    .filter((n) => isAdmin() || ids.includes(n.createdBy))
    .filter((n) => !titleQ.value || n.title.toLowerCase().includes(titleQ.value.toLowerCase()))
    .filter((n) => !contentQ.value || strip(n.content).toLowerCase().includes(contentQ.value.toLowerCase()))
    .map((n) => {
      const c = n.clientId ? db.clientById(n.clientId) : null
      return { id: n.id, n, title: n.title, content: strip(n.content), createdBy: n.createdBy, createdByName: db.userById(n.createdBy)?.name, updatedByName: db.userById(n.updatedBy || n.createdBy)?.name,
        noteType: n.clientId ? 'Client Note' : 'General', clientName: c ? clientName(c) : '', updatedAt: n.updatedAt, createdAt: n.createdAt, pinned: isPinned(n, 'home') ? 1 : 0 }
    })
    .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt)
}
const L = useList(source, { quickMatch: { kind: (r, v) => (v === 'Self' ? r.noteType === 'General' : r.noteType === 'Client Note') } })
const quick = [{ key: 'kind', label: 'All', options: [{ label: 'Self', value: 'Self' }, { label: 'Client', value: 'Client' }] }]
const filterFields = computed(() => [
  { key: 'title', label: 'Title' }, { key: 'content', label: 'Content' },
  ...(isSupervisor() ? [{ key: 'createdByName', label: 'Created By' }] : []),
  { key: 'clientName', label: 'Client Name' },
])
const sortFields = [{ key: 'title', label: 'Title' }, { key: 'updatedAt', label: 'Last Updated' }, { key: 'createdByName', label: 'Created By' }]

const pageSize = ref(20); const page = ref(1)
watch(() => L.rows.value.length, () => (page.value = 1))
const pages = computed(() => Math.max(1, Math.ceil(L.rows.value.length / pageSize.value)))
const visible = computed(() => L.rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

const modal = ref({ open: false, note: null })
function openNote(n) { modal.value = { open: true, note: n } }
function pin(n) { try { toast.success(togglePin(n, 'home') ? 'Pinned' : 'Unpinned') } catch (e) { toast.error(e.message) } }
const menu = (r) => [
  { label: isPinned(r.n, 'home') ? 'Unpin' : 'Pin', icon: isPinned(r.n, 'home') ? 'lucide-pin-off' : 'lucide-pin', onClick: () => pin(r.n) }, // every viewer pins for themselves (D05 §2.7)
  ...(r.n.clientId ? [{ label: 'Open client', icon: 'lucide-external-link', onClick: () => router.push(`/record/${r.n.clientId}?tab=notes`) }] : []),
]
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Notes', to: '/notes' }, { label: 'List', chevron: true }]">
      <template #right><Button variant="solid" icon-left="lucide-plus" label="Create" @click="modal = { open: true, note: null }" /></template>
    </PageHeader>
    <ListToolbar v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value" no-search
      :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh">
      <template #extra>
        <div class="order-first flex gap-2">
          <TextInput v-model="titleQ" placeholder="Title" class="w-44" :debounce="150" />
          <TextInput v-model="contentQ" placeholder="Content" class="w-44" :debounce="150" />
        </div>
      </template>
    </ListToolbar>
    <div class="dms-scroll min-h-0 flex-1 overflow-y-auto p-5">
      <div v-if="L.loading.value" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="i in 6" :key="i" class="h-36 animate-pulse rounded-6 bg-surface-gray-2" />
      </div>
      <div v-else-if="!visible.length" class="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-file-text size-6" /></div>
        <p class="text-base text-ink-gray-7">No notes found</p>
      </div>
      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="r in visible" :key="r.id" class="flex h-44 cursor-pointer flex-col rounded-6 border bg-surface-base p-4 hover:shadow-sm" @click="openNote(r.n)">
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 items-center gap-1.5">
              <span v-if="r.pinned" class="lucide-pin size-3.5 shrink-0 text-ink-amber-6" />
              <span class="truncate text-base font-semibold text-ink-gray-9">{{ r.title }}</span>
            </div>
            <Dropdown v-if="menu(r).length" :options="menu(r)" align="end"><Button variant="ghost" size="sm" icon="lucide-ellipsis" @click.stop /></Dropdown>
          </div>
          <p class="mt-2 line-clamp-3 flex-1 text-p-sm text-ink-gray-7">{{ r.content || '—' }}</p>
          <div v-if="r.clientName" class="mb-1 truncate text-xs text-ink-blue-link">Client: {{ r.clientName }}</div>
          <div class="flex items-center justify-between text-sm text-ink-gray-5">
            <UserChip :user-id="r.createdBy" />
            <span>{{ timeAgo(r.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </div>
    <footer class="flex h-12 shrink-0 items-center justify-between border-t px-5 text-sm text-ink-gray-6">
      <div class="flex gap-1">
        <button v-for="s in [20, 50, 100]" :key="s" class="rounded-4 px-2 py-1" :class="pageSize === s ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'hover:bg-surface-gray-2'" @click="pageSize = s; page = 1">{{ s }}</button>
      </div>
      <div class="flex items-center gap-3">
        <span>{{ visible.length }} of {{ L.rows.value.length }}</span>
        <template v-if="pages > 1">
          <Button size="sm" icon="lucide-chevron-left" :disabled="page === 1" @click="page--" />
          <Button size="sm" icon="lucide-chevron-right" :disabled="page === pages" @click="page++" />
        </template>
      </div>
    </footer>
    <NoteModal v-model:open="modal.open" :note="modal.note" />
  </div>
</template>
