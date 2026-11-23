<script setup>
// Create / Update Task (Fig 19482, 19339, 19586, 19706, 19841; D05 §3.5-3.9; TASK-002..008).
// Creator edits details; assignee changes status only (TASK-007). Remark required for Completed/Rejected (TASK-006).
import { timeOptions, TIME_FORMAT, todayIso, pastReason } from '@/utils/timeOptions'
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/data/masters'
import { createTask, updateTask, assignableUsers } from '@/services/work'
import { toInputDate, toInputTime, combineDateTime } from '@/utils/format'

const props = defineProps({ task: { type: Object, default: null } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['saved'])
const db = useDb()
const f = ref({})
const error = ref('')
const remarkError = ref('')
watch(open, (v) => {
  if (!v) return
  error.value = ''; remarkError.value = ''
  const t = props.task
  f.value = t
    ? { title: t.title, description: t.description || '', priority: t.priority, status: t.status, assignedTo: t.assignedTo, date: toInputDate(t.due), time: toInputTime(t.due), remark: t.remark || '' }
    : { title: '', description: '', priority: 'Low', status: 'To-Do', assignedTo: db.sessionUserId, date: '', time: '', remark: '' }
})
const isCreator = computed(() => !props.task || props.task.createdBy === db.sessionUserId)
const isAssignee = computed(() => props.task && props.task.assignedTo === db.sessionUserId)
const detailsLocked = computed(() => !isCreator.value)
const statusLocked = computed(() => props.task && !isAssignee.value && !isCreator.value)
const expired = computed(() => props.task?.status === 'Expired')
const statusOptions = computed(() => (expired.value ? ['Expired', ...TASK_STATUSES] : TASK_STATUSES))
const userOptions = computed(() => {
  const list = assignableUsers()
  if (props.task && !list.some((u) => u.id === props.task.assignedTo)) list.push(db.userById(props.task.assignedTo))
  return list.filter(Boolean).map((u) => ({ label: `${u.name} (${u.role})`, value: u.id }))
})
const needsRemark = computed(() => ['Completed', 'Rejected'].includes(f.value.status))

function save() {
  error.value = ''; remarkError.value = ''
  if (needsRemark.value && !f.value.remark?.trim()) { remarkError.value = 'Remark is required when completing or cancelling a task.'; return }
  const due = f.value.date ? combineDateTime(f.value.date, f.value.time || '18:00') : null
  // nothing in the past: a new task, or an opened one whose due date or time was changed
  if (due && (!props.task || due !== props.task.due)) { const why = f.value.time ? pastReason(due, 'Due date and time') : f.value.date < todayIso() ? 'Due date must be today or later.' : ''; if (why) { error.value = why; return } }
  try {
    if (!props.task) {
      createTask({ title: f.value.title.trim(), description: f.value.description, priority: f.value.priority, status: f.value.status, assignedTo: f.value.assignedTo, due, remark: f.value.remark })
      toast.success('Task created')
    } else {
      const patch = { status: f.value.status, remark: f.value.remark }
      if (isCreator.value) Object.assign(patch, { title: f.value.title.trim(), description: f.value.description, priority: f.value.priority, assignedTo: f.value.assignedTo, due })
      updateTask(props.task, patch)
      toast.success('Task updated')
    }
    open.value = false
    emit('saved')
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <Dialog v-model:open="open" :title="task ? 'Update Task' : 'Create Task'" size="xl">
    <div class="space-y-4">
      <FormControl v-model="f.title" label="Title" required placeholder="Title" :disabled="detailsLocked" />
      <FormControl v-model="f.description" label="Description" type="textarea" :rows="3" placeholder="Description" :disabled="detailsLocked" />
      <div class="grid grid-cols-2 gap-4">
        <FormControl v-model="f.priority" label="Priority" required type="select" :options="TASK_PRIORITIES" :disabled="detailsLocked" />
        <FormControl v-model="f.assignedTo" label="Assigned To" required type="select" :options="userOptions" :disabled="detailsLocked" />
        <div class="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
          <FormControl v-model="f.date" label="Due Date" type="date" format="MMM D, YYYY" :min="todayIso()" class="min-w-0 [&_input]:w-full" :disabled="detailsLocked" />
          <FormControl v-model="f.time" label="Time" type="time" :format="TIME_FORMAT" :options="timeOptions({ date: f.date, keep: f.time })" class="min-w-0 [&_input]:w-full" :disabled="detailsLocked" />
        </div>
        <FormControl v-model="f.status" label="Status" required type="select" :options="statusOptions" :disabled="statusLocked || !task" />
      </div>
      <div v-if="task">
        <FormControl v-model="f.remark" label="Remark" type="textarea" :rows="2" placeholder="Enter remark..." :required="needsRemark" :disabled="statusLocked"
          :class="remarkError && '[&_textarea]:!border-outline-red-3'" />
        <p v-if="remarkError" class="mt-1 text-sm text-ink-red-7">{{ remarkError }}</p>
        <p v-else-if="needsRemark" class="mt-1 text-xs text-ink-gray-5">Required when marking a task as completed or rejected.</p>
      </div>
      <p v-if="task && detailsLocked" class="text-xs text-ink-gray-5">Only the creator can edit task details. As the assignee you can change the status (TASK-007).</p>
      <p v-if="!task" class="text-xs text-ink-gray-5">New tasks start as To-Do. Expired is set by the system when the due time passes (TASK-005).</p>
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" @click="open = false" />
        <Button v-if="!statusLocked" variant="solid" :label="task ? 'Update' : 'Create'" @click="save" />
      </div>
    </template>
  </Dialog>
</template>
