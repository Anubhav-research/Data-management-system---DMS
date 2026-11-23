<script setup>
// Standard list toolbar (GEN-005, DMS_01 §6): search + quick filters left; refresh, Filter, Sort, ⋯ right.
// Filter and Sort are ports of Frappe CRM Filter.vue / SortBy.vue (components/list/FilterPanel, SortPanel).
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Button, Dropdown, TextInput } from 'frappe-ui'
import QuickSelect from './QuickSelect.vue'
import FilterPanel from './list/FilterPanel.vue'
import SortPanel from './list/SortPanel.vue'

const props = defineProps({
  placeholder: { type: String, default: 'Search' },
  quick: { type: Array, default: () => [] }, // [{ key, label, options }]
  filterFields: { type: Array, default: () => [] }, // [{ key, label }]
  sortFields: { type: Array, default: () => [] }, // [{ key, label }]
  noSearch: Boolean,
  more: { type: Array, default: () => [] }, // ⋯ menu options, shown after Sort as in Frappe CRM
})
const search = defineModel('search', { default: '' })
const quickValues = defineModel('quickValues', { default: () => ({}) })
const advanced = defineModel('advanced', { default: () => [] }) // [{ field, op, value }]
// sort: [{ key, dir }] (several), or the legacy { key, dir } object
const sort = defineModel('sort', { default: () => [] })
const emit = defineEmits(['refresh'])

const spinning = ref(false)
function refresh() { spinning.value = true; emit('refresh'); setTimeout(() => (spinning.value = false), 500) }
function setQuick(k, v) { quickValues.value = { ...quickValues.value, [k]: v } }

// single-row toolbar: when the filters are wider than the space, show arrows to scroll to the hidden ones
const strip = ref(null)
const canLeft = ref(false); const canRight = ref(false)
function measure() {
  const el = strip.value; if (!el) return
  canLeft.value = el.scrollLeft > 2
  canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
function nudge(dir) { strip.value?.scrollBy({ left: dir * Math.max(160, strip.value.clientWidth * 0.6), behavior: 'smooth' }) }
let ro
onMounted(() => { ro = new ResizeObserver(measure); if (strip.value) { ro.observe(strip.value); [...strip.value.children].forEach((c) => ro.observe(c)) } nextTick(measure) })
onBeforeUnmount(() => ro?.disconnect())
watch(quickValues, () => nextTick(measure), { deep: true })
</script>
<template>
  <!-- one row always: filters on the left (scroll sideways if they ever outgrow the screen), actions on the right -->
  <div class="flex items-center gap-2 border-b px-5 py-2.5">
    <div class="relative flex min-w-0 flex-1 items-center">
    <div ref="strip" class="dms-toolbar-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [&>*]:shrink-0" @scroll="measure">
      <div v-if="!noSearch" class="w-40">
        <TextInput v-model="search" :placeholder="placeholder" :debounce="150">
          <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
        </TextInput>
      </div>
      <QuickSelect v-for="q in quick" :key="q.key" :model-value="quickValues[q.key]" :label="q.label" :options="q.options" :multiple="q.multiple" :searchable="q.searchable" :range="q.range" @update:model-value="(v) => setQuick(q.key, v)" />
      <slot name="extra" />
    </div>
    <!-- more filters hidden to the side: fade + arrow to scroll to them -->
    <div v-if="canLeft" class="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center bg-gradient-to-r from-surface-base via-surface-base/90 to-transparent">
      <Button size="sm" variant="ghost" icon="lucide-chevron-left" aria-label="More filters" class="pointer-events-auto" @click="nudge(-1)" />
    </div>
    <div v-if="canRight" class="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-surface-base via-surface-base/90 to-transparent">
      <Button size="sm" variant="ghost" icon="lucide-chevron-right" aria-label="More filters" class="pointer-events-auto" @click="nudge(1)" />
    </div>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button icon="lucide-refresh-cw" tooltip="Refresh" :loading="spinning" @click="refresh" />
      <FilterPanel v-if="filterFields.length" v-model="advanced" :fields="filterFields" />
      <SortPanel v-if="sortFields.length" v-model="sort" :fields="sortFields" />
      <slot name="right" />
      <Dropdown v-if="more.length" :options="more" align="end">
        <Button icon="lucide-ellipsis" aria-label="More actions" />
      </Dropdown>
    </div>
  </div>
</template>
