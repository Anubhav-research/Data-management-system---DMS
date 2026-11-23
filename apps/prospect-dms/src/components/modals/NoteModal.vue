<script setup>
// "Create Note" (Fig 7853/18703; D05 §2.5; NOTE-001, NOTE-003, NOTE-009).
// Contract: props { note|null, clientId|null }, v-model:open, emits 'saved'. Read-only for non-creators (NOTE-003).
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, toast } from 'frappe-ui'
import { Editor, EditorContent, EditorFixedMenu, RichTextKit, HeadingGroup, Bold, Italic, BulletList, OrderedList, AlignLeft, FontColor, InsertTable, Separator } from 'frappe-ui/editor'
import { useDb } from '@/stores/db'
import { createNote, updateNote } from '@/services/work'
import { clientName } from '@/services/lifecycle'
import { timeAgo } from '@/utils/format'

const props = defineProps({ note: { type: Object, default: null }, clientId: { type: String, default: null } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['saved'])
const db = useDb()
const title = ref('')
const content = ref('')
const error = ref('')
const editorKey = ref(0)
watch(open, (v) => {
  if (!v) return
  error.value = ''
  title.value = props.note?.title || ''
  content.value = props.note?.content || ''
  editorKey.value++
})
const readonly = computed(() => !!props.note && props.note.createdBy !== db.sessionUserId)
const linkedClient = computed(() => db.clientById(props.note?.clientId || props.clientId))
const toolbar = [HeadingGroup, Separator, Bold, Italic, FontColor, Separator, BulletList, OrderedList, AlignLeft, Separator, InsertTable]

function save() {
  error.value = ''
  try {
    if (props.note) { updateNote(props.note, { title: title.value, content: content.value }); toast.success('Note updated') }
    else { createNote({ title: title.value, content: content.value, clientId: props.clientId || null }); toast.success('Note created') }
    open.value = false
    emit('saved')
  } catch (e) { error.value = e.message }
}
</script>
<template>
  <Dialog v-model:open="open" :title="note ? (readonly ? 'Note' : 'Edit Note') : 'Create Note'" size="xl">
    <div class="space-y-3">
      <FormControl v-model="title" label="Title" required placeholder="Title" :disabled="readonly" />
      <div>
        <div class="mb-1.5 text-sm text-ink-gray-6">Content</div>
        <div class="rounded-4 border border-outline-gray-2">
          <Editor :key="editorKey" v-model="content" :extensions="[RichTextKit]" :editable="!readonly" placeholder="Write your note...">
            <template #default="{ editor }">
              <EditorFixedMenu v-if="!readonly" :editor="editor" :items="toolbar" class="border-b px-1 py-1" />
              <EditorContent :editor="editor" class="prose prose-sm max-h-72 min-h-[140px] max-w-none overflow-y-auto px-3 py-2" />
            </template>
          </Editor>
        </div>
      </div>
      <div v-if="note" class="text-xs text-ink-gray-5">
        By {{ db.userById(note.createdBy)?.name }} · updated {{ timeAgo(note.updatedAt) }}
        <span v-if="readonly"> · Read-only: only the creator can edit (NOTE-003)</span>
      </div>
      <div v-if="linkedClient" class="text-xs text-ink-gray-5">Client note: {{ clientName(linkedClient) }}</div>
      <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="readonly ? 'Close' : 'Cancel'" @click="open = false" />
        <Button v-if="!readonly" variant="solid" :label="note ? 'Update' : 'Create'" @click="save" />
      </div>
    </template>
  </Dialog>
</template>
