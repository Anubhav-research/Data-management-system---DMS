<script setup>
// Data Import wizard (Admin only; D06 §4; Fig 23389 Upload wizard) - Prospect DMS.
// Opened from Settings > Data Import ("Import New File") and from Pool ⋯ > Import.
// SIMULATED in part: the Import FSD's column mapping and cleaning are not executed. CSV rows ARE read
// (First Name, Middle Name, Last Name, Mobile, Email, City, State, PAN) and sorted into five counts that add up
// to Total Rows: Imported · Duplicates · Invalid · Existing client or family – skipped (split prompt §6.7.2) · Total.
// "Existing client or family": the number or PAN is a family's (do not distribute) or exists in Investor DMS or on
// the Transaction Platform (F3, Yes/No only). Those rows get their own skipped-rows CSV.
import { ref, watch } from 'vue'
import { Button, Dialog, FormControl, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { notify } from '@/services/notify'
import { CITIES } from '@/data/masters'
import { newFamilyId, normalize } from '@/services/family'
import { screenImport } from '@/services/numberCheck'
import { downloadCsv, IMPORT_HEAD } from '@/services/importFiles'

const open = defineModel('open', { default: false })
const db = useDb()
const step = ref(1)
const file = ref(null); const parsed = ref([]); const dragging = ref(false)
const sourceMode = ref('existing'); const source = ref(''); const newSource = ref(''); const err = ref('')
function reset() { step.value = 1; file.value = null; parsed.value = []; source.value = ''; newSource.value = ''; sourceMode.value = 'existing'; err.value = '' }
watch(open, (o) => o && reset())

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const at = (k) => head.indexOf(k)
  return lines.slice(1).map((l) => { const c = l.split(','); return Object.fromEntries(IMPORT_HEAD.map((k) => [k, at(k) >= 0 ? (c[at(k)] || '').trim() : ''])) })
}
function onFile(f) {
  if (!f) return
  if (!/\.(csv|xlsx?)$/i.test(f.name)) { err.value = 'Please upload a CSV or Excel file.'; return }
  err.value = ''; file.value = f; parsed.value = []
  if (/\.csv$/i.test(f.name)) f.text().then((t) => { parsed.value = parseCsv(t) }).catch(() => {})
}
function drop(e) { dragging.value = false; onFile(e.dataTransfer.files[0]) }
function template() { downloadCsv('dms_pool_import_template.csv', 'First Name,Middle Name,Last Name,Mobile,Email,City,State,PAN\nAsha,,Verma,9876500001,asha.verma@examplemail.in,Pune,Maharashtra,\n') }

