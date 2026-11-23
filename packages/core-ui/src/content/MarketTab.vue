<script setup>
// The Market Update tab of Circulars (product owner, 19 Nov 2026): the full width, because the tables are wide.
//   top     - ◀ older | date | newer ▶, Morning / Mid-day / Closing of that day, "Latest" when looking back
//   heading - time of day and "as on" time
//   comment - Admin's line on what moved the market (optional), then a heat map like NSE's (MarketHeatmap)
//   tools   - Today / Returns view, jump to a group (Index, Sectoral, Metals ...), find a row
//   tables  - MarketView, one per table (prices, FII / DII, any other)
import { ref, computed, watch } from 'vue'
import { Button, FormControl, TextInput, Tooltip } from 'frappe-ui'
import MarketView from './MarketView.vue'
import MarketHeatmap from './MarketHeatmap.vue'
import { SESSIONS } from './market.js'
import { fmtDateTime, fmtTimeShort } from '../format.js'

const props = defineProps({ items: { type: Array, default: () => [] }, admin: Boolean, loaded: Boolean })
const emit = defineEmits(['new', 'edit', 'remove'])
const selectedId = defineModel('selectedId', { type: String, default: null })

const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const sel = computed(() => props.items.find((c) => c.id === selectedId.value) || props.items[0] || null)
watch(() => props.items, (l) => { if (l.length && !l.some((c) => c.id === selectedId.value)) selectedId.value = l[0].id }, { immediate: true })
const idx = computed(() => props.items.indexOf(sel.value))
const go = (i) => { const c = props.items[i]; if (c) selectedId.value = c.id }
const m = computed(() => sel.value?.market)
const day = computed(() => (sel.value ? isoDay(sel.value.market.asOf || sel.value.publishedAt) : ''))
const sameDay = computed(() => props.items.filter((c) => isoDay(c.market.asOf || c.publishedAt) === day.value))
const ofSession = (s) => sameDay.value.find((c) => c.market.session === s) // newest first: a correction wins
const pickDay = computed({
  get: () => day.value,
  set: (iso) => { if (!iso) return; const c = props.items.find((x) => isoDay(x.market.asOf || x.publishedAt) <= iso); if (c) selectedId.value = c.id },
})

