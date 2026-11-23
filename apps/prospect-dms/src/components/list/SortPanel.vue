<script setup>
// List Sort (port of Frappe CRM components/SortBy.vue). No sort: a "Sort" button that opens a searchable
// field list. One sort: direction toggle + field button. Several: "Sort" with a count badge. The panel lists
// one row per sort (drag handle, direction, searchable field picker, ×), then "+ Add Sort" and "Clear Sort".
import { ref, computed } from 'vue'
import { Button, Popover, Combobox } from 'frappe-ui'

const props = defineProps({ fields: { type: Array, default: () => [] } }) // [{ key, label }]
const sort = defineModel({ default: () => [] }) // [{ key, dir }] or legacy { key, dir }
const sorts = computed(() => (Array.isArray(sort.value) ? sort.value : sort.value?.key ? [sort.value] : []))
const set = (list) => { sort.value = list }
const all = computed(() => props.fields.map((f) => ({ label: f.label, value: f.key })))
const unused = computed(() => all.value.filter((o) => !sorts.value.some((s) => s.key === o.value)))
const labelOf = (k) => props.fields.find((f) => f.key === k)?.label || k
const dirIcon = (d) => (d === 'desc' ? 'lucide-arrow-up-z-a' : 'lucide-arrow-down-a-z')

function add(o) { if (o?.value) set([...sorts.value, { key: o.value, dir: 'asc' }]) }
function change(i, o) { if (o?.value) set(sorts.value.map((s, j) => (j === i ? { ...s, key: o.value } : s))) }
function toggle(i) { set(sorts.value.map((s, j) => (j === i ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : s))) }
function remove(i) { set(sorts.value.filter((_, j) => j !== i)) }
function clear(close) { set([]); close?.() }
const dragFrom = ref(null)
function dropAt(i) {
  if (dragFrom.value === null || dragFrom.value === i) return
  const l = [...sorts.value]; const [m] = l.splice(dragFrom.value, 1); l.splice(i, 0, m)
  dragFrom.value = null; set(l)
}
</script>
<template>
  <Combobox v-if="!sorts.length" :options="all" :model-value="null" placeholder="Search" @update:selected-option="add">
    <template #trigger="{ open, setOpen }">
      <Button label="Sort" icon-left="lucide-arrow-up-down" @click="setOpen(!open)" />
    </template>
  </Combobox>
  <Popover v-else side="bottom" align="end">
    <template #trigger="{ open }">
      <!-- one stable root so the panel stays anchored when the trigger switches look -->
      <div class="flex items-center" data-testid="sort-trigger">
        <Button v-if="sorts.length > 1" label="Sort" icon-left="lucide-arrow-up-down">
          <template #suffix>
            <span class="flex size-5 items-center justify-center rounded-[5px] bg-surface-base pt-px text-xs font-medium text-ink-gray-8 shadow-sm">{{ sorts.length }}</span>
          </template>
        </Button>
        <template v-else>
          <Button class="rounded-r-none border-r border-outline-gray-2" :icon="dirIcon(sorts[0].dir)" :aria-label="sorts[0].dir === 'asc' ? 'Ascending' : 'Descending'" @click.stop="toggle(0)" />
          <Button class="shrink-0 rounded-l-none" :label="labelOf(sorts[0].key)" :icon-right="open ? 'lucide-chevron-up' : 'lucide-chevron-down'" />
        </template>
      </div>
    </template>
    <template #default="{ close }">
      <div class="min-w-60 p-2">
        <div class="mb-3 flex flex-col gap-2">
          <div v-for="(s, i) in sorts" :key="s.key" class="flex items-center gap-1" draggable="true"
            @dragstart="dragFrom = i" @dragover.prevent @drop.prevent="dropAt(i)">
            <div class="flex size-7 cursor-grab items-center justify-center text-ink-gray-5" title="Drag to reorder"><span class="lucide-grip size-4" /></div>
            <div class="flex flex-1">
              <Button size="md" class="rounded-r-none border-r border-outline-gray-2" :icon="dirIcon(s.dir)" :aria-label="s.dir === 'asc' ? 'Ascending' : 'Descending'" @click="toggle(i)" />
              <div class="w-44 [&_button]:w-full">
              <Combobox :model-value="s.key" :options="all.filter((o) => o.value === s.key || unused.includes(o))" placeholder="Search" @update:selected-option="(o) => change(i, o)">
                <template #trigger="{ open, setOpen, displayValue }">
                  <Button size="md" class="flex w-full items-center !justify-between rounded-l-none !text-ink-gray-5" :label="displayValue || labelOf(s.key)" :icon-right="open ? 'lucide-chevron-up' : 'lucide-chevron-down'" @click="setOpen(!open)" />
                </template>
              </Combobox>
              </div>
            </div>
            <Button variant="ghost" icon="lucide-x" aria-label="Remove sort" @click="remove(i)" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <Combobox :options="unused" :model-value="null" placeholder="Search" @update:selected-option="add">
            <template #trigger="{ open, setOpen }">
              <Button class="!text-ink-gray-5" variant="ghost" label="Add Sort" icon-left="lucide-plus" :disabled="!unused.length" @click="setOpen(!open)" />
            </template>
          </Combobox>
          <Button class="!text-ink-gray-5" variant="ghost" label="Clear Sort" @click="clear(close)" />
        </div>
      </div>
    </template>
  </Popover>
</template>
