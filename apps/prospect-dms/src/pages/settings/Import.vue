<script setup>
// Data Import > Import History (Admin only; D06 §4; Fig 23491) - Prospect DMS.
// A plain list in the style of the other Frappe CRM settings tables: one quiet row per file
// (file, source, when, rows, added, skipped, status). Skipped = Duplicates + Invalid + Existing client or
// family – skipped (split prompt §6.7.2); a download icon beside it gives the existing-client rows as CSV.
// The upload wizard is components/modals/ImportDialog.vue (also opened from Pool ⋯ > Import).
import { ref, computed } from 'vue'
import { Button, TextInput } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { settingsFilter } from '@/composables/settings'
import { downloadCsv, IMPORT_HEAD } from '@/services/importFiles'
import SettingsShell from '@/components/settings/SettingsShell.vue'
import QuickSelect from '@/components/QuickSelect.vue'
import ImportDialog from '@/components/modals/ImportDialog.vue'

const db = useDb()
const q = ref(''); const status = ref(undefined); const src = ref(undefined)
// opened from the Dashboard: only the files behind the number clicked, until the filter is removed
const rows = computed(() => db.imports.filter((i) => (!settingsFilter.value || settingsFilter.value.ids.includes(i.id)) && (!q.value || `${i.file} ${i.source}`.toLowerCase().includes(q.value.toLowerCase())) && (!status.value || i.status === status.value) && (!src.value || i.source === src.value)))
const clearDrill = () => { settingsFilter.value = null }
const filtered = computed(() => !!(q.value || status.value || src.value))
function clearFilters() { q.value = ''; status.value = undefined; src.value = undefined }
const sources = computed(() => [...new Set(db.imports.map((i) => i.source))])

const n = (v) => Number(v || 0).toLocaleString('en-IN')
const day = (ms) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const time = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const isXls = (f) => /\.xlsx?$/i.test(f)
const skipped = (i) => (i.duplicates || 0) + (i.invalid || 0) + (i.existing || 0)
const done = (i) => i.status === 'Completed'

const uploadOpen = ref(false)

function skippedCsv(i) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  downloadCsv(`${i.file.replace(/\.\w+$/, '')}_existing_client_or_family_skipped.csv`, [['First Name', 'Middle Name', 'Last Name', 'Mobile', 'Email', 'City', 'State', 'PAN', 'Reason'], ...(i.existingRows || []).map((r) => [...IMPORT_HEAD.map((k) => r[k]), 'Existing client or family – skipped'])].map((r) => r.map(cell).join(',')).join('\r\n'))
}
</script>
<template>
  <SettingsShell title="Import History" description="Files imported into the Pool and what happened to their rows.">
    <template #actions><Button variant="solid" icon-left="lucide-upload" label="Import New File" @click="uploadOpen = true" /></template>

    <div v-if="settingsFilter" class="mb-2 flex items-center gap-2 rounded-4 bg-surface-blue-1 px-3 py-1.5 text-sm text-ink-blue-7" data-testid="silent-filter">
      <span class="lucide-layout-dashboard size-3.5 shrink-0" />
      <span class="min-w-0 truncate">From Dashboard: <b class="font-medium">{{ settingsFilter.from }}</b> · {{ rows.length }} record{{ rows.length === 1 ? "" : "s" }}</span>
      <button class="ml-auto shrink-0 font-medium underline" @click="clearDrill">Remove filter</button>
    </div>
    <!-- toolbar -->
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <div class="w-full sm:w-60"><TextInput v-model="q" placeholder="Search file or source"><template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template></TextInput></div>
      <QuickSelect v-model="status" label="Status" :options="['Completed', 'Processing']" />
      <QuickSelect v-model="src" label="Source" :options="sources" />
      <button v-if="filtered" type="button" class="px-1 text-sm text-ink-gray-5 hover:text-ink-gray-8" @click="clearFilters">Clear</button>
    </div>

    <!-- list -->
    <div class="overflow-x-auto" data-testid="import-history">
      <table class="w-full min-w-[600px] table-fixed text-base">
        <colgroup><col /><col class="w-32" /><col class="w-16" /><col class="w-16" /><col class="w-16" /><col class="w-28" /></colgroup>
        <thead>
          <tr class="text-left text-sm text-ink-gray-5">
            <th class="rounded-l-md bg-surface-gray-2 px-3 py-2 font-normal">File</th>
            <th class="bg-surface-gray-2 px-3 py-2 font-normal">Imported on</th>
            <th class="bg-surface-gray-2 px-3 py-2 text-right font-normal">Rows</th>
            <th class="bg-surface-gray-2 px-3 py-2 text-right font-normal">Added</th>
            <th class="bg-surface-gray-2 px-3 py-2 text-right font-normal">Skipped</th>
            <th class="rounded-r-md bg-surface-gray-2 px-3 py-2 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in rows" :key="i.id" :data-import="i.file" class="border-b border-outline-gray-1 last:border-0">
            <td class="px-3 py-2.5">
              <div class="flex min-w-0 items-center gap-2.5">
                <span :class="isXls(i.file) ? 'lucide-file-spreadsheet' : 'lucide-file-text'" class="size-4 shrink-0 text-ink-gray-5" />
                <div class="min-w-0">
                  <div class="truncate text-ink-gray-8" :title="i.file">{{ i.file }}</div>
                  <div class="truncate text-sm text-ink-gray-5">{{ i.source }}</div>
                </div>
              </div>
            </td>
            <td class="px-3"><div class="text-ink-gray-7">{{ day(i.at) }}</div><div class="text-sm text-ink-gray-5">{{ time(i.at) }}</div></td>
            <td class="px-3 text-right tabular text-ink-gray-7" data-col="total">{{ n(i.total) }}</td>
            <td class="px-3 text-right tabular text-ink-gray-8" data-col="imported">{{ done(i) ? n(i.imported) : '—' }}</td>
            <td class="px-3 text-right tabular" :class="done(i) && skipped(i) ? 'text-ink-gray-7' : 'text-ink-gray-4'" data-col="skipped">
              <span class="inline-flex items-center gap-1">
                <button v-if="done(i) && (i.existingRows || []).length" type="button" class="lucide-download size-3.5 text-ink-gray-5 hover:text-ink-gray-8" title="Download the rows skipped as an existing client or family (CSV)" @click="skippedCsv(i)" />
                {{ done(i) ? n(skipped(i)) : '—' }}
              </span>
            </td>
            <td class="px-3">
              <span v-if="done(i)" class="flex items-center gap-1.5 text-ink-gray-7"><span class="size-1.5 rounded-full bg-surface-green-7" />Completed</span>
              <span v-else class="flex items-center gap-1.5 text-ink-gray-6"><span class="lucide-loader-circle size-3.5 animate-spin" />Processing</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="!rows.length" class="flex flex-col items-center py-14 text-center">
        <span class="lucide-file-search size-6 text-ink-gray-4" />
        <div class="mt-2 text-base text-ink-gray-7">{{ db.imports.length ? 'No imports match these filters' : 'No files imported yet' }}</div>
        <div class="mt-0.5 text-sm text-ink-gray-5">{{ db.imports.length ? 'Try a different search or clear the filters.' : 'Imported files will appear here.' }}</div>
        <Button v-if="filtered" class="mt-3" label="Clear filters" @click="clearFilters" />
      </div>
    </div>
    <div v-if="rows.length" class="mt-2 px-3 text-sm text-ink-gray-5">{{ rows.length }} of {{ db.imports.length }} files</div>

    <ImportDialog v-model:open="uploadOpen" />
  </SettingsShell>
</template>
