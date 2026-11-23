<script setup>
// Quick filter dropdown (DMS_01 §6.3). Choosing narrows; "All" clears.
// `multiple`: tick several options at once (value is an array); the list keeps rows matching any of them.
// `searchable`: a search box on top (multi-select); it matches the label and the option's `sub` line
// (e.g. an employee's Money Honey ID), so people can be found by name or by ID.
// `range`: a two-handle slider with min/max boxes (e.g. AUM); value is { min, max }, cleared when it spans everything.
import { ref, computed, watch } from 'vue'
import { Dropdown, Button, Popover } from 'frappe-ui'
const props = defineProps({ label: String, options: { type: Array, default: () => [] }, multiple: Boolean, searchable: Boolean, range: { type: Object, default: null } })
const model = defineModel()
const opts = computed(() => props.options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o)))
const items = computed(() => [
  { label: 'All', onClick: () => (model.value = undefined) },
  ...opts.value.map((o) => ({ label: o.sub ? `${o.label} (${o.sub})` : o.label, onClick: () => (model.value = o.value) })),
])
const current = computed(() => opts.value.find((o) => o.value === model.value)?.label)

// multi-select
const picked = computed(() => (Array.isArray(model.value) ? model.value : []))
const isPicked = (v) => picked.value.includes(v)
function toggle(v) {
  const next = isPicked(v) ? picked.value.filter((x) => x !== v) : [...picked.value, v]
  model.value = next.length ? next : undefined
}
const multiText = computed(() => {
  if (!picked.value.length) return props.label
  if (picked.value.length === 1) return `${props.label}: ${opts.value.find((o) => o.value === picked.value[0])?.label}`
  return `${props.label} (${picked.value.length})`
})
const q = ref('')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  return s ? opts.value.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(s)) : opts.value
})
const allShownPicked = computed(() => shown.value.length > 0 && shown.value.every((o) => isPicked(o.value)))
function toggleAllShown() {
  const vals = shown.value.map((o) => o.value)
  const next = allShownPicked.value ? picked.value.filter((v) => !vals.includes(v)) : [...new Set([...picked.value, ...vals])]
  model.value = next.length ? next : undefined
}
const searchBox = ref(null)
function onOpen(o) { if (o) { q.value = ''; setTimeout(() => searchBox.value?.focus(), 30) } }

