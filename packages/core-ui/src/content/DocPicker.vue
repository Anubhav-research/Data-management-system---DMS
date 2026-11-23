<script setup>
// Choose documents from the Document Repository the way one chooses a file on the computer (product owner,
// 20 Nov 2026): folders on the left, back / up and the folder path on top, the folder's contents as a list (name,
// type, size, date added). Click selects, double-click opens a folder or attaches a file, then "Attach". With
// `multiple` (email), Ctrl / Shift + click selects several.
import { ref, computed, watch, nextTick } from 'vue'
import { Dialog, Button, TextInput } from 'frappe-ui'
import DocIcon from './DocIcon.vue'
import { library, loadLibrary, folderPath, fmtSize, kindOf, KIND_LABEL } from './hub.js'
import { fmtDate } from '../format.js'

const props = defineProps({ title: { type: String, default: 'Choose from Document Repository' }, multiple: Boolean, action: { type: String, default: 'Attach' } })
const emit = defineEmits(['pick'])
const open = defineModel('open', { type: Boolean })

const RECENT = '__recent'
const folder = ref(null) // null = Document Repository (top), RECENT = recently added
const back = ref([]) // folders visited before, for Back
const q = ref('')
const chosen = ref([]) // selected document ids
const last = ref(null) // anchor for Shift + click
const list = ref(null)

watch(open, (o) => { if (o) { if (!library.value.loaded) loadLibrary(); folder.value = null; back.value = []; q.value = ''; chosen.value = [] } })

const top = computed(() => library.value.folders.filter((f) => !f.parentId).sort((a, b) => a.name.localeCompare(b.name)))
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean))
const searching = computed(() => words.value.length > 0)
const crumbs = computed(() => (folder.value && folder.value !== RECENT ? folderPath(folder.value) : []))
const rootOf = computed(() => crumbs.value[0]?.id || folder.value)

// rows of the list: folders first, then documents
const rows = computed(() => {
  const docs = library.value.docs
  if (searching.value) {
    return docs.filter((d) => { const t = `${d.name} ${d.description || ''}`.toLowerCase(); return words.value.every((w) => t.includes(w)) })
      .sort((a, b) => b.uploadedAt - a.uploadedAt).map(docRow)
  }
  if (folder.value === RECENT) return [...docs].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 15).map(docRow)
  const fs = library.value.folders.filter((f) => f.parentId === folder.value).sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({ key: `f-${f.id}`, folder: f, name: f.name, type: 'Folder', size: count(f.id), at: null }))
  const ds = folder.value ? docs.filter((d) => d.folderId === folder.value).sort((a, b) => a.name.localeCompare(b.name)).map(docRow) : []
  return [...fs, ...ds]
})
function docRow(d) { return { key: d.id, doc: d, name: d.name, type: KIND_LABEL[kindOf(d.mime, d.name)], size: fmtSize(d.size), at: d.uploadedAt, where: folderPath(d.folderId).map((f) => f.name).join(' › ') } }
function count(id) { const n = library.value.docs.filter((d) => d.folderId === id).length + library.value.folders.filter((f) => f.parentId === id).length; return n === 1 ? '1 item' : `${n} items` }
const docRows = computed(() => rows.value.filter((r) => r.doc))
const picked = computed(() => library.value.docs.filter((d) => chosen.value.includes(d.id)))

function go(id) { if (id === folder.value) return; back.value.push(folder.value); folder.value = id; q.value = ''; chosen.value = []; nextTick(() => list.value?.scrollTo?.(0, 0)) }
function goBack() { if (back.value.length) { folder.value = back.value.pop(); chosen.value = [] } }
function goUp() { const c = crumbs.value; go(c.length > 1 ? c[c.length - 2].id : null) }

