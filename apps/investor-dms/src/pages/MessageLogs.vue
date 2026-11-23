<script setup>
// WhatsApp Logs (Fig 25532; D04 §15; MSG-009, MSG-010) and Email Logs (Fig 25872; D04 §16; MSG-011, MSG-012).
// Read-only. Numbers and addresses are always masked; nobody can unmask (GEN-008). Sent By for TL+ (X03; OPEN_QUESTIONS C5).
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Badge } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { useList } from '@/composables/useList'
import { WA_STATUSES, EMAIL_STATUSES } from '@/data/masters'
import { visibleUserIds, isAdmin, isSupervisor, downline } from '@/services/access'
import { clientName } from '@/services/lifecycle'
import { fmtRelativeDay, maskPhoneX, maskEmail, DAY } from '@/utils/format'
import PageHeader from '@/components/PageHeader.vue'
import ListToolbar from '@/components/ListToolbar.vue'
import SilentFilterBar from '@/components/SilentFilterBar.vue'
import DataTable from '@/components/DataTable.vue'
import UserChip from '@/components/UserChip.vue'

const props = defineProps({ channel: { type: String, default: 'wa' } })
const db = useDb(); const router = useRouter()
const isWa = computed(() => props.channel === 'wa')
const title = computed(() => (isWa.value ? 'WhatsApp Logs' : 'Email Logs'))
const source = () => {
  const ids = visibleUserIds()
  const list = isWa.value ? db.wa : db.emails
  return list
    .filter((m) => isAdmin() || ids.includes(m.sentBy))
    .map((m) => {
      const c = db.clientById(m.clientId)
      return { id: m.id, m, clientId: m.clientId, cid: c?.cid || c?.id || '-', clientName: c ? clientName(c) : 'Unknown', address: isWa.value ? maskPhoneX(m.mobile) : maskEmail(m.email),
        stage: m.stage, at: m.at, direction: m.direction, type: m.type, template: m.template || '-', subject: m.subject || '-', status: m.status, sentBy: m.sentBy, sentByName: db.userById(m.sentBy)?.name }
    })
}
const L = useList(source, {
  searchKeys: ['cid', 'clientName'],
  defaultSort: { key: 'at', dir: 'desc' },
  quickMatch: { when: (r, v) => Date.now() - r.at <= Number(v) * DAY, team: (r, v) => r.sentBy === v || downline(v).includes(r.sentBy) },
})
const quick = computed(() => [
  { key: 'when', label: 'Date and time', options: [{ label: 'Today', value: 1 }, { label: 'Last 7 days', value: 7 }, { label: 'Last 30 days', value: 30 }] },
  { key: 'stage', label: 'Client Stage', options: ['Prospect', 'Lead', 'Investor'] },
  { key: 'status', label: 'Status', options: isWa.value ? [...WA_STATUSES, 'Received'] : [...EMAIL_STATUSES, 'Received'] },
  ...(isSupervisor() ? [{ key: 'sentBy', label: 'Sent By', options: db.users.filter((u) => isAdmin() || visibleUserIds().includes(u.id)).map((u) => ({ label: u.name, value: u.id })) }] : []),
  ...(isSupervisor() ? [{ key: 'team', label: 'Team', options: db.users.filter((u) => ['TL', 'VP', 'President'].includes(u.role) && (isAdmin() || [db.sessionUserId, ...downline(db.sessionUserId)].includes(u.id))).map((u) => ({ label: `${u.name} (${u.role})`, value: u.id })) }] : []),
])
const columns = computed(() => [
  { key: 'cid', label: 'Client ID' }, { key: 'clientName', label: 'Client Name' }, { key: 'address', label: isWa.value ? 'WhatsApp Number' : 'Email Address' },
  { key: 'stage', label: 'Client Stage' }, { key: 'at', label: 'Date & Time' }, { key: 'direction', label: 'Direction' }, { key: 'type', label: 'Message Type' },
  { key: 'template', label: 'Template Name' }, ...(isWa.value ? [] : [{ key: 'subject', label: 'Subject', width: '260px' }]), { key: 'status', label: 'Status' },
  ...(isSupervisor() ? [{ key: 'sentBy', label: 'Sent By' }] : []),
])
const filterFields = computed(() => [{ key: 'clientName', label: 'Client Name' }, { key: 'template', label: 'Template Name' }, { key: 'status', label: 'Status' }, ...(isWa.value ? [] : [{ key: 'subject', label: 'Subject' }]), ...(isSupervisor() ? [{ key: 'sentByName', label: 'Sent By' }] : [])])
const sortFields = [{ key: 'at', label: 'Date & Time' }, { key: 'clientName', label: 'Client Name' }, { key: 'status', label: 'Status' }]
const statusTheme = { Read: 'green', Opened: 'green', Delivered: 'blue', Sent: 'gray', Received: 'violet', Failed: 'red', Bounced: 'red', 'Invalid Number': 'red', 'Not on WhatsApp': 'amber' }
function open(r) { router.push(`/record/${r.clientId}?tab=${isWa.value ? 'whatsapp' : 'emails'}`) }
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="[{ label: title, to: isWa ? '/whatsapp-logs' : '/email-logs' }, { label: 'List', chevron: true }]" />
    <ListToolbar v-model:search="L.search.value" v-model:quick-values="L.quickValues.value" v-model:advanced="L.advanced.value" v-model:sort="L.sort.value"
      placeholder="Client ID / Name" :quick="quick" :filter-fields="filterFields" :sort-fields="sortFields" @refresh="L.refresh" />
    <SilentFilterBar v-if="L.silentIds.value" :count="L.rows.value.length" @clear="L.clearSilent" />
    <DataTable :key="channel" :columns="columns" :rows="L.rows.value" :loading="L.loading.value" uppercase :empty-text="`No ${isWa ? 'WhatsApp messages' : 'emails'} found`" @row-click="open">
      <template #cell-cid="{ row }"><span class="tabular text-ink-gray-6">{{ row.cid }}</span></template>
      <template #cell-address="{ row }"><span class="tabular whitespace-nowrap">{{ row.address }}</span></template>
      <template #cell-at="{ row }"><span class="whitespace-nowrap text-sm">{{ fmtRelativeDay(row.at) }}</span></template>
      <template #cell-direction="{ row }"><span class="inline-flex items-center gap-1"><span :class="row.direction === 'Received' ? 'lucide-arrow-down-left text-ink-green-6' : 'lucide-arrow-up-right text-ink-blue-6'" class="size-4" />{{ row.direction }}</span></template>
      <template #cell-template="{ row }"><span class="font-mono text-sm text-ink-gray-6">{{ row.template }}</span></template>
      <template #cell-subject="{ row }"><span class="block max-w-[260px] truncate" :title="row.subject">{{ row.subject }}</span></template>
      <template #cell-status="{ row }"><Badge :label="row.status" :theme="statusTheme[row.status] || 'gray'" /></template>
      <template #cell-sentBy="{ row }"><UserChip :user-id="row.sentBy" /></template>
    </DataTable>
  </div>
</template>
