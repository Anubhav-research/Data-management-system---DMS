<script setup>
// "Review Proposed Changes" drawer (D03 §23.4; Fig 28575, 28643). Current vs proposed per change, deletion
// requests, authorization notes. Current approver may edit proposed values; edits go to the next level (D03 §23.6).
import { ref, computed, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { isMyTurn, approve, reject } from '@/services/approvals'
import { fmtDateTime } from '@/utils/format'

const props = defineProps({ request: Object, client: Object })
const open = defineModel('open', { default: false })
const db = useDb()
const edits = ref([])
watch(open, (v) => { if (v) edits.value = JSON.parse(JSON.stringify(props.request.changes)) })
const mine = computed(() => isMyTurn(props.request) && props.request.status === 'Pending')
const updates = computed(() => edits.value.filter((c) => c.kind !== 'delete'))
const deletions = computed(() => edits.value.filter((c) => c.kind === 'delete'))
const requester = computed(() => db.userById(props.request.requestedBy))
function doApprove() {
  for (const c of updates.value) {
    if (c.section === 'contact' && !/^\d{10}$/.test(c.new)) return toast.error('Mobile numbers must be 10 digits.')
    if (c.section === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.new)) return toast.error('Enter a valid email address.')
    if (c.field === 'first_name' && !String(c.new).trim()) return toast.error('First Name is mandatory.')
  }
  try { approve(props.request, edits.value); toast.success(props.request.status === 'Approved' ? 'Approved – changes applied' : 'Approved – sent to the next level'); open.value = false } catch (e) { toast.error(e.message) }
}
function doReject() { try { reject(props.request); toast.success('Request rejected'); open.value = false } catch (e) { toast.error(e.message) } }
const sectionLabel = { identity: 'Identity details', contact: 'Contact details', email: 'Contact details' }
</script>
<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[70] flex justify-end bg-black/30" @click.self="open = false">
      <aside class="flex h-full w-[460px] flex-col bg-surface-base shadow-2xl">
        <div class="flex items-start justify-between border-b p-4">
          <div>
            <h3 class="text-xl font-semibold text-ink-gray-9">Review Proposed Changes</h3>
            <div class="mt-1 flex gap-1.5 text-xs">
              <span class="rounded-4 bg-surface-blue-2 px-1.5 py-0.5 text-ink-blue-7">{{ updates.length }} Updates</span>
              <span v-if="deletions.length" class="rounded-4 bg-surface-red-2 px-1.5 py-0.5 text-ink-red-7">{{ deletions.length }} Deletions</span>
            </div>
            <p class="mt-1.5 text-sm text-ink-gray-6">Requested by {{ requester?.role === 'IS' ? 'Investment Specialist' : requester?.role }} - {{ requester?.name }} ({{ requester?.mhf_id }})</p>
          </div>
          <Button variant="ghost" icon="lucide-x" @click="open = false" />
        </div>
        <div class="dms-scroll flex-1 space-y-4 overflow-y-auto p-4">
          <div v-for="(c, i) in updates" :key="i" class="rounded-6 border p-3">
            <div class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">{{ sectionLabel[c.section] }}</div>
            <div class="mt-1 flex items-center justify-between">
              <span class="text-base font-medium text-ink-gray-8">{{ c.label }}<span class="ml-1 text-xs text-ink-gray-5">· {{ c.memberName }}</span></span>
              <span class="rounded-4 bg-surface-amber-2 px-1.5 py-0.5 text-2xs font-medium text-ink-amber-8">{{ c.kind === 'add' ? 'NEW' : 'MODIFIED' }}</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><div class="text-xs text-ink-gray-5">Current Value</div><div class="mt-0.5 rounded-4 bg-surface-gray-2 px-2 py-1.5 text-ink-gray-7">{{ c.old || '—' }}</div></div>
              <div><div class="text-xs text-ink-gray-5">Proposed</div>
                <input v-if="mine" v-model="c.new" class="mt-0.5 w-full rounded-4 border-outline-blue-3 bg-surface-blue-1 px-2 py-1 text-sm" />
                <div v-else class="mt-0.5 rounded-4 bg-surface-blue-1 px-2 py-1.5 text-ink-blue-8">{{ c.new }}</div>
              </div>
            </div>
          </div>
          <div v-if="deletions.length">
            <div class="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-gray-5">Deletion Requests <span class="text-ink-red-6">{{ deletions.length }} To Delete</span></div>
            <div v-for="(c, i) in deletions" :key="i" class="mb-2 flex items-center justify-between rounded-6 border border-outline-red-2 bg-surface-red-1 p-3 text-sm">
              <div><div class="font-medium text-ink-gray-8">{{ c.label }}</div><div class="text-ink-red-7 line-through">{{ c.old }}</div></div>
              <span class="rounded-4 bg-surface-red-2 px-1.5 py-0.5 text-2xs font-medium text-ink-red-7">Delete</span>
            </div>
          </div>
          <div class="rounded-6 bg-surface-gray-1 p-3 text-p-xs text-ink-gray-6">
            <div class="mb-1 font-medium text-ink-gray-7">Authorization Notes</div>
            Submitted: {{ fmtDateTime(request.requestedOn) }} by {{ requester?.name }}. Approving at the final level will apply the {{ updates.length }} updated field(s){{ deletions.length ? ` and permanently remove the ${deletions.length} marked row(s)` : '' }}.
            <template v-if="mine"> You may edit a proposed value before approving; your version goes to the next level.</template>
          </div>
        </div>
        <div v-if="mine" class="flex justify-end gap-2 border-t p-4">
          <Button theme="red" variant="subtle" label="Reject Request" @click="doReject" />
          <Button variant="solid" label="Submit & Approve" @click="doApprove" />
        </div>
        <div v-else class="border-t p-4 text-sm text-ink-gray-5">Read-only view. Only the current approver can decide.</div>
      </aside>
    </div>
  </Teleport>
</template>
