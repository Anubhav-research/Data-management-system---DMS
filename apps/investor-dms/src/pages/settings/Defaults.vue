<script setup>
// Settings → Defaults (Frappe CRM "System Defaults" layout). Values fixed by the DMS documents, shown read-only:
// rupees with Indian digit grouping (D01 §1.4), whole-rupee amounts (D05 deals), dates and times as the lists show them.
import SettingsShell from '@/components/settings/SettingsShell.vue'

const rows = [
  { label: 'Currency', desc: 'Every amount in DMS is in rupees (₹).', value: 'INR', src: 'D01 §1.4' },
  { label: 'Currency Precision', desc: 'Amounts are whole rupees above zero.', value: '0', src: 'D05, Deals' },
  { divider: true },
  { label: 'Number Format', desc: 'Indian digit grouping, as in ₹1,00,000.', value: '#,##,###', src: 'D01 §1.4' },
  { label: 'Date Format', desc: 'How dates appear across the lists and records.', value: 'dd MMM yyyy', src: 'Figma lists' },
  { label: 'Time Format', desc: '12-hour clock with AM / PM.', value: 'hh:mm a', src: 'Figma lists' },
]
</script>
<template>
  <SettingsShell title="System Defaults" description="Currency, number, date and time formats used across DMS. Fixed by the DMS documents.">
    <div class="flex flex-col">
      <template v-for="(r, i) in rows" :key="i">
        <div v-if="r.divider" class="mx-2 h-px border-t border-outline-gray-1" />
        <div v-else class="flex items-center justify-between gap-4 py-3">
          <div class="flex flex-col">
            <div class="text-p-base font-medium text-ink-gray-7">{{ r.label }}</div>
            <div class="text-p-sm text-ink-gray-5">{{ r.desc }} <span class="text-ink-gray-4">({{ r.src }})</span></div>
          </div>
          <span class="shrink-0 rounded-4 bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-7 tabular">{{ r.value }}</span>
        </div>
      </template>
    </div>
  </SettingsShell>
</template>
