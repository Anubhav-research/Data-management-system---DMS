<script setup>
// Tasks home (Fig 18978; D05 §3.4; TASK-001, TASK-009). Visibility: creator + assignee; self-assigned only that person (D05 §3.3).
// Default sort Due Date ascending (X03; OPEN_QUESTIONS E5).
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { visibleUserIds } from '@/services/access'
import { TASK_PRIORITIES } from '@/data/masters'
import { fmtDateTime, timeAgo, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'
import TaskModal from '@/components/modals/TaskModal.vue'

const db = useDb(); const route = useRoute()
const source = () => {
  const me = db.sessionUserId
  // opened from the Dashboard or a notification (?ids=): a team leader also sees the tasks of the people below them
  const team = route.query.ids ? visibleUserIds() : null
  return db.tasks
    .filter((t) => t.createdBy === me || t.assignedTo === me || (team && team.includes(t.assignedTo)))
    .map((t) => ({ id: t.id, t, title: t.title, status: t.status, priority: t.priority, due: t.due, assignedTo: t.assignedTo, createdBy: t.createdBy, assignedName: db.userById(t.assignedTo)?.name, createdByName: db.userById(t.createdBy)?.name, updatedAt: t.updatedAt, createdAt: t.createdAt }))
}
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime() }
const L = useList(source, {
  searchKeys: ['title'],
  defaultSort: { key: 'due', dir: 'asc' },
  upcomingKeys: ['due'],
  quickMatch: {
    view: (r, v) => (v === 'assigned' ? r.assignedTo === db.sessionUserId : r.createdBy === db.sessionUserId),
    due: (r, v) => {
      if (v === 'overdue') return r.due && r.due < Date.now() && !['Completed', 'Rejected'].includes(r.status)
      if (v === 'today') return r.due && r.due >= endOfToday() - DAY && r.due <= endOfToday()
      if (v === 'week') return r.due && r.due >= Date.now() && r.due <= Date.now() + 7 * DAY
      return true
    },
  },
})
const quick = [
  { key: 'view', label: 'Tasks', options: [{ label: 'Assigned to me', value: 'assigned' }, { label: 'Created by me', value: 'created' }] },
  { key: 'priority', label: 'Priority', options: TASK_PRIORITIES },
  { key: 'status', label: 'Status', options: ['To-Do', 'In Progress', 'Completed', 'Rejected', 'Expired'] },
  { key: 'due', label: 'Due Date', options: [{ label: 'Overdue', value: 'overdue' }, { label: 'Today', value: 'today' }, { label: 'Next 7 days', value: 'week' }] },
]
const columns = [
  { key: 'title', label: 'Title', width: '260px' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' }, { key: 'due', label: 'Due Date' },
  { key: 'assignedTo', label: 'Assigned To' }, { key: 'createdBy', label: 'Created By' }, { key: 'updatedAt', label: 'Last Modified' },
]
const filterFields = [{ key: 'title', label: 'Title' }, { key: 'status', label: 'Status' }, { key: 'priority', label: 'Priority' }, { key: 'assignedName', label: 'Assigned To' }, { key: 'createdByName', label: 'Created By' }]
const sortFields = [{ key: 'due', label: 'Due Date' }, { key: 'updatedAt', label: 'Last Modified' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'assignedName', label: 'Assigned To' }, { key: 'createdByName', label: 'Created By' }, { key: 'title', label: 'Title' }]
// Status icons per D05 §3.4
const statusIcon = { 'To-Do': 'lucide-circle text-ink-gray-5', 'In Progress': 'lucide-circle-dot text-ink-amber-6', Completed: 'lucide-circle-check text-ink-green-6', Rejected: 'lucide-circle-slash text-ink-gray-8', Expired: 'lucide-circle-dashed text-ink-red-5' }
const prioCls = { High: 'text-ink-red-6', Medium: 'text-ink-amber-7', Low: 'text-ink-gray-6' }
const selection = ref([])
const modal = ref({ open: false, task: null })
onMounted(() => { if (route.query.open) { const t = db.tasks.find((x) => x.id === route.query.open); if (t) modal.value = { open: true, task: t } } })
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: 'Tasks', to: '/tasks' }, { label: 'List', chevron: true }]">
      <template #right><Button variant="solid" icon-left="lucide-plus" label="Create" @click="modal = { open: true, task: null }" /></template>
    </PageHeader>
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Title" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable v-model:selection="selection" :columns="columns" :rows="L.rows.value" :loading="L.loading.value" selectable empty-text="No tasks yet" empty-hint="Create one to get started."
      @row-click="(r) => (modal = { open: true, task: r.t })">
      <template #cell-title="{ row }"><span class="font-medium text-ink-gray-9">{{ row.title }}</span></template>
      <template #cell-status="{ row }"><span class="inline-flex items-center gap-1.5"><span :class="statusIcon[row.status]" class="size-4" />{{ row.status }}</span></template>
      <template #cell-priority="{ row }"><span :class="prioCls[row.priority]">{{ row.priority }}</span></template>
      <template #cell-due="{ row }"><span v-if="row.due" class="inline-flex items-center gap-1.5 text-sm" :class="row.status === 'Expired' && 'text-ink-red-6'"><span class="lucide-calendar size-3.5 text-ink-gray-5" />{{ fmtDateTime(row.due) }}</span><span v-else class="text-ink-gray-4">-</span></template>
      <template #cell-assignedTo="{ row }"><UserChip :user-id="row.assignedTo" /></template>
      <template #cell-createdBy="{ row }"><UserChip :user-id="row.createdBy" /></template>
      <template #cell-updatedAt="{ row }"><span class="text-ink-gray-6">{{ timeAgo(row.updatedAt) }}</span></template>
      <template #bulk><span class="text-sm text-ink-gray-5">Tasks cannot be deleted (D05 §3.11)</span></template>
    </DataTable>
    <TaskModal v-model:open="modal.open" :task="modal.task" />
  </div>
</template>
