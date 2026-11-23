<script setup>
// Settings → Profile (Frappe CRM ProfileSettings layout). The signed-in person's account, read-only:
// users are created and changed by Admin in User Access (D06 §9), and sign-in is outside DMS in this demo.
import { computed } from 'vue'
import { useDb } from '@/stores/db'
import { ROLE_LABEL, USER_SWITCHES } from '@/data/masters'
import { initials } from '@/utils/format'
import SettingsShell from '@/components/settings/SettingsShell.vue'
import PersonTip from '@/components/PersonTip.vue'

const db = useDb()
const u = computed(() => db.me)
const boss = computed(() => db.userById(u.value?.reportsTo))
const rows = computed(() => [
  ['Money Honey ID', u.value.mhf_id],
  ['Role', ROLE_LABEL[u.value.role]],
  ['Reports to', boss.value ? `${boss.value.name} (${boss.value.mhf_id})` : '—'],
  ['Data Codes', u.value.dataCodes?.length ? u.value.dataCodes.join(', ') : '—'],
  ['Availability', u.value.availability || '—'],
])
</script>
<template>
  <SettingsShell v-if="u" title="Profile" description="Your account details in DMS.">
    <div class="flex items-center gap-4">
      <PersonTip :user-id="u.id"><span class="flex size-16 items-center justify-center rounded-full bg-surface-gray-3 text-2xl font-semibold text-ink-gray-7">{{ initials(u.name) }}</span></PersonTip>
      <div class="flex flex-col gap-1">
        <span class="text-2xl font-semibold text-ink-gray-8">{{ u.name }}</span>
        <span class="text-base text-ink-gray-6">{{ u.mhf_id }} · {{ ROLE_LABEL[u.role] }}</span>
      </div>
    </div>

    <div class="mt-8 text-base font-semibold text-ink-gray-9">Account Info</div>
    <div class="mt-2 divide-y divide-outline-gray-1">
      <div v-for="[k, v] in rows" :key="k" class="flex items-center justify-between gap-4 py-3">
        <span class="text-base font-medium text-ink-gray-7">{{ k }}</span>
        <span class="text-base text-ink-gray-8">{{ v }}</span>
      </div>
    </div>

    <div class="mt-8 text-base font-semibold text-ink-gray-9">Your DMS access</div>
    <p class="mt-1 text-p-sm text-ink-gray-6">Set by Admin in User Access (D06 §9). Ask Admin to change them.</p>
    <div class="mt-2 divide-y divide-outline-gray-1">
      <div class="flex items-center justify-between gap-4 py-3">
        <span class="text-base font-medium text-ink-gray-7">DMS access</span>
        <span class="text-sm" :class="u.switches?.dms ? 'text-ink-green-7' : 'text-ink-red-7'">{{ u.switches?.dms ? 'On' : 'Off' }}</span>
      </div>
      <div v-for="s in USER_SWITCHES" :key="s.key" class="flex items-center justify-between gap-4 py-3">
        <span class="text-base font-medium text-ink-gray-7">{{ s.label }}</span>
        <span class="text-sm" :class="u.switches?.[s.key] ? 'text-ink-green-7' : 'text-ink-gray-5'">{{ u.switches?.[s.key] ? 'On' : 'Off' }}</span>
      </div>
    </div>
  </SettingsShell>
</template>
