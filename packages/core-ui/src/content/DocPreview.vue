<script setup>
// Preview of one document, without downloading it. Header: what it is (name, type, size, folder) and the actions as
// icons - Copy (paste in a client's WhatsApp or email in the DMS), Download, Edit (Admin), Close. Below, our own
// viewer (DocViewer) with only zoom, fit and rotate.
import { computed } from 'vue'
import { Dialog, Button, Tooltip, toast } from 'frappe-ui'
import DocIcon from './DocIcon.vue'
import DocViewer from './DocViewer.vue'
import { attachmentUrl } from './attach.js'
import { fileUrl, download, copyDoc, copiedDoc, kindOf, fmtSize, folderPath, audienceShort, KIND_LABEL, copiedToast } from './hub.js'

const props = defineProps({ doc: Object, admin: Boolean, sent: Boolean })
const emit = defineEmits(['edit'])
const open = defineModel('open', { type: Boolean })
const kind = computed(() => kindOf(props.doc?.mime, props.doc?.name))
const id = computed(() => props.doc?.docId || props.doc?.id)
const path = computed(() => folderPath(props.doc?.folderId).map((f) => f.name).join(' › '))
const copied = computed(() => copiedDoc.value?.docId === id.value)
// a file attached from the advisor's computer (attach.js): no Copy, it downloads from this website's back end
function save() { const a = document.createElement('a'); a.href = attachmentUrl(props.doc, { download: true }); a.download = props.doc.name; document.body.appendChild(a); a.click(); a.remove() }
async function copy() { const r = await copyDoc(props.doc); toast.success(copiedToast(props.doc, r)) }
</script>
<template>
  <Dialog v-model:open="open" size="5xl" bare>
    <div v-if="doc" class="flex h-[88vh] flex-col overflow-hidden rounded-[inherit]">
      <div class="flex items-center gap-3 border-b px-5 py-3">
        <DocIcon :mime="doc.mime" :name="doc.name" size="lg" />
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-lg font-semibold text-ink-gray-9" :title="doc.name" data-testid="preview-title">{{ doc.name }}</h3>
          <p class="truncate text-sm text-ink-gray-5" :title="doc.description || ''">
            {{ KIND_LABEL[kind] }} · {{ fmtSize(doc.size) }}<template v-if="path"> · {{ path }}</template><template v-if="admin && doc.audience"> · {{ audienceShort(doc.audience) }}</template><template v-if="doc.description"> — {{ doc.description }}</template>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Tooltip v-if="!doc.local" :text="copied ? 'Copied. Paste it in a client\'s WhatsApp or email in the DMS' : 'Copy'"><Button variant="ghost" :icon="copied ? 'lucide-check' : 'lucide-copy'" :class="copied && 'text-ink-green-6'" data-testid="preview-copy" @click="copy" /></Tooltip>
          <Tooltip text="Download"><Button variant="ghost" icon="lucide-download" data-testid="preview-download" @click="doc.local ? save() : download(doc)" /></Tooltip>
          <Tooltip v-if="admin" text="Edit"><Button variant="ghost" icon="lucide-pencil" @click="emit('edit', doc)" /></Tooltip>
          <span class="mx-1 h-5 w-px bg-outline-gray-2" />
          <Tooltip text="Close (Esc)"><Button variant="ghost" icon="lucide-x" data-testid="preview-close" @click="open = false" /></Tooltip>
        </div>
      </div>
      <DocViewer :key="id" :src="doc.local ? attachmentUrl(doc) : fileUrl(id, { sent })" :mime="doc.mime" :name="doc.name" />
    </div>
  </Dialog>
</template>
