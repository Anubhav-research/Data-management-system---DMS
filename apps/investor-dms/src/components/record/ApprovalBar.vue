<script setup>
// Approval card on the record (D03 §23.1; APP-003..008; Fig 26227, 30464, 30973, 31482). Visible to everyone who
// opens the record; decision buttons only for the current approver (the requester cannot approve their own request).
// Redesigned 21 Nov 2026 (product owner): people by name only, no designations; reads top to bottom -
//   what is asked and by whom  ->  the approval steps (done / now / next)  ->  what will change  ->  your decision.
import { ref, computed } from 'vue'
import { Button, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { isMyTurn, approve, reject } from '@/services/approvals'
import { fullName } from '@/services/lifecycle'
import { fmtDateTime, timeAgo, initials } from '@/utils/format'
import ReviewChangesDrawer from './ReviewChangesDrawer.vue'
import PersonFormModal from '@/components/modals/PersonFormModal.vue'

const props = defineProps({ request: Object, client: Object })
const db = useDb()
const r = computed(() => props.request)
const mine = computed(() => isMyTurn(r.value))
const drawer = ref(false)
const memberForm = ref(false)
const isAdd = computed(() => r.value.category === 'Group Member' && r.value.payload?.op === 'add')
const isRemove = computed(() => r.value.category === 'Group Member' && r.value.payload?.op === 'remove')
const title = computed(() => (isAdd.value ? 'Add a group member' : isRemove.value ? `Remove ${r.value.payload.memberKeys.length === 1 ? 'a group member' : 'group members'}` : `Change ${r.value.categories.join(', ').toLowerCase()}`))
const nameOf = (id) => db.userById(id)?.name || 'Unknown'
const me = (id) => id === db.sessionUserId
const current = computed(() => r.value.chain.find((s) => s.state === 'Pending'))
const done = computed(() => r.value.chain.filter((s) => s.state === 'Approved' || s.state === 'Skipped').length)

// one step of the approval path
const STEP = {
  Approved: { dot: 'bg-surface-green-3 text-ink-green-8 ring-surface-green-3', icon: 'lucide-check', line: 'bg-surface-green-3' },
  Pending: { dot: 'bg-surface-amber-2 text-ink-amber-8 ring-outline-amber-3', icon: '', line: 'bg-surface-gray-3' },
  Waiting: { dot: 'bg-surface-gray-2 text-ink-gray-6 ring-surface-gray-2', icon: '', line: 'bg-surface-gray-3' },
  Skipped: { dot: 'bg-surface-gray-2 text-ink-gray-5 ring-surface-gray-2', icon: 'lucide-skip-forward', line: 'bg-surface-gray-3' },
  Rejected: { dot: 'bg-surface-red-2 text-ink-red-7 ring-outline-red-3', icon: 'lucide-x', line: 'bg-surface-gray-3' },
}
function stepNote(s) {
  if (s.state === 'Approved') return `Approved ${timeAgo(s.at)}${s.edited ? ' · edited' : ''}`
  if (s.state === 'Pending') return me(s.userId) ? 'Your turn' : 'Reviewing now'
  if (s.state === 'Skipped') return 'Skipped (absent)'
  if (s.state === 'Rejected') return `Rejected ${timeAgo(s.at)}`
  return 'Next'
}

// what will change (removal of members)
const memberName = (k) => fullName(props.client.members.find((m) => m.key === k))
const dest = (d) => (d === 'Stay' ? (props.client.stage === 'Lead' ? 'Stay in Lead' : 'Stay in Prospect') : 'Release to Pool')
const removal = computed(() => {
  if (!isRemove.value) return null
  const p = r.value.payload
  if (p.mode === 'together' || p.memberKeys.length === 1) {
    return { heading: 'They leave together as one new group', facts: [['Members', p.memberKeys.map(memberName).join(', ')], ['Primary', memberName(p.primaryKey || p.memberKeys[0])], ['Goes to', dest(p.destination || p.destinations?.[p.memberKeys[0]])]] }
  }
  return { heading: 'Each member goes their own way', facts: p.memberKeys.map((k) => [memberName(k), dest(p.destinations[k])]) }
})

function doApprove() { try { approve(r.value); toast.success(r.value.status === 'Approved' ? 'Approved – change applied' : 'Approved – sent to the next approver') } catch (e) { toast.error(e.message) } }
function doReject() { try { reject(r.value); toast.success('Request rejected – requester notified') } catch (e) { toast.error(e.message) } }
</script>
<template>
  <section class="overflow-hidden rounded-8 border bg-surface-base shadow-sm" :class="mine ? 'border-outline-amber-3' : 'border-outline-gray-2'" data-testid="approval-card">
    <!-- what is asked, by whom, where it stands -->
    <header class="flex items-start gap-3 px-4 pt-4">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="isAdd ? 'bg-surface-green-2 text-ink-green-7' : isRemove ? 'bg-surface-red-2 text-ink-red-7' : 'bg-surface-blue-2 text-ink-blue-7'">
        <span :class="isAdd ? 'lucide-user-plus' : isRemove ? 'lucide-user-minus' : 'lucide-file-pen'" class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="text-base font-semibold text-ink-gray-9">{{ title }}</h3>
        <p class="mt-0.5 text-sm text-ink-gray-6">
          Requested by {{ me(r.requestedBy) ? 'you' : nameOf(r.requestedBy) }} · {{ timeAgo(r.requestedOn) }}<template v-if="isAdd"> · {{ fullName(r.payload.member) }} ({{ r.payload.member.relationship }})</template>
        </p>
      </div>
      <span class="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-amber-1 px-2.5 py-1 text-xs font-medium text-ink-amber-8" data-testid="approval-status">
        <span class="size-1.5 rounded-full bg-surface-amber-7" />Waiting for approval · {{ done }} of {{ r.chain.length }}
      </span>
    </header>

    <!-- approval path -->
    <ol class="flex flex-wrap gap-y-3 px-4 pb-1 pt-4" aria-label="Approval steps">
      <li v-for="(s, i) in r.chain" :key="i" class="flex min-w-[150px] flex-1 items-start" data-testid="approval-step">
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex items-center">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-2" :class="[STEP[s.state].dot, s.state === 'Pending' && 'ring-offset-2']">
              <span v-if="STEP[s.state].icon" :class="STEP[s.state].icon" class="size-3.5" /><template v-else>{{ initials(nameOf(s.userId)) }}</template>
            </span>
            <span v-if="i < r.chain.length - 1" class="mx-2 h-0.5 flex-1 rounded-full" :class="STEP[s.state].line" />
          </div>
          <div class="mt-1.5 min-w-0 pr-3">
            <div class="truncate text-sm" :class="s.state === 'Pending' ? 'font-semibold text-ink-gray-9' : s.state === 'Waiting' ? 'text-ink-gray-6' : 'font-medium text-ink-gray-8'">{{ me(s.userId) ? 'You' : nameOf(s.userId) }}</div>
            <div class="truncate text-xs" :title="s.at ? fmtDateTime(s.at) : undefined" :class="s.state === 'Pending' ? 'text-ink-amber-8' : s.state === 'Approved' ? 'text-ink-green-7' : s.state === 'Rejected' ? 'text-ink-red-7' : 'text-ink-gray-5'">{{ stepNote(s) }}</div>
          </div>
        </div>
      </li>
    </ol>

    <!-- what will change -->
    <div v-if="removal" class="mx-4 mt-3 rounded-6 bg-surface-gray-1 px-3 py-2.5" data-testid="approval-details">
      <div class="text-xs font-medium text-ink-gray-6">{{ removal.heading }}</div>
      <dl class="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <template v-for="[k, v] in removal.facts" :key="k"><dt class="text-ink-gray-5">{{ k }}</dt><dd class="text-ink-gray-9">{{ v }}</dd></template>
      </dl>
    </div>

    <!-- decision -->
    <footer class="mt-3 flex flex-wrap items-center gap-2 border-t px-4 py-2.5" :class="mine ? 'bg-surface-amber-1' : 'bg-surface-gray-1'">
      <span class="text-sm" :class="mine ? 'font-medium text-ink-amber-8' : 'text-ink-gray-6'">
        <template v-if="mine">Your approval is needed</template>
        <template v-else-if="current">Waiting for {{ nameOf(current.userId) }}</template>
        <template v-else>Waiting for an approver</template>
      </span>
      <div class="ml-auto flex flex-wrap gap-2">
        <Button v-if="isAdd" size="sm" icon-left="lucide-search" :label="mine ? 'Review request' : 'View request'" @click="memberForm = true" />
        <Button v-else-if="!isRemove" size="sm" icon-left="lucide-eye" :label="`Review changes (${r.changes.length})`" @click="drawer = true" />
        <template v-if="mine && !isAdd">
          <Button size="sm" theme="red" variant="subtle" icon-left="lucide-x" label="Reject" data-testid="approval-reject" @click="doReject" />
          <Button size="sm" variant="solid" icon-left="lucide-check" label="Approve" data-testid="approval-approve" @click="doApprove" />
        </template>
      </div>
    </footer>
    <ReviewChangesDrawer v-if="!isAdd && !isRemove" v-model:open="drawer" :request="r" :client="client" />
    <PersonFormModal v-if="isAdd" v-model:open="memberForm" mode="member" :client-id="client.id" :request="r" />
  </section>
</template>
