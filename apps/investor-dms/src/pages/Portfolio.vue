<script setup>
// Portfolio icon (Investor record, right-hand panel) moves the user to the separate Transaction Platform
// (product owner, 06 Nov 2026; DMS_03 §2.6). Transactions are not rebuilt in DMS. In production this route is
// replaced by a deep link to the platform; the demo shows the hand-off.
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import PageHeader from '@/components/PageHeader.vue'
import { clientName } from '@/services/lifecycle'
const props = defineProps({ id: String })
const db = useDb()
const client = computed(() => (props.id ? db.clientById(props.id) : null))
</script>
<template>
  <div class="flex h-full flex-col">
    <PageHeader :crumbs="client ? [{ label: 'Investors', to: '/investors' }, { label: clientName(client), to: `/record/${client.id}` }, { label: 'Portfolio' }] : [{ label: 'Portfolio' }]" separator="›" />
    <div class="flex flex-1 flex-col items-center justify-center gap-3 bg-dms-header p-8 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-briefcase size-6" /></div>
      <p class="text-lg font-medium text-ink-gray-8">Opening the Transaction Platform…</p>
      <p class="max-w-lg text-p-sm text-ink-gray-6">
        <template v-if="client && client.stage === 'Investor'">In production, the Portfolio icon takes you to <b>{{ clientName(client) }}</b> ({{ client.cid }}) on Money Honey's Transaction Platform, where the verified profile, investments and transactions live.</template>
        <template v-else>The Portfolio is available only for Investors.</template>
        This demo does not include the Transaction Platform.
      </p>
      <Button v-if="client" icon-left="lucide-arrow-left" label="Back to record" :route="`/record/${client.id}`" />
    </div>
  </div>
</template>
