<script setup>
// Admin's Market Update editor, free per update (product owner, 19 Nov 2026), laid out like "Edit Data Fields Layout":
// each TABLE is a card; inside it GROUPS (Index, Sectoral, Metals ...) hold ROWS; COLUMNS (with an optional group
// heading such as Returns, FII, DII) are set per table under "Columns". Everything can be added, renamed, moved and
// removed. Filling it:
//   - it opens with the last update (only CMP is emptied; the last CMP shows as a hint);
//   - pasting several values into a box fills down and to the right.
// Auto columns (change, % change) are worked out while typing.
// The latest update is also the automation's layout (21 Nov 2026): rows and columns added here are filled by the
// market automation from its next run, matched by name. A figure it did not bring is kept, faded (r.old); typing
// or pasting a new figure clears that mark.
import { ref, computed } from 'vue'
import { Button, Dropdown, Tooltip } from 'frappe-ui'
import { SESSIONS, COLUMN_TYPES, isAuto, cell, pricesTable, flowsTable, blankTable, newColumnKey, num } from './market.js'

const m = defineModel({ type: Object, required: true })
const colsOpen = ref({}) // table index -> columns panel open

const inp = 'h-7 w-full rounded border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:outline-none'
const numInp = `${inp} text-right tabular-nums`
const sel = `${inp} !py-0 !pl-2 !pr-7 !leading-7`
const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const [x] = list.splice(i, 1); list.splice(j, 0, x) }

