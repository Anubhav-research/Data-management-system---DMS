<script setup>
// Update family IS - manual Admin fallback, used ONLY while the family log (F2) is switched off
// (split prompt §6.6). Logged as a manual change on the record and in the family-log list.
import { ref, computed } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import SettingsShell from '@/components/settings/SettingsShell.vue'
import { flowOn } from '@/services/bridge'
import { manualFamilyAdvisor } from '@/services/familyLog'
import { clientName } from '@/services/lifecycle'
import { isFamilyStage } from '@/services/family'
import { fmtDateTime } from '@/utils/format'

const db = useDb()
const familyId = ref(''); const mhf = ref(''); const reason = ref(''); const error = ref('')
const found = computed(() => db.clients.find((c) => c.familyId === familyId.value.trim().toUpperCase() && isFamilyStage(c)))
const manual = computed(() => (db.familyLog?.applied || []).filter((e) => e.mode === 'manual').slice(0, 20))
function apply() {
  error.value = ''
  try {
    const r = manualFamilyAdvisor(familyId.value, mhf.value, reason.value)
    toast.success(`Family ${r.client.familyId}: ${r.action}`)
    familyId.value = ''; mhf.value = ''; reason.value = ''
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <SettingsShell title="Update family IS" description="Manual fallback while the family log (F2) from Investor DMS is switched off. Every change is logged.">
    <div v-if="flowOn('F2')" class="rounded-6 border bg-surface-gray-1 p-4 text-sm text-ink-gray-7">The family log (F2) is on: families follow their investor's IS automatically. This page is used only while F2 is switched off.</div>
    <div v-else class="max-w-xl space-y-3">
      <FormControl v-model="familyId" label="Family ID" placeholder="FAM-00021" />
      <p v-if="familyId && found" class="text-sm text-ink-gray-6">{{ clientName(found) }} · {{ found.stage }} · current IS: {{ db.userById(found.assignedTo)?.name || 'none' }}</p>
      <p v-else-if="familyId" class="text-sm text-ink-red-7">No Investor Family or Unassigned Family with this Family ID.</p>
      <FormControl v-model="mhf" label="New IS's MHF ID" placeholder="MHF500011" />
      <FormControl v-model="reason" type="textarea" label="Reason" />
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
      <Button variant="solid" label="Update IS" @click="apply" />
    </div>
    <div v-if="manual.length" class="mt-6">
      <div class="mb-2 text-sm font-medium text-ink-gray-7">Manual changes</div>
      <table class="w-full text-sm"><thead class="text-left text-ink-gray-5"><tr><th class="py-1">When</th><th>Family ID</th><th>IS</th><th>Result</th><th>By / reason</th></tr></thead>
        <tbody><tr v-for="(e, i) in manual" :key="i" class="border-t"><td class="py-1">{{ fmtDateTime(e.receivedAt) }}</td><td>{{ e.familyId }}</td><td>{{ e.advisorMhfId }}</td><td>{{ e.action }}</td><td class="text-ink-gray-6">{{ e.source }}</td></tr></tbody></table>
    </div>
  </SettingsShell>
</template>
