<script setup>
// "Focus today": the things to act on now. Design review 27 Nov 2026: a row with something to do is a clear line - a
// tinted icon (amber when time is running out), what it is, a hint, which website it is in (or each website's count
// when both), the number and a chevron - and opens exactly those records. Rows with nothing to do fold into one quiet
// "All clear" line at the bottom, so the list shows only what needs attention.
import { computed } from 'vue'
const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['open'])
const clickable = (it) => !!(it.drill && it.drill.some((d) => d.count && d.to))
const todo = computed(() => props.items.filter((it) => it.value))
const clear = computed(() => props.items.filter((it) => !it.value))
const DOT = { blue: 'var(--viz-p)', green: 'var(--viz-i)' }
const chip = (it) => (it.tone === 'amber' ? { background: 'var(--viz-warn-wash)', color: 'var(--viz-warn)' } : it.tone === 'red' ? { background: 'var(--viz-crit-wash)', color: 'var(--viz-crit)' } : { background: 'var(--viz-accent-wash)', color: 'var(--viz-accent)' })
</script>
<template>
  <div>
    <ul class="space-y-1.5">
      <li v-for="it in todo" :key="it.key">
        <component :is="clickable(it) ? 'button' : 'div'" type="button" class="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors"
          :class="clickable(it) && 'hover:border-outline-gray-2 hover:bg-surface-gray-1'" :data-testid="`dash-action-${it.key}`" :data-count="clickable(it) ? it.listCount ?? it.value : undefined" @click="clickable(it) && emit('open', it.drill, $event)">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" :style="chip(it)"><span :class="it.icon" class="size-[18px]" /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-ink-gray-9">{{ it.label }}</span>
            <span class="block truncate text-xs text-ink-gray-5">{{ it.hint }}</span>
            <span v-if="it.parts || it.site" class="mt-1 flex items-center gap-3 text-[10.5px] text-ink-gray-6">
              <template v-if="it.parts"><span v-for="p in it.parts" :key="p.label" class="flex items-center gap-1"><span class="size-1.5 rounded-full" :style="{ background: DOT[p.tone] }" />{{ p.label }} <b class="font-semibold tabular-nums">{{ p.value }}</b></span></template>
              <span v-else class="flex items-center gap-1"><span class="size-1.5 rounded-full" :style="{ background: it.site === 'I' ? DOT.green : DOT.blue }" />{{ it.site === 'I' ? 'Investor DMS' : 'Prospect DMS' }}</span>
            </span>
          </span>
          <span class="dash-num shrink-0 text-xl font-semibold" :class="it.tone === 'amber' ? 'text-ink-amber-7' : it.tone === 'red' ? 'text-ink-red-6' : 'text-ink-gray-9'">{{ it.value.toLocaleString('en-IN') }}</span>
          <span class="lucide-chevron-right size-4 shrink-0 transition-transform group-hover:translate-x-0.5" :class="clickable(it) ? 'text-ink-gray-4' : 'text-transparent'" />
        </component>
      </li>
    </ul>
    <div v-if="!todo.length" class="flex flex-col items-center gap-2 py-8 text-center">
      <span class="flex size-11 items-center justify-center rounded-full" style="background: var(--viz-accent-wash); color: var(--viz-accent)"><span class="lucide-party-popper size-5" /></span>
      <p class="text-sm font-medium text-ink-gray-8">Nothing waiting today</p>
    </div>
    <!-- nothing to do: one quiet line -->
    <div v-if="clear.length" class="mt-3 border-t pt-3">
      <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-gray-6"><span class="lucide-circle-check size-3.5 text-ink-green-7" />All clear</p>
      <div class="flex flex-wrap gap-1.5">
        <span v-for="it in clear" :key="it.key" class="inline-flex items-center gap-1 rounded-full bg-surface-gray-1 px-2 py-0.5 text-[11px] text-ink-gray-6" :title="it.hint" :data-testid="`dash-action-${it.key}`"><span :class="it.icon" class="size-3" />{{ it.label }}</span>
      </div>
    </div>
  </div>
</template>