// view + tools
const VIEW_KEY = 'mh-market-view'
let saved = 'today'; try { saved = localStorage.getItem(VIEW_KEY) || 'today' } catch {}
const view = ref(saved)
watch(view, (v) => { try { localStorage.setItem(VIEW_KEY, v) } catch {} })
const find = ref('')
const twoViews = computed(() => { const t = m.value?.tables?.[0]; return !!t && t.columns.some((c) => c.group) && t.columns.some((c) => !c.group) })
const chips = computed(() => (m.value?.tables || []).flatMap((t, ti) => t.sections.map((s, si) => ({ id: `mk-${ti}-${si}`, name: s.name || t.title }))).filter((c) => c.name))
const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>
<template>
  <div class="flex min-h-0 flex-1 flex-col" data-testid="market-tab">
    <div v-if="!loaded" class="p-10 text-center text-base text-ink-gray-5">Loading…</div>
    <div v-else-if="!items.length" class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span class="lucide-chart-line size-8 text-ink-gray-4" />
      <p class="text-base text-ink-gray-6">No Market Update yet.</p>
      <Button v-if="admin" variant="solid" label="New Market Update" icon-left="lucide-plus" @click="emit('new')" />
    </div>
    <template v-else>
      <!-- which update -->
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-2.5">
        <Tooltip text="Older update"><Button icon="lucide-chevron-left" :disabled="idx >= items.length - 1" data-testid="market-older" @click="go(idx + 1)" /></Tooltip>
        <div class="w-48 shrink-0"><FormControl v-model="pickDay" type="date" format="ddd, D MMM YYYY" data-testid="market-date" /></div>
        <Tooltip text="Newer update"><Button icon="lucide-chevron-right" :disabled="idx <= 0" data-testid="market-newer" @click="go(idx - 1)" /></Tooltip>
        <div class="ml-1 flex rounded-4 bg-surface-gray-2 p-0.5" role="tablist" aria-label="Time of day">
          <button v-for="s in SESSIONS" :key="s" type="button" role="tab" :aria-selected="m.session === s" :disabled="!ofSession(s)"
            class="rounded px-3 py-1 text-sm disabled:cursor-not-allowed disabled:text-ink-gray-4"
            :class="m.session === s ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'"
            :data-testid="`market-tab-${s}`" @click="selectedId = ofSession(s).id">{{ s }}<span v-if="ofSession(s)" class="ml-1 text-xs text-ink-gray-5">{{ fmtTimeShort(ofSession(s).market.asOf || ofSession(s).publishedAt) }}</span></button>
        </div>
        <Button v-if="idx > 0" variant="subtle" label="Latest" icon-left="lucide-arrow-up-to-line" data-testid="market-latest" @click="go(0)" />
        <div class="flex-1" />
        <template v-if="admin">
          <Button variant="ghost" icon-left="lucide-pencil" label="Edit" data-testid="market-edit" @click="emit('edit', sel)" />
          <Button variant="ghost" theme="red" icon-left="lucide-trash-2" label="Delete" @click="emit('remove', sel)" />
        </template>
      </div>

      <div class="dms-scroll min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-[1280px] px-6 pb-10 pt-5">
          <!-- heading -->
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold text-ink-gray-9" data-testid="market-title">{{ sel.title }}</h1>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-gray-5">
                <span>as on {{ fmtDateTime(m.asOf || sel.publishedAt) }}</span>
                <template v-if="sel.updatedAt"><span>·</span><span>edited {{ fmtTimeShort(sel.updatedAt) }}</span></template>
              </p>
            </div>
          </div>

          <!-- comment, then the heat map (like NSE) -->
          <div v-if="sel.html && sel.html.replace(/<[^>]+>/g, '').trim()" class="dms-rich prose prose-sm mt-4 max-w-none rounded-6 border-l-4 border-outline-gray-3 bg-surface-gray-1 px-4 py-3 text-ink-gray-8" data-testid="market-comment" v-html="sel.html" />
          <MarketHeatmap :market="m" class="mt-4" />

          <!-- tools: stay on top while scrolling -->
          <div class="sticky top-0 z-10 -mx-6 mt-4 flex flex-wrap items-center gap-2 border-b bg-surface-base px-6 py-2">
            <div v-if="twoViews" class="flex rounded-4 bg-surface-gray-2 p-0.5" role="tablist" aria-label="View">
              <button v-for="[v, l, i] in [['today', 'Today', 'lucide-activity'], ['returns', 'Returns', 'lucide-trending-up']]" :key="v" type="button" role="tab" :aria-selected="view === v"
                class="flex items-center gap-1.5 rounded px-3 py-1 text-sm" :class="view === v ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'"
                :data-testid="`market-view-${v}`" @click="view = v"><span :class="i" class="size-3.5" />{{ l }}</button>
            </div>
            <div class="dms-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
              <button v-for="c in chips" :key="c.id" type="button" class="shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-ink-gray-7 hover:bg-surface-gray-2" @click="jump(c.id)">{{ c.name.length > 28 ? 'FII / DII' : c.name }}</button>
            </div>
            <TextInput v-model="find" class="w-48" placeholder="Find, e.g. Nifty Bank" data-testid="market-find">
              <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
            </TextInput>
          </div>

          <div class="mt-4 space-y-8">
            <div v-for="(t, ti) in m.tables" :id="!t.sections[0]?.name && t.title ? `mk-${ti}-0` : undefined" :key="ti" class="scroll-mt-16">
              <MarketView :table="t" :view="view" :find="find" :day="day" :admin="admin" :anchor="`mk-${ti}`" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
