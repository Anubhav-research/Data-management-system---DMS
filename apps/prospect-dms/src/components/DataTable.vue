<script setup>
// Table used by every list (DMS_01 §6). Checkbox column when selectable (Admin bulk, BULK-001),
// footer with page sizes 20/50/100 and "x of y" count. Cells can be customised with #cell-<key> slots.
import { computed, ref, watch } from 'vue'
import { Checkbox, Button, Dropdown } from 'frappe-ui'

const props = defineProps({
  columns: { type: Array, required: true }, // [{ key, label, width?, class?, align? }]
  rows: { type: Array, required: true },
  rowKey: { type: String, default: 'id' },
  selectable: Boolean,
  pageSizes: { type: Array, default: () => [20, 50, 100] },
  totalLabel: String, // override footer text e.g. "Total rows: 15240"
  emptyText: { type: String, default: 'No records found' },
  emptyHint: { type: String, default: '' },
  loading: Boolean,
  rowClass: Function,
  uppercase: Boolean,
  bulkOptions: { type: Array, default: () => [] }, // Admin bulk "…" menu (BULK-001)
})
const emit = defineEmits(['row-click'])
const selection = defineModel('selection', { default: () => [] })
const pageSize = ref(props.pageSizes[0])
const page = ref(1)
watch(() => props.rows.length, () => { page.value = 1 })
const pages = computed(() => Math.max(1, Math.ceil(props.rows.length / pageSize.value)))
const visible = computed(() => props.rows.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const allChecked = computed(() => visible.value.length > 0 && visible.value.every((r) => selection.value.includes(r[props.rowKey])))
function toggleAll() {
  const ids = visible.value.map((r) => r[props.rowKey])
  selection.value = allChecked.value ? selection.value.filter((x) => !ids.includes(x)) : [...new Set([...selection.value, ...ids])]
}
function toggle(id) { selection.value = selection.value.includes(id) ? selection.value.filter((x) => x !== id) : [...selection.value, id] }
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((r) => selection.value.includes(r[props.rowKey])))
const from = computed(() => (props.rows.length ? (page.value - 1) * pageSize.value + 1 : 0))
const to = computed(() => Math.min(page.value * pageSize.value, props.rows.length))
</script>
<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div class="dms-scroll min-h-0 flex-1 overflow-auto">
      <table class="w-full min-w-max border-separate border-spacing-0 text-base">
        <thead class="sticky top-0 z-10 bg-surface-gray-2">
          <tr>
            <th v-if="selectable" class="w-10 border-b px-3 py-2 text-left">
              <Checkbox :model-value="allChecked" @update:model-value="toggleAll" />
            </th>
            <th v-for="c in columns" :key="c.key" :style="c.width ? { width: c.width, minWidth: c.width } : {}"
              class="whitespace-nowrap border-b px-3 py-2.5 text-left text-sm font-medium text-ink-gray-6" :class="[uppercase && 'uppercase tracking-wide text-xs', c.align === 'right' && 'text-right']">
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody v-if="!loading">
          <tr v-for="row in visible" :key="row[rowKey]" class="group cursor-pointer hover:bg-surface-gray-1" :class="rowClass?.(row)" @click="emit('row-click', row)">
            <td v-if="selectable" class="border-b px-3 py-2.5" @click.stop>
              <Checkbox :model-value="selection.includes(row[rowKey])" @update:model-value="toggle(row[rowKey])" />
            </td>
            <td v-for="c in columns" :key="c.key" class="border-b px-3 py-2.5 align-middle text-ink-gray-8" :class="[c.class, c.align === 'right' && 'text-right']">
              <slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]">{{ row[c.key] ?? '-' }}</slot>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="i in 8" :key="i"><td :colspan="columns.length + (selectable ? 1 : 0)" class="border-b px-3 py-3"><div class="h-4 w-full animate-pulse rounded-4 bg-surface-gray-2" /></td></tr>
        </tbody>
      </table>
      <div v-if="!loading && !rows.length" class="flex flex-col items-center justify-center gap-2 py-20 text-center">
        <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-inbox size-6" /></div>
        <p class="text-base text-ink-gray-7">{{ emptyText }}</p>
        <p v-if="emptyHint" class="text-sm text-ink-gray-5">{{ emptyHint }}</p>
      </div>
    </div>
    <!-- Bulk bar (BULK-001), as Frappe CRM ListSelectBanner: ☑ "N rows selected" · "…" menu | Select all · × -->
    <transition enter-active-class="duration-300 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100"
      leave-active-class="duration-300 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="selectable && selection.length" class="absolute inset-x-0 bottom-16 z-20 mx-auto w-max max-w-[calc(100%-2rem)] text-base" data-testid="bulk-bar">
        <div class="flex items-center gap-3 rounded-6 bg-surface-elevation-2 px-4 py-2 shadow-2xl sm:min-w-[596px]">
          <div class="flex flex-1 items-center justify-between border-r border-outline-gray-2 text-ink-gray-9">
            <div class="flex items-center gap-3">
              <Checkbox :model-value="true" disabled class="text-ink-gray-9" />
              <span>{{ selection.length }} {{ selection.length === 1 ? 'row' : 'rows' }} selected</span>
            </div>
            <div class="me-3 flex items-center gap-2">
              <slot name="bulk" :selection="selection" />
              <Dropdown v-if="bulkOptions.length" :options="bulkOptions" side="top" align="end">
                <Button variant="ghost" icon="lucide-ellipsis" aria-label="Bulk actions" />
              </Dropdown>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <Button variant="ghost" class="text-ink-gray-7" label="Select all" :disabled="allSelected" :class="allSelected && 'cursor-not-allowed'" @click="selection = rows.map((r) => r[rowKey])" />
            <Button variant="ghost" icon="lucide-x" aria-label="Clear selection" @click="selection = []" />
          </div>
        </div>
      </div>
    </transition>
    <footer class="flex h-12 shrink-0 items-center justify-between border-t px-5 text-sm text-ink-gray-6">
      <div class="flex items-center gap-1">
        <template v-if="pageSizes.length > 1">
          <button v-for="s in pageSizes" :key="s" class="rounded-4 px-2 py-1" :class="pageSize === s ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'hover:bg-surface-gray-2'" @click="pageSize = s; page = 1">{{ s }}</button>
        </template>
        <slot name="footer-left" />
      </div>
      <div class="flex items-center gap-3">
        <span>{{ totalLabel || (rows.length ? `${from}–${to} of ${rows.length}` : '0 of 0') }}</span>
        <template v-if="pages > 1">
          <Button size="sm" icon="lucide-chevron-left" :disabled="page === 1" @click="page--" />
          <Button size="sm" icon="lucide-chevron-right" :disabled="page === pages" @click="page++" />
        </template>
      </div>
    </footer>
  </div>
</template>
