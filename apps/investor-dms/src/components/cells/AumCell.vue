<script setup>
// AUM cell (Investors, Unassigned, Junk; product owner, 21 Nov 2026): what the investments are worth now, and under it
// the gain (or loss) over the money invested in them. Hover: both amounts and the day of the values (end of day).
import { computed } from 'vue'
import { inr, inrShort, fmtDate } from '@/utils/format'
const props = defineProps({ row: { type: Object, required: true } }) // { aum, invested, gain, gainPct, valuesAsOf }
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '')
const tip = computed(() => [`AUM (current value) ${inr(props.row.aum)}`, props.row.invested ? `Invested ${inr(props.row.invested)}` : '', props.row.valuesAsOf ? `Values as of ${fmtDate(props.row.valuesAsOf)}, end of day` : ''].filter(Boolean).join(' · '))
</script>
<template>
  <div v-if="row.aum" class="leading-tight" :title="tip">
    <div class="tabular">{{ inrShort(row.aum) }}</div>
    <div v-if="row.gain != null" class="text-xs tabular" :class="row.gain > 0 ? 'text-ink-green-7' : row.gain < 0 ? 'text-ink-red-6' : 'text-ink-gray-5'" data-testid="aum-gain">
      <template v-if="row.gain">{{ sign(row.gain) }}{{ inrShort(Math.abs(row.gain)) }} · {{ sign(row.gainPct) }}{{ Math.abs(row.gainPct) }}%</template><template v-else>No change</template>
    </div>
  </div>
  <span v-else class="text-ink-gray-5">-</span>
</template>
