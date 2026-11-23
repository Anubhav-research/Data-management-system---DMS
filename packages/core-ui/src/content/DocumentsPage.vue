<script setup>
// Documents: the company Document Repository, the same in every DMS website (Content Hub). Built to find a document
// fast and send it to a client without downloading it (product owner, 17 Nov 2026):
//   left   - the folder tree (as on a computer), plus "Recently added"
//   right  - the open folder: sub-folders, then files; or, while searching, matches from every folder with their path
//   a file - click to preview; "Copy" puts it on the DMS clipboard -> paste in a client's WhatsApp chat in the DMS -> Send;
//            Download is always there too
//   Admin  - New Folder, Upload (button or drop files on the page), Edit / Move / Audience / Delete.
//            Every item has an audience (All teams, B2C only, B2B only); a website shows only what fits its team.
import { ref, computed, onMounted, watch } from 'vue'
import { Button, TextInput, Dropdown, Dialog, FormControl, Tooltip, toast, dialog } from 'frappe-ui'
import DocIcon from './DocIcon.vue'
import DocPreview from './DocPreview.vue'
import HeaderTools from './HeaderTools.vue'
import { copiedToast, library, loadLibrary, api, copyDoc, copiedDoc, download, readFile, folderPath, fmtSize, kindOf, KIND_LABEL, AUDIENCE, audienceShort } from './hub.js'
import { fmtDate } from '../format.js'

const RECENT = '__recent'; const RECENT_DAYS = 30
const folders = computed(() => library.value.folders)
const docs = computed(() => library.value.docs)
const admin = computed(() => library.value.admin)
const current = ref(null) // folder id, RECENT, or null (top)
const q = ref(''); const kind = ref(''); const audience = ref(''); const sortBy = ref('name')
const expanded = ref(new Set())
const childrenOf = (id) => folders.value.filter((f) => f.parentId === id).sort((a, b) => a.name.localeCompare(b.name))
// number of files in a folder and everything under it
const countIn = (id) => docs.value.filter((d) => d.folderId === id).length + childrenOf(id).reduce((n, f) => n + countIn(f.id), 0)
const treeRows = computed(() => {
  const out = []
  const walk = (parent, depth) => { for (const f of childrenOf(parent)) { out.push({ f, depth, open: expanded.value.has(f.id), hasKids: childrenOf(f.id).length > 0 }); if (expanded.value.has(f.id)) walk(f.id, depth + 1) } }
  walk(null, 0); return out
})
function toggle(id) { const s = new Set(expanded.value); s.has(id) ? s.delete(id) : s.add(id); expanded.value = s }
function openFolder(id) {
  current.value = id; q.value = ''
  if (id && id !== RECENT) { const s = new Set(expanded.value); folderPath(id).forEach((f) => s.add(f.id)); expanded.value = s }
}
const crumbs = computed(() => (current.value === RECENT ? [{ id: RECENT, name: 'Recently added' }] : folderPath(current.value)))
const recentCount = computed(() => docs.value.filter((d) => Date.now() - d.uploadedAt <= RECENT_DAYS * 86400000).length)

// what the right side lists
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean))
const searching = computed(() => words.value.length > 0)
const pathText = (folderId) => folderPath(folderId).map((f) => f.name).join(' › ')
const filterDoc = (d) => (!kind.value || kindOf(d.mime, d.name) === kind.value) && (!audience.value || d.audience === audience.value)
const subfolders = computed(() => (searching.value || current.value === RECENT ? [] : childrenOf(current.value).filter((f) => !audience.value || f.audience === audience.value)))
const files = computed(() => {
  let list
  if (searching.value) list = docs.value.filter((d) => { const t = `${d.name} ${d.description} ${pathText(d.folderId)}`.toLowerCase(); return words.value.every((w) => t.includes(w)) })
  else if (current.value === RECENT) list = docs.value.filter((d) => Date.now() - d.uploadedAt <= RECENT_DAYS * 86400000)
  else list = docs.value.filter((d) => d.folderId === current.value)
  list = list.filter(filterDoc)
  const by = searching.value || current.value === RECENT ? 'new' : sortBy.value
  return [...list].sort(by === 'new' ? (a, b) => b.uploadedAt - a.uploadedAt : by === 'size' ? (a, b) => b.size - a.size : (a, b) => a.name.localeCompare(b.name))
})
const showPath = computed(() => searching.value || current.value === RECENT)
const kindOptions = computed(() => [{ label: 'All types', value: '' }, ...[...new Set(docs.value.map((d) => kindOf(d.mime, d.name)))].map((k) => ({ label: KIND_LABEL[k], value: k }))])
const kindMenu = computed(() => kindOptions.value.map((o) => ({ label: o.label, icon: kind.value === o.value ? 'lucide-check' : '', onClick: () => { kind.value = o.value } })))
const audienceMenu = computed(() => [{ label: 'Every audience', value: '' }, ...AUDIENCE].map((o) => ({ label: o.value ? audienceShort(o.value) : o.label, icon: audience.value === o.value ? 'lucide-check' : '', onClick: () => { audience.value = o.value } })))
const sortMenu = computed(() => [['name', 'Name (A–Z)'], ['new', 'Newest first'], ['size', 'Largest first']].map(([v, l]) => ({ label: l, icon: sortBy.value === v ? 'lucide-check' : '', onClick: () => { sortBy.value = v } })))

