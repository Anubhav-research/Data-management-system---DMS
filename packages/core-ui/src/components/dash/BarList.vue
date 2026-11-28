<script setup>
// Ranked horizontal bars, one row per group (an outcome, a product, a template, a lead source). A row can be split
// into parts (e.g. connected / not connected); every count and part opens its records. A note on the right (a share,
// an amount) can be coloured by the rules. Design review 27 Nov 2026: the label above a thin rounded bar on a light
// track, the number at the end - one series takes the accent (or the item's own tone), never a ramp by size.
import { computed } from 'vue'
import { toneColor } from '../../dash/tones.js'
const props = defineProps({ items: { type: Array, default: () => [] }, empty: String, legend: { type: Array, default: () => [] }, tone: String })
const emit = defineEmits(['open'])
const TONE = { green: 'text-ink-green-7', amber: 'text-ink-amber-7', red: 'text-ink-red-6' }
const totalOf = (it) => (it.segments ? it.segments.reduce((t, s) => t + (s.value || 0), 0) : typeof it.value === 'number' ? it.value : 0)
const max = computed(() => Math.max(1, ...props.items.map(totalOf)))
const clickable = (x) => !!(x?.drill && x.drill.some((d) => d.count && d.to))
const open = (x, e) => clickable(x) && emit('open', x.drill, e)
</script>
<template>
  <p v-if="!items.length" class="flex flex-col items-center gap-1 py-6 text-center text-sm text-ink-gray-5"><span class="lucide-circle-dashed size-6 text-ink-gray-4" />{{ empty || 'Nothing in this period.' }}</p>
  <div v-else>
    <div v-if="legend.length" class="mb-3 flex flex-wrap gap-3 text-xs text-ink-gray-6">
      <span v-for="(l, i) in legend" :key="l.label" class="flex items-center gap-1.5"><span class="size-2.5 rounded-[3px]" :style="{ background: toneColor(l.tone, i) }" />{{ l.label }}</span>
    </div>
    <div class="space-y-3">
      <div v-for="(it, i) in items" :key="it.key ?? i" class="text-sm">
        <div class="mb-1 flex items-baseline justify-between gap-3">
          <span class="min-w-0 truncate text-ink-gray-7" :title="it.label">{{ it.label }}<span v-if="it.code" class="ml-1.5 text-xs text-ink-gray-5">{{ it.code }}</span></span>
          <span class="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
            <button v-if="clickable(it)" type="button" class="rounded px-1 text-right font-semibold tabular-nums text-ink-gray-9 hover:bg-surface-gray-2" :data-count="it.listCount ?? it.value" @click="open(it, $event)">{{ it.display ?? totalOf(it).toLocaleString('en-IN') }}</button>
            <span v-else class="text-right font-semibold tabular-nums text-ink-gray-9">{{ it.display ?? totalOf(it).toLocaleString('en-IN') }}</span>
            <span v-if="it.note != null" class="min-w-10 text-right text-xs tabular-nums" :class="TONE[it.noteTone] || 'text-ink-gray-5'">{{ it.note }}</span>
          </span>
        </div>
        <div class="flex h-2 gap-[2px] overflow-hidden rounded-full" style="background: var(--viz-grid)">
          <template v-if="it.segments">
            <component :is="clickable(s) ? 'button' : 'div'" v-for="(s, si) in it.segments.filter((x) => x.value)" :key="s.key" type="button" class="h-full first:rounded-l-full last:rounded-r-full hover:brightness-110"
              :style="{ width: `${((s.value || 0) / max) * 100}%`, background: toneColor(s.tone || 'dark', si) }" :title="`${it.label}: ${s.label} ${s.value}`" :data-count="clickable(s) ? s.listCount ?? s.value : undefined" @click="open(s, $event)" />
          </template>
          <div v-else class="h-full rounded-full" :style="{ width: `${Math.max(1.5, (totalOf(it) / max) * 100)}%`, background: toneColor(it.tone || tone || 'dark', i) }" />
        </div>
      </div>
    </div>
  </div>
</template>
