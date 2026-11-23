<script setup>
// Documents tab (D03 §8; GEN-013; Fig 6525). Formerly "Attachments". Rows newest first; stays visible after
// Pool return (no fresh-view filtering). Demo: file contents live only in this browser session (metadata persisted).
import { ref, computed } from 'vue'
import { Button, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { timeAgo, fmtDateTime } from '@/utils/format'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const urls = ref({})
const input = ref(null)
const dragging = ref(false)
const showBox = ref(false)
const docs = computed(() => [...(props.client.documents || [])].sort((a, b) => b.at - a.at))
const canUpload = computed(() => !props.readonly && !['Junk', 'Unassigned'].includes(props.client.stage))
function size(b) { return b > 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${(b / 1024).toFixed(2)} KB` }
function add(files) {
  if (!props.client.documents) props.client.documents = []
  for (const f of files) {
    const id = db.nextId('DOC')
    urls.value[id] = URL.createObjectURL(f)
    props.client.documents.push({ id, name: f.name, size: f.size, at: Date.now(), by: db.sessionUserId })
    db.addActivity(props.client.id, 'document', `added ${f.name}`)
  }
  toast.success(files.length === 1 ? 'Document uploaded' : `${files.length} documents uploaded`)
  showBox.value = false
}
function onDrop(e) { dragging.value = false; if (e.dataTransfer?.files?.length) add([...e.dataTransfer.files]) }
function openDoc(d) { if (urls.value[d.id]) window.open(urls.value[d.id], '_blank'); else toast.info('Demo: file contents are kept only for this browser session.') }
const iconFor = (n) => (/\.(xlsx?|csv)$/i.test(n) ? 'lucide-file-spreadsheet' : /\.(png|jpe?g|gif)$/i.test(n) ? 'lucide-file-image' : 'lucide-file-text')
</script>
<template>
  <div class="p-5">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-semibold text-ink-gray-9">Documents</h3>
      <Button v-if="canUpload" variant="solid" icon-left="lucide-upload" label="Upload Documents" @click="showBox = !showBox" />
    </div>
    <div v-if="showBox" class="mb-5 flex flex-col items-center gap-2 rounded-6 border-2 border-dashed p-8 text-center text-sm text-ink-gray-6"
      :class="dragging ? 'border-outline-blue-3 bg-surface-blue-1' : 'border-outline-gray-2'" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
      <span class="lucide-cloud-upload size-6 text-ink-gray-5" />
      <span>Drag &amp; Drop files here or upload from <button class="font-medium text-ink-blue-link underline" @click="input.click()">Device</button></span>
      <input ref="input" type="file" multiple class="hidden" @change="(e) => e.target.files.length && add([...e.target.files])" />
    </div>
    <div v-if="!docs.length" class="flex flex-col items-center gap-2 py-16 text-center">
      <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-paperclip size-6" /></div>
      <p class="text-base text-ink-gray-7">No documents uploaded</p>
    </div>
    <div v-else class="divide-y rounded-6 border">
      <button v-for="d in docs" :key="d.id" class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-gray-1" @click="openDoc(d)">
        <span :class="iconFor(d.name)" class="size-5 text-ink-gray-5" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-base text-ink-gray-8">{{ d.name }}</div>
          <div class="text-sm text-ink-gray-5">{{ size(d.size) }}</div>
        </div>
        <span class="text-sm text-ink-gray-5" :title="fmtDateTime(d.at)">{{ db.userById(d.by)?.name.split(' ')[0] }} · {{ timeAgo(d.at) }}</span>
        <span class="lucide-external-link size-3.5 text-ink-gray-5" />
      </button>
    </div>
  </div>
</template>