// preview + copy
const preview = ref(null); const previewOpen = ref(false)
function openPreview(d) { preview.value = d; previewOpen.value = true }
async function copy(d) {
  toast.success(copiedToast(d, await copyDoc(d)))
}
const isCopied = (d) => copiedDoc.value?.docId === d.id

// ---- Admin: folders
const folderForm = ref({ open: false, id: null, name: '', audience: 'All', parentId: null })
function newFolder() { folderForm.value = { open: true, id: null, name: '', audience: currentFolder.value?.audience || 'All', parentId: current.value === RECENT ? null : current.value } }
function editFolder(f) { folderForm.value = { open: true, id: f.id, name: f.name, audience: f.audience, parentId: f.parentId } }
const currentFolder = computed(() => folders.value.find((f) => f.id === current.value) || null)
async function saveFolder() {
  const f = folderForm.value
  try {
    if (f.id) await api.updateFolder(f.id, { name: f.name, audience: f.audience }); else { const n = await api.createFolder({ name: f.name, audience: f.audience, parentId: f.parentId }); openFolder(n.id) }
    toast.success(f.id ? 'Folder updated' : 'Folder created'); folderForm.value.open = false
  } catch (e) { toast.error(e.message) }
}
function deleteFolder(f) {
  dialog.confirm({ title: `Delete folder "${f.name}"?`, message: 'Only an empty folder can be deleted.', confirmLabel: 'Delete', theme: 'red',
    onConfirm: async () => { try { await api.deleteFolder(f.id); if (current.value === f.id) openFolder(f.parentId); toast.success('Folder deleted') } catch (e) { toast.error(e.message) } } })
}
const folderMenu = (f) => [
  { label: 'Rename / Audience', icon: 'lucide-pencil', onClick: () => editFolder(f) },
  { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => deleteFolder(f) },
]
// folder choices with their path, for Upload and Move
const folderOptions = computed(() => treeAll().map(({ f, depth }) => ({ label: `${'  '.repeat(depth)}${pathText(f.id)}`, value: f.id })))
function treeAll() { const out = []; const walk = (p, d) => childrenOf(p).forEach((f) => { out.push({ f, depth: d }); walk(f.id, d + 1) }); walk(null, 0); return out }

// ---- Admin: upload (button or drop)
const up = ref({ open: false, folderId: null, items: [], busy: false })
const fileInput = ref(null)
function pickFiles() { fileInput.value?.click() }
function startUpload(fileList) {
  const list = [...fileList]; if (!list.length) return
  const folderId = current.value && current.value !== RECENT ? current.value : null
  const aud = folders.value.find((f) => f.id === folderId)?.audience || 'All'
  up.value = { open: true, folderId, busy: false, items: list.map((file) => ({ file, name: file.name, description: '', audience: aud, error: file.size > 10 * 1024 * 1024 ? 'Larger than 10 MB' : '' })) }
}
async function doUpload() {
  const u = up.value; if (!u.folderId) return toast.error('Choose a folder.')
  u.busy = true; let ok = 0
  for (const it of u.items.filter((x) => !x.error && !x.done)) {
    try { const f = await readFile(it.file); await api.uploadDoc({ folderId: u.folderId, name: it.name, description: it.description, audience: it.audience, data: f.data }); it.done = true; ok++ } catch (e) { it.error = e.message }
  }
  u.busy = false; await loadLibrary()
  if (ok) toast.success(`${ok} document(s) uploaded. They show in every DMS for ${audienceShort(u.items[0].audience).toLowerCase()}.`)
  if (u.items.every((x) => x.done || x.error)) { if (!u.items.some((x) => x.error && !x.done)) u.open = false; if (u.folderId !== current.value) openFolder(u.folderId) }
}
const dragging = ref(false); let dragDepth = 0
function onDragEnter(e) { if (!admin.value || !e.dataTransfer?.types?.includes('Files')) return; dragDepth++; dragging.value = true }
function onDragLeave() { if (--dragDepth <= 0) { dragDepth = 0; dragging.value = false } }
function onDrop(e) { dragDepth = 0; dragging.value = false; if (admin.value) startUpload(e.dataTransfer.files) }

