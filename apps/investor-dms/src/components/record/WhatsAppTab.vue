<script setup>
// WhatsApp tab (D03 §9; D04 §13; MSG-005..011; Fig 6789, 10750) - Frappe CRM layout: title, Send Template +
// New Message, the conversation, and a message box. Only numbers with "Is WhatsApp Number" ticked are used;
// one person and one number at a time, opening on whoever wrote last (product owner, 20 Nov 2026). Templates in the
// 12-hour window; free text within 24 h of a client reply with permission (MSG-007) - when blocked, the reason shows
// as a tooltip. Conversation is chat-style, oldest at top (OPEN_QUESTIONS E8).
// Documents (as in Prospect DMS, 17-20 Nov 2026): the paperclip attaches one from the computer or the Document
// Repository, or Copy in Documents and Ctrl+V in the box; then Send. The client gets the file itself on WhatsApp.
import { ref, computed, watch, nextTick } from 'vue'
import { Button, Popover, Dropdown, Tooltip, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { WA_TEMPLATES } from '@/data/masters'
import { waNumbers, sendWhatsApp, messagingBlockReason } from '@/services/calls'
import { fmtTimeShort, fmtDate } from '@/utils/format'
import { copiedDoc, docFromPaste, clearCopied, api as content, library, loadLibrary, fmtSize } from '@mh/core-ui/content/hub.js'
import DocIcon from '@mh/core-ui/content/DocIcon.vue'
import AttachMenu from '@mh/core-ui/content/AttachMenu.vue'
import DocPreview from '@mh/core-ui/content/DocPreview.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const numbers = computed(() => waNumbers(props.client))
const allMsgs = computed(() => db.wa.filter((m) => m.clientId === props.client.id && m.at >= (props.since || 0)).sort((a, b) => a.at - b.at))
// first choice: the number that wrote last (their reply opens the window), else the first number
function firstNumber() {
  const last = [...allMsgs.value].reverse().find((m) => m.direction === 'Received')
  return (last && numbers.value.find((n) => n.mobile === last.mobile)?.mobile) || numbers.value[0]?.mobile || ''
}
const selected = ref(firstNumber())
watch(numbers, (n) => { if (!n.some((x) => x.mobile === selected.value)) selected.value = firstNumber() })
const sel = computed(() => numbers.value.find((n) => n.mobile === selected.value))
const numberOptions = computed(() => numbers.value.map((n) => ({ label: `${n.name} +91 ${n.mobile}`, icon: n.mobile === selected.value ? 'lucide-check' : '', onClick: () => (selected.value = n.mobile) })))
const msgs = computed(() => allMsgs.value.filter((m) => !selected.value || m.mobile === selected.value))
const noNumber = computed(() => (numbers.value.length ? '' : 'No WhatsApp number on this record.'))
const tplBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'template')))
const customBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'custom')))
const docBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'document')))
const text = ref('')
const box = ref(null)
function sendTemplate(t, close) {
  try {
    sendWhatsApp(props.client, selected.value, { template: t.name, body: t.body.replace('{name}', props.client.members[0].first_name) }, 'template')
    toast.success('Template sent'); close?.()
  } catch (e) { toast.error(e.message); close?.() }
}
// a document waiting to be sent with the next message
const attached = ref(null)
const full = (d) => { const lib = library.value.docs.find((x) => x.id === d.docId); return lib ? { ...d, mime: lib.mime, size: lib.size } : d }
function attach(d) { attached.value = d.local ? { ...d } : full({ docId: d.docId || d.id, name: d.name, mime: d.mime, size: d.size }); nextTick(() => box.value?.focus()) }
function onPaste(e) { const d = docFromPaste(e.clipboardData?.getData('text')); if (d) { e.preventDefault(); attach(d) } }
// a document needs 'Send Documents'; a typed message (alone or with the document) needs 'Send Custom Message'
const canSend = computed(() => (attached.value ? !docBlock.value && (!text.value.trim() || !customBlock.value) : !customBlock.value && !!text.value.trim()))
const boxBlock = computed(() => (attached.value ? (customBlock.value ? 'Free text is off for you: the document is sent on its own.' : '') : customBlock.value))
// typing blocked but documents allowed: the box stays read-only (not disabled) so Ctrl+V of a copied document still works
const placeholder = computed(() => {
  if (attached.value) return boxBlock.value || 'Add a message (optional)...'
  if (customBlock.value && !docBlock.value) return 'Paste a copied document (Ctrl+V) or use the paperclip'
  return 'Type your message here...'
})
function sendText() {
  if (!canSend.value) return
  const doc = attached.value
  try {
    sendWhatsApp(props.client, selected.value, { body: text.value.trim(), doc }, 'custom')
    if (doc) { if (!doc.local) content.docSent(doc.docId, props.client.id); attached.value = null; if (copiedDoc.value?.docId === doc.docId) clearCopied(); toast.success(`"${doc.name}" sent on WhatsApp`) }
    text.value = ''
  } catch (e) { toast.error(e.message) }
}
const preview = ref(null); const previewOpen = ref(false)
function openDoc(d) { preview.value = { ...d, id: d.docId }; previewOpen.value = true }
if (!library.value.loaded) loadLibrary()
function newMessage() { nextTick(() => box.value?.focus()) }
// the box grows with the text (no scrollbar or resize handle); it scrolls only past ~5 lines
function grow() {
  const el = box.value; if (!el) return
  el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  el.style.overflowY = el.scrollHeight > el.clientHeight ? 'auto' : 'hidden'
}
watch(text, (v) => { if (!v) nextTick(grow) }) // shrink back after sending
const statusIcon = { Sent: 'lucide-check', Delivered: 'lucide-check-check', Read: 'lucide-check-check text-ink-blue-5', Failed: 'lucide-circle-x text-ink-red-5', 'Invalid Number': 'lucide-circle-x text-ink-red-5', 'Not on WhatsApp': 'lucide-circle-x text-ink-red-5' }
</script>
<template>
  <div class="flex h-full min-h-[520px] flex-col px-5 pb-3 pt-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold text-ink-gray-9">WhatsApp</h2>
        <Dropdown v-if="numbers.length > 1" :options="numberOptions">
          <Button variant="ghost" size="sm" icon-right="lucide-chevron-down" :label="sel ? `${sel.name} +91 ${sel.mobile}` : 'Select number'" data-testid="wa-party" />
        </Dropdown>
      </div>
      <div class="flex items-center gap-2">
        <Popover>
          <template #trigger>
            <Button label="Send Template" :tooltip="tplBlock || undefined" :disabled="!!tplBlock" />
          </template>
          <template #default="{ close }">
            <div class="w-80 p-1">
              <button v-for="t in WA_TEMPLATES" :key="t.name" class="w-full rounded-4 px-2 py-2 text-left hover:bg-surface-gray-2" @click="sendTemplate(t, close)">
                <div class="text-sm font-medium text-ink-gray-8">{{ t.name }}</div>
                <div class="line-clamp-2 text-xs text-ink-gray-5">{{ t.body }}</div>
              </button>
            </div>
          </template>
        </Popover>
        <Button variant="solid" label="New Message" icon-left="lucide-plus" :tooltip="customBlock || undefined" :disabled="!!customBlock" @click="newMessage" />
      </div>
    </div>

    <div class="dms-scroll flex-1 space-y-2 overflow-y-auto py-2">
      <div v-if="!msgs.length" class="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
        <span class="icon-whatsapp size-8" />
        <p class="text-base text-ink-gray-7">No WhatsApp Messages Found</p>
        <p class="text-sm text-ink-gray-5">Start a conversation now!</p>
      </div>
      <div v-for="m in msgs" :key="m.id" class="flex" :class="m.direction === 'Sent' ? 'justify-end' : 'justify-start'">
        <div class="max-w-[70%] rounded-6 px-3 py-2 text-sm shadow-sm" :class="m.direction === 'Sent' ? 'bg-dms-wasent text-ink-gray-8' : 'border bg-surface-base text-ink-gray-8'">
          <div v-if="m.template" class="mb-0.5 text-2xs font-medium uppercase tracking-wide text-ink-gray-5">Template · {{ m.template }}</div>
          <button v-if="m.doc" type="button" class="mb-1 flex w-64 max-w-full items-center gap-2.5 rounded-4 bg-surface-base p-2 text-left ring-1 ring-outline-gray-2 hover:ring-outline-gray-3" data-testid="wa-doc" @click="openDoc(m.doc)">
            <DocIcon :mime="m.doc.mime" :name="m.doc.name" />
            <span class="min-w-0"><span class="block truncate text-sm font-medium text-ink-gray-8">{{ m.doc.name }}</span><span class="block text-xs text-ink-gray-5">{{ fmtSize(m.doc.size) }} · Document</span></span>
          </button>
          <div v-if="m.body" class="whitespace-pre-line">{{ m.body }}</div>
          <div class="mt-1 flex items-center justify-end gap-1 text-2xs text-ink-gray-5">
            {{ fmtDate(m.at) }} {{ fmtTimeShort(m.at) }}
            <template v-if="m.direction === 'Sent'"><span :class="statusIcon[m.status]" class="size-3" /><span>{{ m.status }}</span></template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="attached" class="mt-2 flex items-center gap-2.5 rounded-4 bg-surface-gray-2 p-2" data-testid="wa-attached">
      <DocIcon :mime="attached.mime" :name="attached.name" />
      <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium text-ink-gray-8">{{ attached.name }}</span><span class="block text-xs text-ink-gray-5">{{ fmtSize(attached.size) }} · {{ customBlock ? 'ready to send' : 'add a message below (optional), then send' }}</span></span>
      <Button variant="ghost" icon="lucide-x" @click="attached = null" />
    </div>
    <div class="mt-2 flex items-center gap-2">
      <AttachMenu :client-id="client.id" :disabled="!!docBlock" :tooltip="docBlock || 'Attach a file'" testid="wa-attach" @pick="attach" />
      <div class="min-w-0 flex-1"><Tooltip :text="boxBlock || undefined" :disabled="!boxBlock || !docBlock">
        <textarea ref="box" v-model="text" rows="1" :disabled="!!boxBlock && !!docBlock" :readonly="!!boxBlock" :placeholder="placeholder" data-testid="wa-box"
          class="max-h-32 w-full resize-none overflow-hidden rounded-4 border-0 bg-surface-gray-2 px-2.5 py-1.5 text-base placeholder:text-ink-gray-4 focus:bg-surface-base focus:ring-1 focus:ring-outline-gray-3 disabled:cursor-not-allowed"
          @input="grow" @paste="onPaste" @keydown.enter.exact.prevent="sendText" />
      </Tooltip></div>
      <Button variant="solid" icon="lucide-send-horizontal" :disabled="!canSend" data-testid="wa-send" @click="sendText" />
    </div>
    <DocPreview v-model:open="previewOpen" :doc="preview" sent />
  </div>
</template>