function click(r, e) {
  if (r.folder) { chosen.value = []; return }
  const id = r.doc.id
  if (props.multiple && (e.ctrlKey || e.metaKey)) chosen.value = chosen.value.includes(id) ? chosen.value.filter((x) => x !== id) : [...chosen.value, id]
  else if (props.multiple && e.shiftKey && last.value) {
    const ids = docRows.value.map((x) => x.doc.id); const [a, b] = [ids.indexOf(last.value), ids.indexOf(id)].sort((x, y) => x - y)
    chosen.value = a < 0 ? [id] : ids.slice(a, b + 1)
  } else chosen.value = [id]
  if (!e.shiftKey) last.value = id
}
function dbl(r) { if (r.folder) go(r.folder.id); else { chosen.value = [r.doc.id]; done() } }
function done() { if (!picked.value.length) return; picked.value.forEach((d) => emit('pick', d)); open.value = false }
function key(e) {
  if (e.key === 'Enter' && picked.value.length) { e.preventDefault(); done() }
  if (e.key === 'Backspace' && !searching.value && e.target.tagName !== 'INPUT') { e.preventDefault(); goBack() }
}
const fileLabel = computed(() => (picked.value.length > 1 ? picked.value.map((d) => `"${d.name}"`).join(' ') : picked.value[0]?.name || ''))
const side = (active) => (active ? 'bg-surface-gray-3 font-medium text-ink-gray-9' : 'text-ink-gray-7 hover:bg-surface-gray-2')
</script>
<template>
  <Dialog v-model:open="open" size="4xl" bare>
    <div class="flex h-[78vh] max-h-[640px] flex-col overflow-hidden rounded-[inherit]" data-testid="doc-picker" @keydown="key">
      <!-- title -->
      <div class="flex items-center gap-3 border-b px-4 py-3">
        <span class="lucide-folder-open size-5 text-ink-gray-6" />
        <h3 class="flex-1 text-lg font-semibold text-ink-gray-9">{{ title }}</h3>
        <Button variant="ghost" icon="lucide-x" @click="open = false" />
      </div>
      <!-- back / up / path / search -->
      <div class="flex items-center gap-1.5 border-b bg-surface-gray-1 px-3 py-2">
        <Button variant="ghost" icon="lucide-arrow-left" :disabled="!back.length" aria-label="Back" @click="goBack" />
        <Button variant="ghost" icon="lucide-arrow-up" :disabled="!folder || searching" aria-label="Up one folder" @click="goUp" />
        <div class="flex h-7 min-w-0 flex-1 items-center gap-1 overflow-hidden rounded border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-7" data-testid="picker-path">
          <template v-if="searching"><span class="lucide-search size-3.5 text-ink-gray-5" /><span class="truncate">Results for "{{ q }}" in Document Repository</span></template>
          <template v-else>
            <button type="button" class="shrink-0 hover:text-ink-gray-9" @click="go(null)">Document Repository</button>
            <template v-if="folder === RECENT"><span class="lucide-chevron-right size-3.5 shrink-0 text-ink-gray-4" /><span class="truncate text-ink-gray-9">Recently added</span></template>
            <template v-for="(f, i) in crumbs" :key="f.id"><span class="lucide-chevron-right size-3.5 shrink-0 text-ink-gray-4" /><button type="button" class="truncate hover:text-ink-gray-9" :class="i === crumbs.length - 1 && 'text-ink-gray-9'" @click="go(f.id)">{{ f.name }}</button></template>
          </template>
        </div>
        <TextInput v-model="q" class="w-56" placeholder="Search documents" data-testid="picker-search">
          <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
        </TextInput>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- places -->
        <nav class="dms-scroll w-52 shrink-0 space-y-0.5 overflow-y-auto border-r p-2 text-sm">
          <button type="button" class="flex h-7 w-full items-center gap-2 rounded px-2 text-left" :class="side(folder === RECENT && !searching)" @click="go(RECENT)"><span class="lucide-clock size-4 shrink-0" />Recently added</button>
          <button type="button" class="flex h-7 w-full items-center gap-2 rounded px-2 text-left" :class="side(folder === null && !searching)" @click="go(null)"><span class="lucide-library size-4 shrink-0" />Document Repository</button>
          <div class="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-ink-gray-5">Folders</div>
          <button v-for="f in top" :key="f.id" type="button" class="flex h-7 w-full items-center gap-2 rounded px-2 text-left" :class="side(rootOf === f.id && !searching)" @click="go(f.id)">
            <span class="lucide-folder size-4 shrink-0 text-ink-amber-6" /><span class="truncate">{{ f.name }}</span>
          </button>
        </nav>

        <!-- contents -->
        <div ref="list" class="dms-scroll min-w-0 flex-1 overflow-y-auto" @click.self="chosen = []">
          <table class="w-full table-fixed text-sm">
            <thead class="sticky top-0 z-[1] bg-surface-base text-xs text-ink-gray-5">
              <tr class="border-b">
                <th class="px-3 py-2 text-left font-medium">Name</th>
                <th class="w-28 px-3 py-2 text-left font-medium">Type</th>
                <th class="w-24 px-3 py-2 text-right font-medium">Size</th>
                <th class="w-32 px-3 py-2 text-left font-medium">Date added</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key" class="cursor-default select-none"
                :class="r.doc && chosen.includes(r.doc.id) ? 'bg-surface-blue-2' : 'hover:bg-surface-gray-1'"
                :data-testid="r.folder ? 'picker-folder' : 'picker-doc'" @click="click(r, $event)" @dblclick="dbl(r)">
                <td class="px-3 py-1.5">
                  <div class="flex min-w-0 items-center gap-2.5">
                    <DocIcon v-if="r.folder" folder size="sm" /><DocIcon v-else :mime="r.doc.mime" :name="r.doc.name" size="sm" />
                    <span class="min-w-0">
                      <span class="block truncate text-ink-gray-8" :title="r.name">{{ r.name }}</span>
                      <span v-if="r.where && (searching || folder === RECENT)" class="block truncate text-xs text-ink-gray-5">{{ r.where }}</span>
                    </span>
                  </div>
                </td>
                <td class="truncate px-3 py-1.5 text-ink-gray-6">{{ r.type }}</td>
                <td class="px-3 py-1.5 text-right tabular-nums text-ink-gray-6">{{ r.size }}</td>
                <td class="px-3 py-1.5 text-ink-gray-6">{{ r.at ? fmtDate(r.at) : '' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!rows.length" class="px-3 py-16 text-center text-base text-ink-gray-5">{{ !library.loaded ? 'Loading…' : searching ? 'No document matches your search.' : 'This folder is empty.' }}</p>
        </div>
      </div>

      <!-- chosen file, then Cancel / Attach -->
      <div class="flex items-center gap-3 border-t px-4 py-3">
        <span class="shrink-0 text-sm text-ink-gray-6">File name:</span>
        <div class="flex h-7 min-w-0 flex-1 items-center truncate rounded border border-outline-gray-2 bg-surface-gray-1 px-2 text-sm text-ink-gray-8" data-testid="picker-chosen">{{ fileLabel }}</div>
        <Button label="Cancel" @click="open = false" />
        <Button variant="solid" :label="picked.length > 1 ? `${action} ${picked.length}` : action" :disabled="!picked.length" data-testid="picker-attach" @click="done" />
      </div>
    </div>
  </Dialog>
</template>
