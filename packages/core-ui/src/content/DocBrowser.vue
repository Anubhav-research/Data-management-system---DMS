<script setup>
// Search the Document Repository or browse its folders and choose one document (emits `pick`). Used inside the
// DocPicker dialog (WhatsApp chat) and inline in the circular form (a dialog cannot open over another dialog).
import { ref, computed, onMounted } from 'vue'
import { TextInput } from 'frappe-ui'
import DocIcon from './DocIcon.vue'
import { library, loadLibrary, folderPath, fmtSize } from './hub.js'
import { timeAgo as timeAgoShort } from '../format.js'

const emit = defineEmits(['pick'])
const q = ref(''); const folder = ref(null)
onMounted(() => { if (!library.value.loaded) loadLibrary() })
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean))
const match = (d) => { const t = `${d.name} ${d.description}`.toLowerCase(); return words.value.every((w) => t.includes(w)) }
const subfolders = computed(() => (words.value.length ? [] : library.value.folders.filter((f) => f.parentId === folder.value).sort((a, b) => a.name.localeCompare(b.name))))
const docs = computed(() => {
  const all = library.value.docs
  const list = words.value.length ? all.filter(match) : folder.value ? all.filter((d) => d.folderId === folder.value) : [...all].sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 6)
  return words.value.length ? [...list].sort((a, b) => b.uploadedAt - a.uploadedAt) : list
})
const crumbs = computed(() => folderPath(folder.value))
function pick(d) { emit('pick', d) }
</script>
<template>
  <div class="space-y-3">
      <TextInput v-model="q" placeholder="Search documents by name or description" autofocus data-testid="picker-search">
        <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
      </TextInput>
      <div v-if="!words.length" class="flex items-center gap-1 text-sm text-ink-gray-6">
        <button class="hover:text-ink-gray-9" :class="!folder && 'font-medium text-ink-gray-9'" @click="folder = null">Document Repository</button>
        <template v-for="f in crumbs" :key="f.id"><span class="lucide-chevron-right size-3.5 text-ink-gray-4" /><button class="hover:text-ink-gray-9" @click="folder = f.id">{{ f.name }}</button></template>
      </div>
      <div class="dms-scroll max-h-[50vh] min-h-[240px] overflow-y-auto rounded-4 border">
        <button v-for="f in subfolders" :key="f.id" class="flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-surface-gray-1" @click="folder = f.id">
          <DocIcon folder size="sm" /><span class="flex-1 truncate text-base text-ink-gray-8">{{ f.name }}</span><span class="lucide-chevron-right size-4 text-ink-gray-4" />
        </button>
        <p v-if="!words.length && !folder && docs.length" class="bg-surface-gray-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-gray-5">Recently added</p>
        <button v-for="d in docs" :key="d.id" class="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-surface-gray-1" data-testid="picker-doc" @click="pick(d)">
          <DocIcon :mime="d.mime" :name="d.name" size="sm" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-ink-gray-8">{{ d.name }}</span>
            <span class="block truncate text-xs text-ink-gray-5">{{ folderPath(d.folderId).map((f) => f.name).join(' › ') }} · {{ fmtSize(d.size) }} · {{ timeAgoShort(d.uploadedAt) }}</span>
          </span>
        </button>
        <p v-if="!docs.length && !subfolders.length" class="px-3 py-10 text-center text-base text-ink-gray-5">{{ words.length ? 'No document matches your search.' : 'This folder is empty.' }}</p>
      </div>
  </div>
</template>
