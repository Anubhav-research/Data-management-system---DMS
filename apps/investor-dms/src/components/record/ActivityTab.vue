<script setup>
// Activity timeline (D03 §3; GEN-014; Fig 7263 / 11415). Newest first (D01 §1.4).
// Fresh view (POOL-016): items before `since` are hidden. Grid icon = Ownership History, Investor + Admin only (D03 §10).
import { computed, ref } from 'vue'
import { Button, Tooltip } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { isAdmin } from '@/services/access'
import { timeAgo, fmtDateTime, fmtDuration, initials, inr } from '@/utils/format'
import OwnershipHistoryModal from '@/components/modals/OwnershipHistoryModal.vue'
import PersonTip from '@/components/PersonTip.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const uname = (id) => db.userById(id)?.name || 'System'
const first = (id) => uname(id).split(' ')[0]
const ownOpen = ref(false)

const items = computed(() => {
  const id = props.client.id
  const s = props.since || 0
  const out = []
  // stage / owner / approval / misc entries (calls, events, notes, deals, messages are rendered from their own objects)
  for (const a of db.activities) {
    if (a.clientId !== id || ['call', 'event', 'note', 'whatsapp', 'email'].includes(a.type)) continue
    out.push({ key: a.id, at: a.at, actor: a.actor, kind: a.type, text: a.text })
  }
  for (const c of db.calls) if (c.clientId === id) out.push({ key: c.id, at: c.at, actor: c.madeBy, kind: 'call', call: c, text: 'has made a call' })
  for (const e of db.events) if (e.clientId === id) out.push({ key: e.id, at: e.createdAt, actor: e.createdBy, kind: 'event', event: e, text: 'has created an event' })
  for (const n of db.notes) if (n.clientId === id) out.push({ key: n.id, at: n.createdAt, actor: n.createdBy, kind: 'note', note: n, text: 'added a note' })
  for (const w of db.wa) if (w.clientId === id) out.push({ key: w.id, at: w.at, actor: w.direction === 'Sent' ? w.sentBy : null, kind: 'wa', msg: w, text: w.direction === 'Sent' ? `sent a WhatsApp ${w.type === 'Template' ? 'template' : 'message'}` : 'Client replied on WhatsApp' })
  for (const m of db.emails) if (m.clientId === id) out.push({ key: m.id, at: m.at, actor: m.direction === 'Sent' ? m.sentBy : null, kind: 'email', msg: m, text: m.direction === 'Sent' ? `sent an email: ${m.subject}` : `Client replied by email: ${m.subject}` })
  return out.filter((x) => x.at >= s).sort((a, b) => b.at - a.at)
})
const icon = { call: 'lucide-phone', event: 'lucide-calendar', note: 'lucide-file-text', wa: 'icon-whatsapp', email: 'lucide-mail', stage: 'lucide-git-branch', owner: 'lucide-user-round-cog', approval: 'lucide-badge-check', deal: 'lucide-handshake', document: 'lucide-paperclip' }
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Activity</h3>
      <Tooltip v-if="client.stage === 'Investor' && isAdmin()" text="Ownership History (Admin only)">
        <Button icon="lucide-layout-grid" @click="ownOpen = true" />
      </Tooltip>
    </div>
    <div v-if="!items.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-activity size-6" /></div>
      <p class="text-base text-ink-gray-7">No activity yet</p>
      <p v-if="since" class="text-sm text-ink-gray-5">Earlier history is not shown after a return to Pool (fresh view).</p>
    </div>
    <ol v-else class="relative space-y-5 before:absolute before:bottom-0 before:left-[15px] before:top-2 before:border-l before:border-outline-gray-2">
      <li v-for="it in items" :key="it.key" class="relative flex gap-3">
        <span class="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface-base text-xs font-medium text-ink-gray-7">
          <PersonTip v-if="it.actor" :user-id="it.actor"><span class="text-2xs">{{ initials(uname(it.actor)) }}</span></PersonTip>
          <span v-else :class="icon[it.kind] || 'lucide-dot'" class="size-3.5" />
        </span>
        <div class="min-w-0 flex-1 pt-1.5">
          <div class="flex items-start justify-between gap-3 text-base">
            <p class="text-ink-gray-6"><span v-if="it.actor" class="font-medium text-ink-gray-8">{{ first(it.actor) }}</span> {{ it.text }}</p>
            <span class="shrink-0 text-sm text-ink-gray-5" :title="fmtDateTime(it.at)">{{ timeAgo(it.at) }}</span>
          </div>
          <div v-if="it.kind === 'call'" class="mt-2 rounded-6 border p-3 text-sm">
            <div class="flex flex-wrap items-center gap-3 text-ink-gray-7">
              <span class="flex items-center gap-1.5 font-medium text-ink-gray-8"><span :class="it.call.direction === 'Inbound' ? 'lucide-phone-incoming' : 'lucide-phone-outgoing'" class="size-3.5" />{{ it.call.direction }} Call</span>
              <span>{{ fmtDateTime(it.call.at) }}</span>
              <span class="tabular">{{ fmtDuration(it.call.duration) }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs" :class="it.call.status === 'Connected' ? 'bg-surface-green-2 text-ink-green-7' : 'bg-surface-red-2 text-ink-red-7'">{{ it.call.status }}</span>
              <span class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-xs">{{ it.call.subStatus }}</span>
            </div>
            <p v-if="it.call.comment" class="mt-2 flex gap-2 rounded-4 bg-surface-gray-1 p-2 text-ink-gray-7"><span class="lucide-sticky-note mt-0.5 size-3.5 shrink-0" />{{ it.call.comment }}</p>
          </div>
          <div v-else-if="it.kind === 'event'" class="mt-2 rounded-6 border p-3 text-sm text-ink-gray-7">
            <span class="font-medium text-ink-gray-8">{{ it.event.type }}</span> · {{ it.event.title }} · {{ it.event.allDay ? 'All Day' : fmtDateTime(it.event.start) }}
          </div>
          <div v-else-if="it.kind === 'note'" class="mt-2 rounded-6 border p-3 text-sm"><span class="font-medium text-ink-gray-8">{{ it.note.title }}</span><p class="mt-1 line-clamp-2 text-ink-gray-6">{{ it.note.content }}</p></div>
          <div v-else-if="it.kind === 'wa' || it.kind === 'email'" class="mt-1 text-sm text-ink-gray-5">Status: {{ it.msg.status }}<span v-if="it.msg.template"> · {{ it.msg.template }}</span></div>
        </div>
      </li>
    </ol>
    <OwnershipHistoryModal v-if="client.stage === 'Investor'" v-model:open="ownOpen" :client-id="client.id" />
  </div>
</template>
