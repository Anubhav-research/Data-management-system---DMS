<script setup>
// A rate against its target (design review 27 Nov 2026), e.g. the connect rate against the 75% at which it turns
// green: a half ring filled to the rate in the accent, a tick at the target, the rate in the middle, and under it how
// far from the target it is - with an icon and words, never colour alone. Optional parts show each website's own rate.
// card: { value (0-100), target, label, parts: [{ label, value, tone }], drill, listCount }
import { computed } from 'vue'
import { toneColor } from '../../dash/tones.js'
const props = defineProps({ card: { type: Object, required: true } })
const emit = defineEmits(['open'])
const v = computed(() => Math.max(0, Math.min(100, Number(props.card.value) || 0)))
const target = computed(() => props.card.target ?? null)
const met = computed(() => target.value != null && v.value >= target.value)
// the target tick on the arc (radius 40 around 50,50; 0% on the left, 100% on the right)
const tick = computed(() => { if (target.value == null) return null; const a = Math.PI * (1 - target.value / 100); return { x1: 50 + 33 * Math.cos(a), y1: 50 - 33 * Math.sin(a), x2: 50 + 47 * Math.cos(a), y2: 50 - 47 * Math.sin(a) } })
const clickable = computed(() => !!(props.card.drill && props.card.drill.some((d) => d.count && d.to)))
</script>
<template>
  <div class="flex flex-col items-center">
    <component :is="clickable ? 'button' : 'div'" type="button" class="relative w-full max-w-[240px]" :class="clickable && 'rounded-xl hover:bg-surface-gray-1'" :data-testid="`dash-gauge-${card.key}`"
      :data-count="clickable ? card.listCount : undefined" :aria-label="`${card.label}: ${card.value ?? '–'}%`" @click="clickable && emit('open', card.drill, $event)">
      <svg viewBox="0 0 100 56" class="w-full" aria-hidden="true">
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--viz-grid)" stroke-width="9" stroke-linecap="round" />
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--viz-accent)" stroke-width="9" stroke-linecap="round" pathLength="100" :stroke-dasharray="`${v} 100`" class="transition-all duration-700" />
        <line v-if="tick" :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" stroke="var(--viz-muted)" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <div class="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span class="dash-num text-[32px] font-semibold leading-none text-ink-gray-9" data-value>{{ card.value == null ? '–' : `${card.value}%` }}</span>
      </div>
    </component>
    <p class="mt-2 text-center text-xs text-ink-gray-5">{{ card.label }}</p>
    <div v-if="card.parts?.length" class="mt-4 grid w-full gap-2" :style="{ gridTemplateColumns: `repeat(${card.parts.length}, minmax(0, 1fr))` }">
      <div v-for="(p, i) in card.parts" :key="p.label" class="rounded-lg bg-surface-gray-1 px-3 py-2">
        <div class="flex items-center gap-1.5 text-[11px] text-ink-gray-6"><span class="size-2 rounded-full" :style="{ background: toneColor(p.tone, i) }" />{{ p.label }}</div>
        <div class="dash-num mt-0.5 text-lg font-semibold text-ink-gray-9">{{ p.value == null ? '–' : `${p.value}%` }}</div>
        <div class="mt-1 h-1 overflow-hidden rounded-full" style="background: var(--viz-grid)"><div class="h-full rounded-full" :style="{ width: `${Math.min(100, p.value || 0)}%`, background: toneColor(p.tone, i) }" /></div>
      </div>
    </div>
  </div>
</template>