// ---- Admin: edit / move / delete a document
const edit = ref({ open: false, id: null, name: '', description: '', audience: 'All', folderId: null })
function editDoc(d) { previewOpen.value = false; edit.value = { open: true, id: d.id, name: d.name, description: d.description, audience: d.audience, folderId: d.folderId } }
async function saveDoc() {
  const e = edit.value
  try { await api.updateDoc(e.id, { name: e.name, description: e.description, audience: e.audience, folderId: e.folderId }); toast.success('Document updated'); e.open = false } catch (err) { toast.error(err.message) }
}
function deleteDoc(d) {
  dialog.confirm({ title: `Delete "${d.name}"?`, message: 'It disappears from the Document Repository in every DMS. Copies already sent to clients stay in their chats.', confirmLabel: 'Delete', theme: 'red',
    onConfirm: async () => { try { await api.deleteDoc(d.id); toast.success('Document deleted') } catch (e) { toast.error(e.message) } } })
}
// Admin only (clicking the row already opens the preview, so nobody else needs a menu)
const docMenu = (d) => [
  { label: 'Edit / Move / Audience', icon: 'lucide-pencil', onClick: () => editDoc(d) },
  { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => deleteDoc(d) },
]

onMounted(loadLibrary)
watch(q, (v) => { if (v && current.value === RECENT) current.value = null })
const audTone = { B2C: 'bg-surface-blue-1 text-ink-blue-7', B2B: 'bg-surface-violet-1 text-ink-violet-7', All: 'bg-surface-gray-2 text-ink-gray-6' }
</script>
<template>
  <div class="flex h-full flex-col" @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave="onDragLeave" @drop.prevent="onDrop">
    <!-- header: breadcrumb + Admin actions -->
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b bg-surface-base px-5">
      <nav class="flex min-w-0 items-center gap-1.5 text-lg text-ink-gray-5" data-testid="docs-crumbs">
        <button class="truncate hover:text-ink-gray-8" :class="!crumbs.length && !searching && 'font-medium text-ink-gray-9'" @click="openFolder(null)">Document Repository</button>
        <template v-if="searching"><span class="text-ink-gray-4">/</span><span class="font-medium text-ink-gray-9">Search results</span></template>
        <template v-else v-for="(c, i) in crumbs" :key="c.id">
          <span class="text-ink-gray-4">/</span>
          <button class="truncate" :class="i === crumbs.length - 1 ? 'font-medium text-ink-gray-9' : 'hover:text-ink-gray-8'" @click="openFolder(c.id)">{{ c.name }}</button>
        </template>
        <!-- Admin: rename / delete the open folder right here -->
        <Dropdown v-if="admin && !searching && currentFolder" :options="folderMenu(currentFolder)">
          <Button variant="ghost" icon="lucide-ellipsis" aria-label="Folder actions" data-testid="folder-actions" />
        </Dropdown>
      </nav>
      <div v-if="admin" class="flex shrink-0 items-center gap-2">
        <Button label="New Folder" icon-left="lucide-folder-plus" data-testid="new-folder" @click="newFolder" />
        <Button variant="solid" label="Upload" icon-left="lucide-upload" data-testid="upload" @click="pickFiles" />
        <input ref="fileInput" type="file" multiple class="hidden" data-testid="upload-input" @change="startUpload($event.target.files); $event.target.value = ''" />
        <span class="mx-1 h-5 w-px bg-outline-gray-2" />
        <HeaderTools />
      </div>
      <HeaderTools v-if="!admin" />
    </header>

    <!-- toolbar -->
    <div class="flex shrink-0 items-center gap-2 border-b px-5 py-2.5">
      <TextInput v-model="q" class="w-80" placeholder="Search all documents: name, description, folder" data-testid="docs-search">
        <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
        <template v-if="q" #suffix><button class="lucide-x size-3.5 text-ink-gray-5 hover:text-ink-gray-8" @click="q = ''" /></template>
      </TextInput>
      <Dropdown :options="kindMenu"><Button :label="kind ? KIND_LABEL[kind] : 'All types'" icon-right="lucide-chevron-down" :variant="kind ? 'subtle' : 'outline'" /></Dropdown>
      <Dropdown v-if="admin" :options="audienceMenu"><Button :label="audience ? audienceShort(audience) : 'Every audience'" icon-right="lucide-chevron-down" :variant="audience ? 'subtle' : 'outline'" /></Dropdown>
      <div class="flex-1" />
      <span class="text-sm text-ink-gray-5" data-testid="docs-count">{{ [files.length && `${files.length} document${files.length === 1 ? '' : 's'}`, subfolders.length && `${subfolders.length} folder${subfolders.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ') }}</span>
      <Dropdown v-if="!searching && current !== '__recent'" :options="sortMenu"><Button icon-left="lucide-arrow-up-down" :label="{ name: 'Name', new: 'Newest', size: 'Size' }[sortBy]" /></Dropdown>
    </div>

    <div class="relative flex min-h-0 flex-1">
      <!-- folder tree -->
      <aside class="dms-scroll w-64 shrink-0 overflow-y-auto border-r bg-surface-gray-1 p-2" data-testid="docs-tree">
        <button class="flex h-8 w-full items-center gap-2 rounded-4 px-2 text-base" :class="current === null && !searching ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-7 hover:bg-surface-gray-2'" @click="openFolder(null)">
          <span class="lucide-library size-4" /><span class="flex-1 text-left">All folders</span>
        </button>
        <button class="flex h-8 w-full items-center gap-2 rounded-4 px-2 text-base" :class="current === RECENT && !searching ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-7 hover:bg-surface-gray-2'" data-testid="tree-recent" @click="openFolder(RECENT)">
          <span class="lucide-clock size-4" /><span class="flex-1 text-left">Recently added</span><span class="text-xs text-ink-gray-5">{{ recentCount }}</span>
        </button>
        <div class="my-2 h-px bg-outline-gray-1" />
        <div v-for="r in treeRows" :key="r.f.id" class="group flex h-8 items-center rounded-4 pr-1"
          :class="current === r.f.id && !searching ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-7 hover:bg-surface-gray-2'" :style="{ paddingLeft: `${4 + r.depth * 14}px` }">
          <button class="flex size-5 shrink-0 items-center justify-center text-ink-gray-5" :class="!r.hasKids && 'invisible'" @click="toggle(r.f.id)"><span :class="r.open ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-3.5" /></button>
          <button class="flex min-w-0 flex-1 items-center gap-2 text-left text-base" data-testid="tree-folder" @click="openFolder(r.f.id)">
            <span :class="current === r.f.id ? 'lucide-folder-open' : 'lucide-folder'" class="size-4 shrink-0 text-ink-amber-6" />
            <span class="truncate" :title="r.f.name">{{ r.f.name }}</span>
          </button>
          <span v-if="admin && r.f.audience !== 'All'" class="ml-1 shrink-0 rounded px-1 text-2xs font-medium" :class="audTone[r.f.audience]">{{ r.f.audience }}</span>
          <span class="ml-1 w-5 shrink-0 text-right text-xs text-ink-gray-5">{{ countIn(r.f.id) || '' }}</span>
        </div>
      </aside>

      <!-- contents -->
      <section class="dms-scroll min-w-0 flex-1 overflow-y-auto">
        <div v-if="library.error" class="m-5 rounded-4 bg-surface-red-1 p-3 text-base text-ink-red-7">{{ library.error }}</div>
        <div v-else-if="!library.loaded" class="p-10 text-center text-base text-ink-gray-5">Loading documents…</div>
        <template v-else>
          <div v-if="current === '__recent' && !searching" class="border-b bg-surface-gray-1 px-5 py-2 text-sm text-ink-gray-6">Documents added in the last {{ RECENT_DAYS }} days, newest first.</div>
          <table class="w-full table-fixed text-base">
            <thead class="sticky top-0 z-10 bg-surface-base text-left text-sm text-ink-gray-5">
              <tr class="border-b">
                <th class="py-2 pl-5 font-normal">Name</th>
                <th v-if="showPath" class="w-56 py-2 font-normal">Folder</th>
                <th class="w-24 py-2 font-normal">Size</th>
                <th class="w-44 py-2 font-normal">Added</th>
                <th v-if="admin" class="w-24 py-2 font-normal">Audience</th>
                <th class="py-2 pr-5" :class="admin ? 'w-[132px]' : 'w-[100px]'" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in subfolders" :key="f.id" class="group cursor-pointer border-b hover:bg-surface-gray-1" data-testid="folder-row" @click="openFolder(f.id)">
                <td class="py-2 pl-5"><div class="flex items-center gap-3"><DocIcon folder /><span class="truncate font-medium text-ink-gray-8">{{ f.name }}</span></div></td>
                <td v-if="showPath" />
                <td class="text-sm text-ink-gray-5">{{ countIn(f.id) }} file{{ countIn(f.id) === 1 ? '' : 's' }}</td>
                <td class="text-sm text-ink-gray-5">{{ fmtDate(f.createdAt) }}</td>
                <td v-if="admin"><span class="rounded px-1.5 py-0.5 text-xs" :class="audTone[f.audience]">{{ audienceShort(f.audience) }}</span></td>
                <td class="pr-5 text-right" @click.stop>
                  <Dropdown v-if="admin" :options="folderMenu(f)"><Button variant="ghost" icon="lucide-ellipsis" class="opacity-0 group-hover:opacity-100" /></Dropdown>
                </td>
              </tr>
              <tr v-for="d in files" :key="d.id" class="group cursor-pointer border-b hover:bg-surface-gray-1" data-testid="doc-row" @click="openPreview(d)">
                <td class="py-2 pl-5">
                  <div class="flex items-center gap-3">
                    <DocIcon :mime="d.mime" :name="d.name" />
                    <div class="min-w-0">
                      <div class="truncate text-ink-gray-9" :title="d.name">{{ d.name }}</div>
                      <div v-if="d.description" class="truncate text-sm text-ink-gray-5" :title="d.description">{{ d.description }}</div>
                    </div>
                  </div>
                </td>
                <td v-if="showPath" class="pr-3"><button class="max-w-full truncate text-sm text-ink-gray-6 hover:text-ink-gray-9 hover:underline" @click.stop="openFolder(d.folderId)">{{ pathText(d.folderId) }}</button></td>
                <td class="text-sm text-ink-gray-6">{{ fmtSize(d.size) }}</td>
                <td class="text-sm text-ink-gray-6"><div>{{ fmtDate(d.uploadedAt) }}</div><div class="truncate text-xs text-ink-gray-5">{{ d.uploadedBy?.name }}</div></td>
                <td v-if="admin"><span class="rounded px-1.5 py-0.5 text-xs" :class="audTone[d.audience]">{{ audienceShort(d.audience) }}</span></td>
                <td class="pr-5" @click.stop>
                  <div class="flex items-center justify-end gap-1">
                    <Tooltip :text="isCopied(d) ? 'Copied' : 'Copy'"><Button variant="ghost" :icon="isCopied(d) ? 'lucide-check' : 'lucide-copy'" :class="isCopied(d) && 'text-ink-green-6'" data-testid="doc-copy" @click="copy(d)" /></Tooltip>
                    <Tooltip text="Download"><Button variant="ghost" icon="lucide-download" data-testid="doc-download" @click="download(d)" /></Tooltip>
                    <Dropdown v-if="admin" :options="docMenu(d)"><Button variant="ghost" icon="lucide-ellipsis" /></Dropdown>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!files.length && !subfolders.length" class="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <span class="lucide-folder-search size-8 text-ink-gray-4" />
            <p class="text-base text-ink-gray-7">{{ searching ? 'No document matches your search' : current === '__recent' ? 'Nothing added in the last 30 days' : current ? 'This folder is empty' : 'No folders yet' }}</p>
            <p class="text-sm text-ink-gray-5">{{ searching ? 'Try fewer or different words; the search covers every folder.' : admin ? 'Drop files here or use Upload.' : '' }}</p>
          </div>
        </template>
      </section>

      <!-- drop zone (Admin) -->
      <div v-if="dragging" class="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-6 border-2 border-dashed border-outline-gray-4 bg-surface-base opacity-95">
        <span class="lucide-upload size-8 text-ink-gray-6" />
        <p class="text-lg font-medium text-ink-gray-8">Drop to upload{{ currentFolder ? ` to ${currentFolder.name}` : '' }}</p>
      </div>
    </div>

    <DocPreview v-model:open="previewOpen" :doc="preview" :admin="admin" @edit="editDoc" />

    <!-- New / edit folder -->
    <Dialog v-model:open="folderForm.open" :title="folderForm.id ? 'Edit folder' : 'New folder'" size="md">
      <div class="space-y-4">
        <p v-if="!folderForm.id" class="text-sm text-ink-gray-6">Inside: <b>{{ folderForm.parentId ? pathText(folderForm.parentId) : 'Document Repository (top level)' }}</b></p>
        <FormControl v-model="folderForm.name" label="Folder name" required placeholder="e.g. NFO Presentations" data-testid="folder-name" />
        <FormControl v-model="folderForm.audience" label="Who can see it" type="select" :options="AUDIENCE" />
        <p class="text-xs text-ink-gray-5">The folder and everything in it show only to this audience, in every DMS.</p>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2"><Button label="Cancel" @click="folderForm.open = false" /><Button variant="solid" :label="folderForm.id ? 'Save' : 'Create'" :disabled="!folderForm.name.trim()" data-testid="folder-save" @click="saveFolder" /></div>
      </template>
    </Dialog>

    <!-- Upload -->
    <Dialog v-model:open="up.open" title="Upload documents" size="2xl" :dismissible="!up.busy">
      <div class="space-y-4">
        <FormControl v-model="up.folderId" label="Folder" type="select" required :options="folderOptions" placeholder="Choose a folder" data-testid="upload-folder" />
        <div v-for="(it, i) in up.items" :key="i" class="space-y-2 rounded-4 border p-3" :class="it.done && 'opacity-60'">
          <div class="flex items-center gap-2">
            <DocIcon :mime="it.file.type" :name="it.file.name" size="sm" />
            <span class="text-sm text-ink-gray-6">{{ fmtSize(it.file.size) }}</span>
            <span v-if="it.done" class="lucide-check ml-auto size-4 text-ink-green-6" />
            <span v-else-if="it.error" class="ml-auto text-sm text-ink-red-6">{{ it.error }}</span>
            <button v-else class="lucide-x ml-auto size-4 text-ink-gray-5 hover:text-ink-gray-8" @click="up.items.splice(i, 1)" />
          </div>
          <div class="grid grid-cols-[1fr_200px] gap-2">
            <FormControl v-model="it.name" placeholder="Name shown to everyone" :disabled="it.done" data-testid="upload-name" />
            <FormControl v-model="it.audience" type="select" :options="AUDIENCE.map((a) => ({ ...a, label: audienceShort(a.value) }))" :disabled="it.done" />
          </div>
          <FormControl v-model="it.description" placeholder="Short description: what is it, when to send it (helps search)" :disabled="it.done" data-testid="upload-desc" />
        </div>
        <p class="text-xs text-ink-gray-5">Published once, shown in every DMS website of the chosen audience. Up to 10 MB a file.</p>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2"><Button label="Cancel" :disabled="up.busy" @click="up.open = false" /><Button variant="solid" :loading="up.busy" :label="`Upload ${up.items.filter((x) => !x.done && !x.error).length || ''}`" :disabled="!up.folderId || !up.items.some((x) => !x.done && !x.error)" data-testid="upload-save" @click="doUpload" /></div>
      </template>
    </Dialog>

    <!-- Edit document -->
    <Dialog v-model:open="edit.open" title="Edit document" size="lg">
      <div class="space-y-4">
        <FormControl v-model="edit.name" label="Name" required />
        <FormControl v-model="edit.description" label="Description" type="textarea" :rows="2" />
        <div class="grid grid-cols-2 gap-3">
          <FormControl v-model="edit.folderId" label="Folder" type="select" :options="folderOptions" />
          <FormControl v-model="edit.audience" label="Who can see it" type="select" :options="AUDIENCE" />
        </div>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2"><Button label="Cancel" @click="edit.open = false" /><Button variant="solid" label="Save" :disabled="!edit.name.trim()" @click="saveDoc" /></div>
      </template>
    </Dialog>
  </div>
</template>