// range (two-handle slider): value is { min, max }; `range` = { min, max, step, format }
const rMin = computed(() => props.range?.min ?? 0)
const rMax = computed(() => Math.max(props.range?.max ?? 0, rMin.value))
const step = computed(() => props.range?.step || 1)
const fmtR = (n) => (props.range?.format ? props.range.format(n) : String(n))
const lo = ref(0); const hi = ref(0)
function syncRange() { lo.value = model.value?.min ?? rMin.value; hi.value = model.value?.max ?? rMax.value }
watch([() => model.value, rMax], syncRange, { immediate: true })
const rangeOn = computed(() => !!model.value && (model.value.min > rMin.value || model.value.max < rMax.value))
function commit() {
  let a = Math.max(rMin.value, Math.min(Number(lo.value) || 0, rMax.value))
  let b = Math.max(rMin.value, Math.min(Number(hi.value) || 0, rMax.value))
  if (a > b) [a, b] = [b, a]
  lo.value = a; hi.value = b
  model.value = a <= rMin.value && b >= rMax.value ? undefined : { min: a, max: b }
}
function onLo(e) { lo.value = Math.min(Number(e.target.value), hi.value); commit() }
function onHi(e) { hi.value = Math.max(Number(e.target.value), lo.value); commit() }
const pct = (v) => (rMax.value > rMin.value ? ((v - rMin.value) / (rMax.value - rMin.value)) * 100 : 0)
const rangeText = computed(() => (rangeOn.value ? `${props.label}: ${fmtR(model.value.min)} – ${fmtR(model.value.max)}` : props.label))
</script>
<template>
  <Popover v-if="range" @update:open="(o) => o && syncRange()">
    <template #trigger>
      <Button :variant="rangeOn ? 'subtle' : 'outline'" icon-right="lucide-chevron-down">
        <span class="max-w-60 truncate">{{ rangeText }}</span>
      </Button>
    </template>
    <template #default>
      <div class="w-80 p-3">
        <div class="mb-3 flex items-center justify-between text-sm">
          <span class="font-medium text-ink-gray-8">{{ label }}</span>
          <span class="tabular text-ink-gray-6">{{ fmtR(lo) }} – {{ fmtR(hi) }}</span>
        </div>
        <div class="relative h-5">
          <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-gray-3" />
          <div class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-gray-7" :style="{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }" />
          <input class="dms-range" type="range" :min="rMin" :max="rMax" :step="step" :value="lo" aria-label="Minimum" @input="onLo" />
          <input class="dms-range" type="range" :min="rMin" :max="rMax" :step="step" :value="hi" aria-label="Maximum" @input="onHi" />
        </div>
        <div class="mt-1 flex justify-between text-xs tabular text-ink-gray-5"><span>{{ fmtR(rMin) }}</span><span>{{ fmtR(rMax) }}</span></div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <label class="text-xs text-ink-gray-5">Min (₹)
            <input v-model.number="lo" type="number" :min="rMin" :max="rMax" class="mt-0.5 w-full rounded-4 border-outline-gray-2 py-1 text-sm tabular text-ink-gray-8" @change="commit" @keydown.enter="commit" />
          </label>
          <label class="text-xs text-ink-gray-5">Max (₹)
            <input v-model.number="hi" type="number" :min="rMin" :max="rMax" class="mt-0.5 w-full rounded-4 border-outline-gray-2 py-1 text-sm tabular text-ink-gray-8" @change="commit" @keydown.enter="commit" />
          </label>
        </div>
        <div class="mt-3 flex justify-end border-t pt-2">
          <Button variant="ghost" size="sm" label="Clear" class="!text-ink-gray-5" :disabled="!rangeOn" @click="model = undefined" />
        </div>
      </div>
    </template>
  </Popover>
  <Popover v-else-if="multiple" @update:open="onOpen">
    <template #trigger>
      <Button :variant="picked.length ? 'subtle' : 'outline'" icon-right="lucide-chevron-down">
        <span class="max-w-52 truncate">{{ multiText }}</span>
      </Button>
    </template>
    <template #default>
      <div class="min-w-60 p-1">
        <div v-if="searchable" class="mb-1 px-1 pt-1">
          <div class="flex items-center gap-1.5 rounded-4 bg-surface-gray-2 px-2">
            <span class="lucide-search size-3.5 shrink-0 text-ink-gray-5" />
            <input ref="searchBox" v-model="q" :placeholder="options.some((o) => o.sub) ? 'Search name or ID' : 'Search'" class="w-full border-0 bg-transparent px-0 py-1.5 text-sm placeholder:text-ink-gray-4 focus:ring-0" @keydown.stop />
          </div>
        </div>
        <div class="dms-scroll max-h-72 overflow-y-auto">
          <label v-if="searchable && q && shown.length > 1" class="flex cursor-pointer items-center gap-2 rounded-4 px-2 py-1.5 text-sm text-ink-gray-6 hover:bg-surface-gray-2">
            <input type="checkbox" class="rounded-[3px] border-outline-gray-3 text-ink-gray-9 focus:ring-0" :checked="allShownPicked" @change="toggleAllShown" />
            Select all {{ shown.length }} shown
          </label>
          <label v-for="o in shown" :key="o.value" class="flex cursor-pointer items-center gap-2 rounded-4 px-2 py-1.5 text-base text-ink-gray-8 hover:bg-surface-gray-2">
            <input type="checkbox" class="rounded-[3px] border-outline-gray-3 text-ink-gray-9 focus:ring-0" :checked="isPicked(o.value)" @change="toggle(o.value)" />
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="truncate">{{ o.label }}</span>
              <span v-if="o.sub" class="text-xs tabular text-ink-gray-5">{{ o.sub }}</span>
            </span>
          </label>
          <div v-if="!shown.length" class="px-2 py-3 text-center text-sm text-ink-gray-5">No match</div>
        </div>
        <div class="mt-1 flex items-center justify-between border-t px-1 pt-1">
          <Button variant="ghost" size="sm" label="Clear" class="!text-ink-gray-5" :disabled="!picked.length" @click="model = undefined" />
          <span v-if="picked.length" class="pr-1 text-xs text-ink-gray-5">{{ picked.length }} selected</span>
        </div>
      </div>
    </template>
  </Popover>
  <Dropdown v-else :options="items">
    <Button :variant="current ? 'subtle' : 'outline'" icon-right="lucide-chevron-down">
      <span class="max-w-44 truncate">{{ current ? `${label}: ${current}` : label }}</span>
    </Button>
  </Dropdown>
</template>
<style scoped>
/* two stacked range inputs = one slider with two handles; only the thumbs take the mouse */
.dms-range { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; background: transparent; pointer-events: none; -webkit-appearance: none; appearance: none; }
.dms-range:focus-visible { outline: none; }
.dms-range::-webkit-slider-runnable-track { background: transparent; height: 100%; }
.dms-range::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 16px; height: 16px; margin-top: 2px; border-radius: 9999px; background: #fff; border: 2px solid #525252; cursor: grab; box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
.dms-range::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 9999px; background: #fff; border: 2px solid #525252; cursor: grab; }
.dms-range:active::-webkit-slider-thumb { cursor: grabbing; }
</style>
