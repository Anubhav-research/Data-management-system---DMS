<script setup>
// WhatsApp tab (D03 §9; D04 §13; MSG-005..011; Fig 6789, 10750) - Frappe CRM layout: title, Send Template +
// New Message, the conversation, and a message box. Only numbers with "Is WhatsApp Number" ticked are used;
// a number picker appears only when the client has more than one. Templates in the 12-hour window; free text
// within 24 h of a client reply with permission (MSG-007) - when blocked, the reason shows as a tooltip.
// Conversation is chat-style, oldest at top (OPEN_QUESTIONS E8).
// One person and one number at a time (product owner, 20 Nov 2026: no "All members", no multi-select). It opens on
// whoever wrote last. Investor Family: an investor's chat stays visible (view only); messages can be sent only to
// members who are not investors (an investor's number is removed from Prospect DMS at conversion, so their earlier
// chat is matched by the memberKey written on each message at that moment). Product owner, 13 Nov 2026.
import { ref, computed, watch, nextTick } from 'vue'
import { Button, Popover, Tooltip, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { WA_TEMPLATES } from '@/data/masters'
import { waNumbers, sendWhatsApp, messagingBlockReason } from '@/services/calls'
import { fmtTimeShort, fmtDate } from '@/utils/format'
import { fullName } from '@/services/lifecycle'
import { isInvestorMember, normalize } from '@/services/family'
// Documents: the paperclip attaches one from the computer or the Document Repository (20 Nov 2026), or Copy in Documents and paste here (Ctrl+V), then Send.
// The client gets the file itself on WhatsApp; nobody downloads it (product owner, 17 Nov 2026).
import { copiedDoc, docFromPaste, clearCopied, api as content, library, loadLibrary, fmtSize } from '@mh/core-ui/content/hub.js'
import DocIcon from '@mh/core-ui/content/DocIcon.vue'
import AttachMenu from '@mh/core-ui/content/AttachMenu.vue'
import DocPreview from '@mh/core-ui/content/DocPreview.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const numbers = computed(() => waNumbers(props.client)) // numbers that can be messaged (non-investors)
const allMsgs = computed(() => db.wa.filter((m) => m.clientId === props.client.id && m.at >= (props.since || 0)).sort((a, b) => a.at - b.at))
// which member a message belongs to: the key written on it, else the member who holds that number now
const keyByMobile = computed(() => Object.fromEntries(props.client.members.flatMap((mem) => (mem.contacts || []).map((x) => [normalize(x.mobile), mem.key]))))
const memberOf = (m) => m.memberKey || keyByMobile.value[normalize(m.mobile)] || null
const investors = computed(() => props.client.members.filter(isInvestorMember))
// conversations: All members, each number that can be messaged, each investor (view only)
const parties = computed(() => [
  ...numbers.value.map((n) => ({ id: `n:${n.mobile}`, label: `${n.name} +91 ${n.mobile}`, name: n.name, mobile: n.mobile })),
  ...investors.value.map((mem) => ({ id: `k:${mem.key}`, label: fullName(mem), name: fullName(mem), key: mem.key, investor: true })),
])
const many = computed(() => parties.value.length > 1)
// first choice: the person who wrote last (their reply opens the window), else the first number that can be messaged
function firstParty() {
  const last = [...allMsgs.value].reverse().find((m) => m.direction === 'Received')
  const p = last && (parties.value.find((x) => x.mobile && x.mobile === last.mobile) || parties.value.find((x) => x.key && x.key === memberOf(last)))
  return (p || parties.value.find((x) => !x.investor) || parties.value[0])?.id || ''
}
const selected = ref(firstParty())
watch(parties, (p) => { if (!p.some((x) => x.id === selected.value)) selected.value = firstParty() })
const sel = computed(() => parties.value.find((p) => p.id === selected.value))
const msgs = computed(() => {
  const p = sel.value
  if (!p) return allMsgs.value
  return allMsgs.value.filter((m) => (p.mobile ? m.mobile === p.mobile : memberOf(m) === p.key))
})
// where a message goes: the chosen number
const sendTo = computed(() => sel.value?.mobile || '')
const noNumber = computed(() => {
  if (sendTo.value) return ''
  if (!numbers.value.length) return investors.value.length ? 'Everyone with WhatsApp here is an investor. Message them from Investor DMS.' : 'No WhatsApp number on this record.'
  if (sel.value?.investor) return `${sel.value.name} is an investor. Message them from Investor DMS.`
  return 'Choose a number to message.'
})
const tplBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'template')))
const customBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'custom')))
const docBlock = computed(() => (props.readonly ? 'View only' : noNumber.value || messagingBlockReason(props.client, 'wa', 'document')))
const text = ref('')
const box = ref(null)
function sendTemplate(t, close) {
  try {
    sendWhatsApp(props.client, sendTo.value, { template: t.name, body: t.body.replace('{name}', props.client.members[0].first_name) }, 'template')
    toast.success('Template sent'); close?.()
  } catch (e) { toast.error(e.message); close?.() }
}
const attached = ref(null) // document waiting to be sent with the next message
const full = (d) => ({ ...d, ...(library.value.docs.find((x) => x.id === d.docId) ? { mime: library.value.docs.find((x) => x.id === d.docId).mime, size: library.value.docs.find((x) => x.id === d.docId).size } : {}) })
function attach(d) { attached.value = d.local ? { ...d } : full({ docId: d.docId || d.id, name: d.name, mime: d.mime, size: d.size }); nextTick(() => box.value?.focus()) }
function onPaste(e) {
  const d = docFromPaste(e.clipboardData?.getData('text'))
  if (d) { e.preventDefault(); attach(d) }
}
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
    sendWhatsApp(props.client, sendTo.value, { body: text.value.trim(), doc }, 'custom')
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
        <Popover v-if="many" placement="bottom-start">
          <template #trigger>
            <Button variant="ghost" size="sm" icon-right="lucide-chevron-down" :label="sel?.label" data-testid="wa-party" />
          </template>
          <template #default="{ close }">
            <div class="w-72 p-1">
              <button v-for="p in parties" :key="p.id" type="button" class="flex min-h-8 w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-base hover:bg-surface-gray-3" :class="p.investor ? 'text-ink-gray-6' : 'text-ink-gray-8'" @click="selected = p.id; close()">
                <span class="min-w-0">
                  <span class="block truncate">{{ p.label }}</span>
                  <span v-if="p.investor" class="block text-xs text-ink-gray-5">Investor · view only</span>
                </span>
                <span v-if="selected === p.id" class="lucide-check size-3.5 shrink-0 text-ink-gray-6" />
              </button>
            </div>
          </template>
        </Popover>
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
        <p class="text-sm text-ink-gray-5">{{ client.stage === 'Pool' ? 'Pool records can only be called (POOL-006).' : 'Start a conversation now!' }}</p>
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