// "as on" time of the figures
const asOfLocal = computed({
  get: () => { const d = new Date(m.value.asOf || Date.now()); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` },
  set: (v) => { const t = new Date(v).getTime(); if (!isNaN(t)) m.value.asOf = t },
})

// tables
const addTable = (kind) => { const t = kind === 'prices' ? pricesTable() : kind === 'flows' ? flowsTable() : blankTable(); if (kind === 'flows') t.sections[0].rows.push({ name: '', v: {} }); m.value.tables.push(t) }
const tableMenu = (ti) => [
  { label: 'Move up', icon: 'lucide-arrow-up', onClick: () => move(m.value.tables, ti, -1) },
  { label: 'Move down', icon: 'lucide-arrow-down', onClick: () => move(m.value.tables, ti, 1) },
  { label: 'Remove table', icon: 'lucide-trash-2', theme: 'red', onClick: () => m.value.tables.splice(ti, 1) },
]
const addMenu = [
  { label: 'Prices table (CMP, change, returns)', icon: 'lucide-chart-line', onClick: () => addTable('prices') },
  { label: 'FII / DII table', icon: 'lucide-landmark', onClick: () => addTable('flows') },
  { label: 'Blank table', icon: 'lucide-table', onClick: () => addTable('blank') },
]

// columns
const numCols = (t) => t.columns.filter((c) => c.type === 'num')
function addColumn(t) { t.columns.push({ key: newColumnKey(), label: 'New column', group: t.columns[t.columns.length - 1]?.group || '', type: 'num' }) }
function setType(t, c, type) {
  c.type = type
  if (isAuto(c)) { const before = t.columns.slice(0, t.columns.indexOf(c)).filter((x) => x.type === 'num'); c.of = c.of?.length === 2 ? c.of : [before[before.length - 2]?.key || numCols(t)[0]?.key, before[before.length - 1]?.key || numCols(t)[1]?.key] }
  else delete c.of
}

// groups and rows
const sectionMenu = (t, si) => [
  { label: 'Move up', icon: 'lucide-arrow-up', onClick: () => move(t.sections, si, -1) },
  { label: 'Move down', icon: 'lucide-arrow-down', onClick: () => move(t.sections, si, 1) },
  { label: 'Remove group', icon: 'lucide-trash-2', theme: 'red', onClick: () => t.sections.splice(si, 1) },
]
const rowMenu = (s, ri) => [
  { label: 'Move up', icon: 'lucide-arrow-up', onClick: () => move(s.rows, ri, -1) },
  { label: 'Move down', icon: 'lucide-arrow-down', onClick: () => move(s.rows, ri, 1) },
  { label: s.rows[ri].unit === 'bps' ? 'Show % columns as %' : 'Show % columns in bps (yields)', icon: 'lucide-percent', onClick: () => { const r = s.rows[ri]; if (r.unit === 'bps') delete r.unit; else r.unit = 'bps' } },
  { label: 'Remove row', icon: 'lucide-trash-2', theme: 'red', onClick: () => s.rows.splice(ri, 1) },
]
const addRow = (s) => s.rows.push({ name: '', v: {} })
const addSection = (t) => t.sections.push({ name: 'New group', rows: [{ name: '', v: {} }] })

/** Paste: several lines / tab-separated values fill this table from this box down and to the right. */
function paste(e, t, row, colKey) {
  const text = e.clipboardData.getData('text/plain'); if (!/[\n\t]/.test(text.trim())) return
  e.preventDefault()
  const rows = t.sections.flatMap((s) => s.rows); const start = rows.indexOf(row)
  const fields = colKey === '__name' ? ['__name', ...t.columns.filter((c) => !isAuto(c)).map((c) => c.key)] : t.columns.filter((c) => !isAuto(c)).map((c) => c.key)
  const from = fields.indexOf(colKey)
  text.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => {
    let r = rows[start + i]
    if (!r) { const s = t.sections[t.sections.length - 1]; r = { name: '', v: {} }; s.rows.push(r); rows.push(r) }
    line.split('\t').forEach((val, j) => { const f = fields[from + j]; if (!f) return; const v = val.trim().replace(/%$/, ''); if (f === '__name') r.name = v; else { r.v[f] = v; fresh(r, f) } })
  })
}

const clearFigures = () => m.value.tables.forEach((t) => t.sections.forEach((s) => s.rows.forEach((r) => { r.was = r.v[t.columns[0]?.key] ?? r.was; r.v = {}; delete r.old })))
/** A figure typed now is current: drop its "kept from an earlier update" mark. */
function fresh(r, k) { if (!r.old?.[k]) return; delete r.old[k]; if (!Object.keys(r.old).length) delete r.old }
const hint = (t, r, c) => (c === t.columns[0] && r.was && num(r.was) != null ? r.was : '')
</script>
<template>
  <div class="space-y-4" data-testid="market-form">
    <!-- which update, how to fill -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex rounded-4 bg-surface-gray-2 p-0.5" role="radiogroup" aria-label="Time of day">
        <button v-for="s in SESSIONS" :key="s" type="button" role="radio" :aria-checked="m.session === s" class="rounded px-3 py-1 text-sm"
          :class="m.session === s ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`market-session-${s}`" @click="m.session = s">{{ s }}</button>
      </div>
      <label class="flex items-center gap-2 text-xs text-ink-gray-5">Figures as on
        <input v-model="asOfLocal" type="datetime-local" class="h-7 rounded border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 focus:border-outline-gray-4 focus:outline-none" data-testid="market-asof" />
      </label>
      <div class="flex-1" />
      <Button variant="ghost" label="Clear figures" icon-left="lucide-eraser" @click="clearFigures" />
    </div>
    <p class="-mt-2 text-xs text-ink-gray-5">Started from the last update. Type the new figures. Change and % fill in by themselves. Rows and columns you add here are also filled by the market automation from its next run (matched by name).</p>

    <!-- tables -->
    <section v-for="(t, ti) in m.tables" :key="ti" class="rounded-6 bg-surface-gray-2 p-3" data-testid="market-form-table">
      <div class="mb-2 flex items-center gap-2">
        <span class="lucide-table size-4 text-ink-gray-5" />
        <input v-model="t.title" :class="inp" class="!w-auto min-w-0 flex-1 !bg-transparent !border-transparent font-medium hover:!border-outline-gray-2 focus:!bg-surface-base" placeholder="Table title (optional)" :aria-label="`Table ${ti + 1} title`" />
        <span class="shrink-0 text-xs text-ink-gray-5">{{ t.sections.reduce((n, s) => n + s.rows.length, 0) }} rows · {{ t.columns.length }} columns</span>
        <Button size="sm" :variant="colsOpen[ti] ? 'subtle' : 'ghost'" icon-left="lucide-columns-3" label="Columns" data-testid="market-columns" @click="colsOpen[ti] = !colsOpen[ti]" />
        <Dropdown :options="tableMenu(ti)"><Button size="sm" variant="ghost" icon="lucide-ellipsis" :aria-label="`Table ${ti + 1} actions`" /></Dropdown>
      </div>

      <!-- columns of this table -->
      <div v-if="colsOpen[ti]" class="mb-3 rounded-4 border bg-surface-base p-3" data-testid="market-columns-panel">
        <div class="mb-2 flex items-center gap-2 text-xs text-ink-gray-5">
          <span>Heading of the name column</span><input v-model="t.firstLabel" :class="inp" class="!w-40" placeholder="e.g. Date (optional)" title="A table headed &quot;Date&quot; (like FII / DII) takes its rows from the automation" />
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_minmax(0,1.4fr)_76px] gap-2 px-1 pb-1 text-xs text-ink-gray-5"><span>Column</span><span>Group heading</span><span>Kind</span><span>Worked out from</span><span /></div>
        <div v-for="(c, ci) in t.columns" :key="c.key" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_minmax(0,1.4fr)_76px] items-center gap-2 py-0.5">
          <input v-model="c.label" :class="inp" placeholder="Label" />
          <input v-model="c.group" :class="inp" placeholder="e.g. Returns (optional)" />
          <select :value="c.type" :class="sel" @change="setType(t, c, $event.target.value)"><option v-for="o in COLUMN_TYPES" :key="o.value" :value="o.value">{{ o.label }}</option></select>
          <div v-if="isAuto(c)" class="flex items-center gap-1 text-xs text-ink-gray-5">
            <select v-model="c.of[0]" :class="sel"><option v-for="n in numCols(t)" :key="n.key" :value="n.key">{{ n.label }}</option></select>
            <span>{{ c.type === 'diff' ? '−' : 'vs' }}</span>
            <select v-model="c.of[1]" :class="sel"><option v-for="n in numCols(t)" :key="n.key" :value="n.key">{{ n.label }}</option></select>
          </div>
          <span v-else class="text-xs text-ink-gray-4">typed in</span>
          <div class="flex justify-end">
            <button type="button" class="lucide-arrow-left size-6 rounded p-1 text-ink-gray-5 hover:bg-surface-gray-2" :aria-label="`Move ${c.label} left`" @click="move(t.columns, ci, -1)" />
            <button type="button" class="lucide-arrow-right size-6 rounded p-1 text-ink-gray-5 hover:bg-surface-gray-2" :aria-label="`Move ${c.label} right`" @click="move(t.columns, ci, 1)" />
            <button type="button" class="lucide-x size-6 rounded p-1 text-ink-gray-5 hover:bg-surface-red-1 hover:text-ink-red-6" :aria-label="`Remove ${c.label}`" @click="t.columns.splice(ci, 1)" />
          </div>
        </div>
        <Button class="mt-2" size="sm" icon-left="lucide-plus" label="Add column" data-testid="market-add-column" @click="addColumn(t)" />
      </div>

      <!-- groups and rows -->
      <div class="dms-scroll overflow-x-auto rounded-4 border bg-surface-base">
        <table class="border-separate border-spacing-0 text-sm">
          <thead>
            <tr class="text-xs text-ink-gray-5">
              <th class="sticky left-0 z-[1] min-w-[230px] border-b bg-surface-gray-1 px-2 py-1.5 text-left font-medium">{{ t.firstLabel || 'Name' }}</th>
              <th v-for="c in t.columns" :key="c.key" class="min-w-[92px] whitespace-nowrap border-b bg-surface-gray-1 px-1 py-1.5 text-right font-medium">
                <div v-if="c.group" class="text-[10px] font-normal uppercase tracking-wide text-ink-gray-4">{{ c.group }}</div>
                {{ c.label }}<span v-if="isAuto(c)" class="ml-0.5 text-ink-gray-4">(auto)</span>
              </th>
              <th class="w-8 border-b bg-surface-gray-1" />
            </tr>
          </thead>
          <tbody v-for="(s, si) in t.sections" :key="si">
            <tr>
              <td :colspan="t.columns.length + 2" class="border-b bg-surface-gray-1 px-2 py-1">
                <div class="sticky left-2 flex w-max items-center gap-2">
                  <span class="lucide-layers size-3.5 text-ink-gray-5" />
                  <input v-model="s.name" :class="inp" class="!w-56 font-semibold" placeholder="Group name (optional)" data-testid="market-group-name" />
                  <span class="text-xs text-ink-gray-5">{{ s.rows.length }} rows</span>
                  <Dropdown :options="sectionMenu(t, si)"><Button size="sm" variant="ghost" icon="lucide-ellipsis" :aria-label="`Group ${s.name} actions`" /></Dropdown>
                </div>
              </td>
            </tr>
            <tr v-for="(r, ri) in s.rows" :key="ri" data-testid="market-form-row">
              <td class="sticky left-0 z-[1] border-b bg-surface-base px-2 py-1">
                <div class="flex items-center gap-1">
                  <input v-model="r.name" :class="inp" placeholder="Name" :aria-label="`Row name ${r.name}`" @paste="paste($event, t, r, '__name')" />
                  <span v-if="r.unit === 'bps'" class="shrink-0 rounded bg-surface-gray-2 px-1 text-[10px] text-ink-gray-6">bps</span>
                </div>
              </td>
              <td v-for="c in t.columns" :key="c.key" class="border-b px-1 py-1">
                <span v-if="isAuto(c)" class="block px-1 text-right tabular-nums" :class="cell(r, c).cls">{{ cell(r, c).text }}</span>
                <input v-else v-model="r.v[c.key]" :class="[numInp, r.old?.[c.key] && 'opacity-60']" inputmode="decimal" :placeholder="hint(t, r, c)" :title="r.old?.[c.key] ? `Kept from ${r.old[c.key]}: not updated since` : undefined" @input="fresh(r, c.key)" :aria-label="`${r.name} ${c.group ? c.group + ' ' : ''}${c.label}`" @paste="paste($event, t, r, c.key)" />
              </td>
              <td class="border-b px-1">
                <Dropdown :options="rowMenu(s, ri)"><Button size="sm" variant="ghost" icon="lucide-ellipsis" :aria-label="`Row ${r.name} actions`" /></Dropdown>
              </td>
            </tr>
            <tr>
              <td :colspan="t.columns.length + 2" class="border-b px-2 py-1">
                <div class="sticky left-2 w-max"><Button size="sm" variant="ghost" icon-left="lucide-plus" label="Add row" data-testid="market-add-row" @click="addRow(s)" /></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-2 flex items-center gap-2">
        <Button size="sm" icon-left="lucide-plus" label="Add group" data-testid="market-add-group" @click="addSection(t)" />
        <input v-model="t.note" :class="inp" class="flex-1" placeholder="Footnote (optional), e.g. Returns: absolute up to 1Y, CAGR beyond." />
      </div>
    </section>

    <Dropdown :options="addMenu"><Button icon-left="lucide-plus" label="Add table" data-testid="market-add-table" /></Dropdown>
  </div>
</template>
