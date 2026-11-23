<script setup>
// Last Investment cell (Investors, Unassigned, Junk): amount · product, then the date and how long ago.
// Amount, product and date are separate fields in the list, so each can be filtered and sorted.
import { fmtDate, inr } from '@/utils/format'
import { agoYears } from '@/services/investorSignals'
defineProps({ row: { type: Object, required: true } }) // { lastInvAmount, lastInvProduct, lastInvDate, yearsSinceInv }
</script>
<template>
  <div v-if="row.lastInvDate" class="leading-tight">
    <div><span class="tabular">{{ row.lastInvAmount ? inr(row.lastInvAmount) : '-' }}</span><span class="text-ink-gray-5"> · {{ row.lastInvProduct || '-' }}</span></div>
    <div class="text-xs text-ink-gray-5">{{ fmtDate(row.lastInvDate) }} · {{ agoYears(row.yearsSinceInv) }}</div>
  </div>
  <span v-else class="text-ink-gray-5">No investment</span>
</template>
