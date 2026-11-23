<script setup>
// List Filter (port of Frappe CRM components/Filter.vue): "Filter" button with a count badge and an ×
// that clears all; the panel lists one row per filter - Where/And, field, operator, value, × - then
// "+ Add Filter" (searchable field list) and "Clear All Filters". Filters apply as you change them.
// Operators and value controls follow the field type (services/filterOps.js).
import { computed, inject } from 'vue'
import { Button, Popover, Combobox, MultiSelect, TextInput, DatePicker, DateRangePicker } from 'frappe-ui'
import { describeFields, OPERATORS, defaultOperator, defaultValue, IS_OPTIONS, TIMESPANS, placeholder } from '@/services/filterOps'

const props = defineProps({ fields: { type: Array, default: () => [] } }) // [{ key, label }]
const filters = defineModel({ default: () => [] }) // [{ field, op, value }]
const rows = inject('dms-list-rows', null)
const typed = computed(() => describeFields(props.fields, rows?.value || []))
const fieldOf = (key) => typed.value.find((f) => f.key === key) || { key, label: key, type: 'text' }
const fieldOptions = computed(() => typed.value.map((f) => ({ label: f.label, value: f.key })))
const available = computed(() => fieldOptions.value.filter((o) => !filters.value.some((f) => f.field === o.value)))
const opsFor = (key) => OPERATORS[fieldOf(key).type] || OPERATORS.text
const selectOptions = (key) => (fieldOf(key).options || []).map((o) => ({ label: o, value: o }))

const fresh = (key) => { const fd = fieldOf(key); const op = defaultOperator(fd.type); return { field: key, op, value: defaultValue(fd, op) } }
const set = (list) => { filters.value = list }
function addFilter(opt) { if (opt?.value) set([...filters.value, fresh(opt.value)]) }
function changeField(i, opt) { if (opt?.value) set(filters.value.map((f, j) => (j === i ? fresh(opt.value) : f))) }
function changeOp(i, op) { set(filters.value.map((f, j) => (j === i ? { ...f, op, value: defaultValue(fieldOf(f.field), op) } : f))) }
function changeValue(i, value) { set(filters.value.map((f, j) => (j === i ? { ...f, value: value?.target ? value.target.value : value } : f))) }
function remove(i) { set(filters.value.filter((_, j) => j !== i)) }
function clearAll(close) { set([]); close?.() }

// which value control to show
function control(f) {
  const t = fieldOf(f.field).type
  if (f.op === 'is') return 'is'
  if (f.op === 'timespan') return 'timespan'
  if (t === 'date') return f.op === 'between' ? 'daterange' : 'date'
  if (t === 'select') return f.op === 'in' || f.op === 'not in' ? 'multi' : 'select'
  if (t === 'number' && !['like', 'not like', 'in', 'not in'].includes(f.op)) return 'number'
  return 'text'
}
</script>
<template>
  <Popover side="bottom" align="end">
    <template #trigger="{ close }">
      <div class="flex items-center">
        <Button label="Filter" icon-left="lucide-list-filter" :class="filters.length ? 'rounded-r-none' : ''">
          <template v-if="filters.length" #suffix>
            <span class="flex size-5 items-center justify-center rounded-[5px] bg-surface-base pt-px text-xs font-medium text-ink-gray-8 shadow-sm">{{ filters.length }}</span>
          </template>
        </Button>
        <Button v-if="filters.length" tooltip="Clear All Filters" class="rounded-l-none border-l border-outline-gray-2" icon="lucide-x" aria-label="Clear All Filters" @click.stop="clearAll(close)" />
      </div>
    </template>
    <template #default="{ close }">
      <div class="min-w-72 p-2 sm:min-w-[460px]">
        <template v-if="filters.length">
          <div v-for="(f, i) in filters" :key="i" class="mb-3 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="w-12 pl-2 text-end text-base text-ink-gray-5">{{ i === 0 ? 'Where' : 'And' }}</div>
              <div class="w-[200px] [&_[data-slot=trigger]]:w-full">
                <Combobox trigger="button" :model-value="f.field" :options="fieldOptions" placeholder="Field" @update:selected-option="(o) => changeField(i, o)" />
              </div>
              <div class="w-[120px] [&_[data-slot=trigger]]:w-full">
                <Combobox trigger="button" :model-value="f.op" :options="opsFor(f.field)" placeholder="Equals" @update:model-value="(op) => changeOp(i, op)" />
              </div>
              <div class="w-[170px] [&_[data-slot=trigger]]:w-full [&_button]:w-full">
                <Combobox v-if="control(f) === 'is'" trigger="button" :model-value="f.value" :options="IS_OPTIONS" @update:model-value="(v) => changeValue(i, v)" />
                <Combobox v-else-if="control(f) === 'timespan'" trigger="button" :model-value="f.value" :options="TIMESPANS" @update:model-value="(v) => changeValue(i, v)" />
                <Combobox v-else-if="control(f) === 'select'" trigger="button" :model-value="f.value" :options="selectOptions(f.field)" placeholder="Select an Option" @update:model-value="(v) => changeValue(i, v)" />
                <MultiSelect v-else-if="control(f) === 'multi'" :model-value="f.value" :options="selectOptions(f.field)" placeholder="Select values" @update:model-value="(v) => changeValue(i, v)" />
                <DateRangePicker v-else-if="control(f) === 'daterange'" :model-value="f.value?.length ? f.value : undefined" placeholder="Select dates" @update:model-value="(v) => changeValue(i, v || [])" />
                <DatePicker v-else-if="control(f) === 'date'" :model-value="f.value || undefined" placeholder="Select date" @update:model-value="(v) => changeValue(i, v || '')" />
                <TextInput v-else :type="control(f) === 'number' ? 'number' : 'text'" :model-value="f.value" :placeholder="placeholder(fieldOf(f.field), f.op)" :debounce="250" @update:model-value="(v) => changeValue(i, v)" />
              </div>
            </div>
            <Button variant="ghost" icon="lucide-x" aria-label="Remove filter" @click="remove(i)" />
          </div>
        </template>
        <div v-else class="mb-3 flex h-7 items-center px-3 text-sm text-ink-gray-5">Empty - Choose a field to filter by</div>
        <div class="flex items-center justify-between gap-2">
          <Combobox :model-value="null" :options="available" placeholder="Search" @update:selected-option="addFilter">
            <template #trigger="{ open, setOpen }">
              <Button class="!text-ink-gray-5" variant="ghost" label="Add Filter" icon-left="lucide-plus" :disabled="!available.length" @click="setOpen(!open)" />
            </template>
          </Combobox>
          <Button v-if="filters.length" class="!text-ink-gray-5" variant="ghost" label="Clear All Filters" @click="clearAll(close)" />
        </div>
      </div>
    </template>
  </Popover>
</template>