const FIRST = ['Asha', 'Kunal', 'Meera', 'Rohan', 'Tanvi', 'Vikas', 'Neel', 'Ira', 'Sahil', 'Pallavi']
const LAST = ['Verma', 'Iyer', 'Desai', 'Rao', 'Joshi', 'Menon', 'Kapoor', 'Shetty']
function fakeRows(n) {
  return Array.from({ length: n }, (_, i) => { const [city, state] = CITIES[i % CITIES.length]; return { 'first name': FIRST[i % FIRST.length], 'middle name': '', 'last name': LAST[(i * 3) % LAST.length], mobile: String(9000000000 + Math.floor(Math.random() * 899999999)).slice(0, 10), email: '', city, state, pan: '' } })
}
function poolClient(srcName, r) {
  return {
    id: `CRM-LEAD-2026-${String(++db.seq).padStart(5, '0')}`, familyId: newFamilyId(), stage: 'Pool',
    members: [{ key: 'p', first_name: r['first name'], middle_name: r['middle name'] || '', last_name: r['last name'] || '', gender: '', language: '', relationship: 'Primary', pan: (r.pan || '').toUpperCase(), date_of_birth: '',
      contacts: [{ id: 'c' + db.seq, type: 'Residence', mobile: normalize(r.mobile), is_whatsapp: false }], emails: r.email ? [{ id: 'e' + db.seq, email: r.email }] : [], addresses: [{ id: 'a' + db.seq, type: 'Present', address: '', city: r.city || '', pin: '', state: r.state || '', country: 'India' }], product: [], extra: { pan: (r.pan || '').toUpperCase() } }],
    poolState: 'Active', inactiveUntil: null, batchOf: null, assignedTo: null, takeoverDate: null, lastCallAt: null, callStatus: null,
    counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, source: srcName, importDate: Date.now(), ownershipHistory: [], documents: [], createdAt: Date.now(), totalCalls: 0,
  }
}
const busy = ref(false)
async function run() {
  const name = (sourceMode.value === 'new' ? newSource.value : source.value).trim()
  if (!name) { err.value = 'Choose or enter a source.'; return }
  const data = parsed.value.length ? parsed.value : fakeRows(25)
  busy.value = true; err.value = ''
  // F3 + "do not distribute": one Yes/No question for every mobile and PAN in the file
  let existing
  try { existing = await screenImport(data.flatMap((r) => [r.mobile, r.pan]).filter(Boolean)) } catch (e) { err.value = e.message; busy.value = false; return }
  const entry = { id: db.nextId('IMP'), file: file.value.name, meta: `${(file.value.size / 1048576).toFixed(1)} MB`, source: name, at: Date.now(), imported: 0, duplicates: 0, invalid: 0, existing: 0, total: data.length, status: 'Processing', by: db.sessionUserId, existingRows: [] }
  db.imports.unshift(entry)
  open.value = false; busy.value = false
  toast.info('Processing file...')
  setTimeout(() => {
    let ps = db.poolSources.find((s) => s.name.replace(/\s+/g, ' ').toLowerCase() === name.replace(/\s+/g, ' ').toLowerCase()) // D06 §8
    if (!ps) { ps = { name, visible: true, isNew: true, lastImported: Date.now(), count: 0 }; db.poolSources.push(ps) } else ps.lastImported = Date.now()
    const known = new Set(db.clients.flatMap((c) => c.members.flatMap((m) => (m.contacts || []).map((x) => normalize(x.mobile)))).filter(Boolean))
    const e = db.imports.find((x) => x.id === entry.id)
    for (const r of data) {
      const mob = normalize(r.mobile); const pan = normalize(r.pan)
      if (!r['first name'] || !/^\d{10}$/.test(String(r.mobile).replace(/\D/g, '').slice(-10)) || (r.pan && !pan)) { e.invalid++; continue }
      if (existing.has(mob) || (pan && existing.has(pan))) { e.existing++; e.existingRows.push(r); continue } // split prompt §6.7.2
      if (known.has(mob)) { e.duplicates++; continue }
      known.add(mob)
      const nc = poolClient(ps.name, r)
      db.clients.push(nc); e.imported++
      db.addActivity(nc.id, 'stage', `imported it into the Pool (${ps.name})`) // first entry of the record's journey
    }
    e.status = 'Completed'
    notify(db.sessionUserId, 'IMPORT', `Your file ${entry.file} has been successfully imported.`, { path: '/settings/import' }) // D06 §11
    toast.success(`${e.imported} imported · ${e.existing} existing client or family skipped`)
  }, 1200)
}
</script>
<template>
  <Dialog v-model:open="open" title="Data Import / Importing" size="2xl">
    <div class="mb-4 flex items-center gap-3 text-sm">
      <span class="flex items-center gap-1.5" :class="step === 1 ? 'font-medium text-ink-gray-9' : 'text-ink-gray-5'"><span class="flex size-5 items-center justify-center rounded-full bg-surface-gray-3 text-xs">1</span>Upload File</span>
      <span class="lucide-chevron-right size-3.5 text-ink-gray-4" />
      <span class="flex items-center gap-1.5" :class="step === 2 ? 'font-medium text-ink-gray-9' : 'text-ink-gray-5'"><span class="flex size-5 items-center justify-center rounded-full bg-surface-gray-3 text-xs">2</span>Choose Import</span>
    </div>
    <template v-if="step === 1">
      <p class="mb-3 text-sm text-ink-gray-6">Import data into your system using CSV files or Google Sheets.</p>
      <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-6 border-2 border-dashed px-6 py-10 text-center" :class="dragging ? 'border-outline-blue-5 bg-surface-blue-1' : 'border-outline-gray-2'"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="drop">
        <span class="lucide-upload-cloud size-7 text-ink-gray-5" />
        <span class="text-base text-ink-gray-7">{{ file ? file.name : 'Drag and drop a CSV file, or upload from your Device.' }}</span>
        <span v-if="file" class="text-xs text-ink-gray-5">{{ parsed.length ? `${parsed.length} data rows detected` : 'Rows not readable – 25 demo records will be created' }}</span>
        <input type="file" accept=".csv,.xls,.xlsx" class="hidden" data-testid="import-file" @change="onFile($event.target.files[0])" />
      </label>
      <div class="mt-2"><button class="text-sm text-ink-blue-link hover:underline" @click="template">Download CSV Template</button></div>
    </template>
    <template v-else>
      <div class="space-y-3">
        <div class="flex gap-4 text-base">
          <label class="flex items-center gap-2"><input v-model="sourceMode" type="radio" value="existing" class="focus:ring-0" />Existing source</label>
          <label class="flex items-center gap-2"><input v-model="sourceMode" type="radio" value="new" class="focus:ring-0" />New source</label>
        </div>
        <FormControl v-if="sourceMode === 'existing'" v-model="source" type="select" label="Source" :options="db.poolSources.map((s) => s.name)" placeholder="Select source" />
        <FormControl v-else v-model="newSource" label="New source name" placeholder="e.g. Campaign Q4" />
        <p class="rounded-4 bg-surface-amber-2 px-3 py-2 text-xs text-ink-amber-8">Demo: column mapping and data cleaning from the Import FSD are simulated. Every mobile and PAN is checked against existing client families, Investor DMS and the Transaction Platform (Yes/No only) before anything is created.</p>
      </div>
    </template>
    <p v-if="err" class="mt-2 text-sm text-ink-red-7">{{ err }}</p>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button v-if="step === 2" label="Back" @click="step = 1" />
        <Button v-if="step === 1" variant="solid" label="Continue" :disabled="!file" @click="step = 2" />
        <Button v-else variant="solid" label="Import" :loading="busy" @click="run" />
      </div>
    </template>
  </Dialog>
</template>
