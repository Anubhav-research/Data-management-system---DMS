<script setup>
// Date quick filter, laid out like the Salesforce report date filter:
//   Range [All time ▾]   then   From [date]  To [date]   then   Cancel / Apply.
// Choosing a range fills From and To; typing a date switches Range to "Custom". To may be left empty
// (= the From day only). Nothing changes until Apply.
// Value: { from, to, label } in ms (from = start of day, to = end of day), or undefined for "All time".
import { ref, computed } from 'vue'
import { Button, Popover } from 'frappe-ui'

// `presets`: the list's own ranges (key: [label, () => [from, to]]) instead of the standard ones; `future`: dates after today allowed (e.g. Upcoming Event)
const props = defineProps({ label: { type: String, default: 'Date' }, presets: { type: Object, default: null }, future: Boolean })
const model = defineModel()
const open = ref(false)

const DAY = 86400000
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
const eod = (d) => sod(d) + DAY - 1
const STANDARD = {
  today: ['Today', () => [sod(Date.now()), eod(Date.now())]],
  yesterday: ['Yesterday', () => [sod(Date.now() - DAY), eod(Date.now() - DAY)]],
  last7: ['Last 7 days', () => [sod(Date.now() - 6 * DAY), eod(Date.now())]],
  last30: ['Last 30 days', () => [sod(Date.now() - 29 * DAY), eod(Date.now())]],
  last90: ['Last 90 days', () => [sod(Date.now() - 89 * DAY), eod(Date.now())]],
  thisMonth: ['This month', () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), eod(Date.now())] }],
  lastMonth: ['Last month', () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1] }],
  thisYear: ['This year', () => [new Date(new Date().getFullYear(), 0, 1).getTime(), eod(Date.now())]],
}
const RANGES = computed(() => props.presets || STANDARD)

const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
const today = iso(Date.now())
const fmt = (ms, year = true) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) })

// draft state while the panel is open
const range = ref('all'); const fromVal = ref(''); const toVal = ref('')
function onOpen(o) {
  open.value = o
  if (!o) return
  const v = model.value
  range.value = v?.range || 'all'
  fromVal.value = v ? iso(v.from) : ''
  toVal.value = v ? iso(v.to) : ''
}
function onRange() {
  if (range.value === 'all') { fromVal.value = ''; toVal.value = '' }
  else if (RANGES.value[range.value]) { const [a, b] = RANGES.value[range.value][1](); fromVal.value = iso(a); toVal.value = iso(b) }
}
function onDate() { range.value = fromVal.value || toVal.value ? 'custom' : 'all' }
const bad = computed(() => !!fromVal.value && !!toVal.value && fromVal.value > toVal.value)
const needFrom = computed(() => range.value === 'custom' && !fromVal.value)
function apply() {
  if (bad.value || needFrom.value) return
  if (range.value === 'all') model.value = undefined
  else if (RANGES.value[range.value]) { const [a, b] = RANGES.value[range.value][1](); model.value = { from: a, to: b, label: RANGES.value[range.value][0], range: range.value } }
  else {
    const a = parse(fromVal.value); const b = toVal.value ? parse(toVal.value) : a
    const label = a === b ? fmt(a) : `${fmt(a, new Date(a).getFullYear() !== new Date(b).getFullYear())} – ${fmt(b)}`
    model.value = { from: a, to: eod(b), label, range: 'custom' }
  }
  open.value = false
}
function clearAll() { model.value = undefined; open.value = false }
const buttonText = computed(() => (model.value ? `${props.label}: ${model.value.label}` : props.label))
</script>
<template>
  <Popover :open="open" placement="bottom-start" @update:open="onOpen">
    <template #trigger>
      <Button :variant="model ? 'subtle' : 'outline'" icon-left="lucide-calendar" icon-right="lucide-chevron-down">
        <span class="max-w-56 truncate">{{ buttonText }}</span>
      </Button>
    </template>
    <template #default>
      <form class="block w-72 p-3" data-testid="date-filter" @submit.prevent="apply">
        <div class="mb-3 text-sm font-medium text-ink-gray-8">{{ label }}</div>

        <label class="block text-xs text-ink-gray-5" for="df-range">Range</label>
        <select id="df-range" v-model="range" class="mt-1 block h-7 w-full rounded border-outline-gray-2 bg-surface-gray-2 py-0 pl-2 pr-7 text-base text-ink-gray-8 focus:border-outline-gray-4 focus:ring-0" @change="onRange">
          <option value="all">All time</option>
          <option v-for="(r, k) in RANGES" :key="k" :value="k">{{ r[0] }}</option>
          <option value="custom">Custom</option>
        </select>

        <div class="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs text-ink-gray-5" for="df-from">From</label>
            <input id="df-from" v-model="fromVal" type="date" :max="future ? toVal || undefined : toVal || today" class="mt-1 block h-7 w-full rounded border-outline-gray-2 bg-surface-gray-2 px-2 py-0 text-sm text-ink-gray-8 focus:border-outline-gray-4 focus:ring-0" @input="onDate" />
          </div>
          <div>
            <label class="block text-xs text-ink-gray-5" for="df-to">To</label>
            <input id="df-to" v-model="toVal" type="date" :min="fromVal" :max="future ? undefined : today" class="mt-1 block h-7 w-full rounded border-outline-gray-2 bg-surface-gray-2 px-2 py-0 text-sm text-ink-gray-8 focus:border-outline-gray-4 focus:ring-0" @input="onDate" />
          </div>
        </div>
        <p v-if="bad" class="mt-2 text-xs text-ink-red-7">From must be on or before To.</p>
        <p v-else-if="needFrom" class="mt-2 text-xs text-ink-gray-5">Pick a From date. Leave To empty for a single day.</p>

        <div class="mt-4 flex items-center justify-between">
          <button type="button" class="text-sm text-ink-gray-5 hover:text-ink-gray-8 disabled:opacity-40" :disabled="!model" @click="clearAll">Clear</button>
          <div class="flex gap-2">
            <Button type="button" label="Cancel" @click="open = false" />
            <Button type="submit" variant="solid" label="Apply" :disabled="bad || needFrom" />
          </div>
        </div>
      </form>
    </template>
  </Popover>
</template>
