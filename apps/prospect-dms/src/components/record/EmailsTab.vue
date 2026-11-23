<script setup>
// Emails tab, as Frappe CRM (product owner, 21 Nov 2026; D03 §4; D04 §14; MSG-006, MSG-007, MSG-012, MSG-013):
//   the thread  - every email, newest at the top, on a timeline: who (name <address>), when, subject, To / CC, the text,
//                 documents; Reply and Reply All on each one. Quoted earlier text shows as a quote.
//   the composer - a Reply bar at the bottom (no Comment: the DMS has no comments) opens it: TO, CC, BCC, SUBJECT, the
//                 text with our signature, then emoji, attach (computer or Document Repository) and email template;
//                 Discard / Send.
// DMS rules stay: To, CC and BCC = only the addresses saved on the family's members (a new one is added in Data,
// with approval); a template needs the 12-hour
// window after a Followup call; free text needs a client reply in the last 24 hours and the permission. A template's
// text cannot be changed. Copy a document in the Document Repository and Ctrl+V while writing attaches it.
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Button, Dialog, Dropdown, Popover, TextInput, Tooltip, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { sendEmail, messagingBlockReason, windowOpen, replyOpen, emailRecipients, staffEmail } from '@/services/calls'
import { clientName } from '@/services/lifecycle'
import { isAdmin } from '@/services/access'
import { openSettings } from '@/composables/settings'
import { timeAgo, fmtDateTime, fmtTimeShort, initials } from '@/utils/format'
import { safeHtml, textToHtml } from '@mh/core-ui/safeHtml.js'
import RichText from '@mh/core-ui/content/RichText.vue'
import { copiedDoc, docFromPaste, clearCopied, api as content, library, loadLibrary, fmtSize } from '@mh/core-ui/content/hub.js'
import DocIcon from '@mh/core-ui/content/DocIcon.vue'
import AttachMenu from '@mh/core-ui/content/AttachMenu.vue'
import DocPreview from '@mh/core-ui/content/DocPreview.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const list = computed(() => db.emails.filter((m) => m.clientId === props.client.id && m.at >= (props.since || 0)).sort((a, b) => b.at - a.at)) // newest at the top (product owner, 21 Nov 2026)
const people = computed(() => emailRecipients(props.client))
const clientAddrs = computed(() => people.value.client.map((x) => x.email))
const tplBlock = computed(() => messagingBlockReason(props.client, 'email', 'template'))
const customBlock = computed(() => messagingBlockReason(props.client, 'email', 'custom'))
const canCompose = computed(() => !props.readonly && props.client.stage !== 'Pool' && (!tplBlock.value || !customBlock.value))
const composeBlock = computed(() => (props.readonly ? 'View only' : props.client.stage === 'Pool' ? 'Pool records can only be called (POOL-006).' : tplBlock.value))

// ---------------------------------------------------------------- the thread
const nameOfAddr = (addr) => people.value.client.find((x) => x.email === addr)?.name || people.value.staff.find((x) => x.email === addr)?.name || addr
function who(m) {
  if (m.direction === 'Sent') { const u = db.userById(m.sentBy); return { name: u?.name || 'Money Honey', addr: m.from || staffEmail(u) } }
  return { name: nameOfAddr(m.email), addr: m.email }
}
const toOf = (m) => (m.direction === 'Sent' ? m.to || [m.email] : [m.from || staffEmail(db.userById(m.sentBy))].filter(Boolean))
const bodyHtml = (m) => safeHtml(m.html || textToHtml(m.body))
const byId = (id) => db.emails.find((x) => x.id === id)
const thread = ref(null)

// ---------------------------------------------------------------- the composer
const open = ref(false)
const blank = () => ({ to: [], cc: [], bcc: [], showCc: false, showBcc: false, subject: '', html: '', template: null, replyTo: null, quote: false })
const f = ref(blank())
const docs = ref([])
const error = ref('')
const editor = ref(null)
function start(m = null, all = false) {
  if (!canCompose.value) return
  const x = blank()
  if (m) {
    x.replyTo = m.id
    x.to = (m.direction === 'Received' ? [m.email] : m.to || [m.email]).filter((a) => clientAddrs.value.includes(a))
    if (all) x.cc = (m.cc || []).filter((a) => !x.to.includes(a) && clientAddrs.value.includes(a))
    x.showCc = x.cc.length > 0
    x.subject = /^re:/i.test(m.subject || '') ? m.subject : `Re: ${m.subject || ''}`
  } else { x.to = clientAddrs.value.slice(0, 1); x.subject = `${clientName(props.client)} (#${props.client.id})` }
  f.value = x; docs.value = []; error.value = ''; open.value = true
  nextTick(() => editor.value?.focus())
}
const replyingTo = computed(() => (f.value.replyTo ? byId(f.value.replyTo) : null))
const addOptions = (field) => {
  // To, CC and BCC: only the family's saved addresses (a new one is added in Data, with approval)
  return people.value.client.filter((p) => !f.value[field].includes(p.email)).map((p) => ({ label: `${p.name} <${p.email}>`, icon: p.staff ? 'lucide-building-2' : 'lucide-user', onClick: () => f.value[field].push(p.email) }))
}
const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.innerText.trim() }
const kind = computed(() => (f.value.template ? 'template' : 'custom'))
const kindBlock = computed(() => (f.value.template ? tplBlock.value : customBlock.value))
const locked = computed(() => !!f.value.template || !!customBlock.value) // a template's text is fixed; no free text without the permission / reply
const canSend = computed(() => f.value.to.length && f.value.subject.trim() && textOf(f.value.html) && !kindBlock.value)
const me = computed(() => db.me)
const signature = computed(() => '<p><br></p><p>Money Honey Financial Services</p>')

// templates
const tplOpen = ref(false); const tplQ = ref('')
const templates = computed(() => db.emailTemplates.filter((t) => t.enabled && `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(tplQ.value.toLowerCase().trim())))
function useTemplate(t) {
  if (tplBlock.value) return
  f.value.template = t.name; f.value.subject = t.subject; f.value.html = textToHtml(t.body.replace('{name}', props.client.members[0].first_name))
  tplOpen.value = false
}
function clearTemplate() { f.value.template = null; f.value.html = ''; if (f.value.replyTo) f.value.subject = `Re: ${(replyingTo.value?.subject || '').replace(/^re:\s*/i, '')}` }

// emoji
const EMOJI = ['🙂', '😊', '😀', '🙏', '👍', '👏', '🎉', '✅', '📈', '📉', '💰', '🏦', '📄', '📎', '📅', '⏰', '📞', '✉️', '🤝', '⭐', '❗', '❓', '💡', '🔔']

// documents: attach, or Ctrl+V of a copied one while writing
function attach(d) {
  const id = d.docId || d.id; if (docs.value.some((x) => x.docId === id)) return
  const lib = library.value.docs.find((x) => x.id === id)
  docs.value.push({ docId: id, name: d.name, mime: d.mime || lib?.mime, size: d.size || lib?.size, local: !!d.local })
}
function onPaste(e) { const d = docFromPaste(e.clipboardData?.getData('text')); if (d) { e.preventDefault(); e.stopPropagation(); attach(d) } }
watch(open, (v) => { window[v ? 'addEventListener' : 'removeEventListener']('paste', onPaste, true); if (v && !library.value.loaded) loadLibrary() })
onBeforeUnmount(() => window.removeEventListener('paste', onPaste, true))
const preview = ref(null); const previewOpen = ref(false)
function openDoc(d) { preview.value = { ...d, id: d.docId }; previewOpen.value = true }

function discard() { open.value = false; f.value = blank(); docs.value = [] }
function send() {
  error.value = ''
  if (!canSend.value) { error.value = kindBlock.value || 'To, subject and a message are needed.'; return }
  const q = replyingTo.value
  const quote = q ? `<blockquote><p>On ${fmtDateTime(q.at)}, ${who(q).name} wrote:</p>${bodyHtml(q)}</blockquote>` : ''
  const html = f.value.html + (f.value.template ? '' : signature.value) + quote
  try {
    sendEmail(props.client, f.value.to, { template: f.value.template, subject: f.value.subject.trim(), body: textOf(f.value.html), html, docs: docs.value, cc: f.value.cc, bcc: f.value.bcc, replyTo: f.value.replyTo }, kind.value)
    docs.value.forEach((d) => { if (!d.local) content.docSent(d.docId, props.client.id) }); if (docs.value.some((d) => d.docId === copiedDoc.value?.docId)) clearCopied()
    toast.success(docs.value.length ? `Email sent with ${docs.value.length} document${docs.value.length > 1 ? 's' : ''}` : 'Email sent')
    discard()
  } catch (e) { error.value = e.message }
}
const statusCls = { Sent: 'text-ink-gray-5', Delivered: 'text-ink-blue-6', Opened: 'text-ink-green-7', Bounced: 'text-ink-red-6', Received: 'text-ink-violet-6' }
const chip = 'inline-flex items-center gap-1 rounded-full bg-surface-gray-2 py-0.5 pl-2 pr-1 text-sm text-ink-gray-8'
const label = 'w-16 shrink-0 text-xs uppercase tracking-wide text-ink-gray-4'
</script>
<template>
  <div class="flex h-full min-h-[520px] flex-col">
    <div class="flex items-center justify-between px-5 pb-3 pt-5">
      <h3 class="text-lg font-semibold text-ink-gray-9">Emails</h3>
      <Tooltip :text="composeBlock || ''" :disabled="canCompose">
        <Button variant="solid" icon-left="lucide-plus" label="New Email" :disabled="!canCompose" data-testid="email-new" @click="start()" />
      </Tooltip>
    </div>
    <div v-if="client.stage === 'Pool'" class="mx-5 mb-3 rounded-4 bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-6">Pool records can only be called. Emails cannot be sent (POOL-006).</div>

    <!-- the thread -->
    <div class="dms-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">
      <div v-if="!list.length" class="flex flex-col items-center gap-2 py-16 text-center">
        <div class="rounded-full bg-surface-gray-2 p-3 text-ink-gray-5"><span class="lucide-mail size-6" /></div>
        <p class="text-base text-ink-gray-7">No emails yet</p>
      </div>
      <ol v-else ref="thread" class="relative space-y-4 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-outline-gray-2">
        <li v-for="m in list" :key="m.id" class="relative flex gap-3" data-testid="email-item">
          <span class="relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-surface-base" :class="m.direction === 'Sent' ? 'bg-surface-gray-3 text-ink-gray-7' : 'bg-surface-violet-2 text-ink-violet-7'">{{ initials(who(m).name) }}</span>
          <article class="min-w-0 flex-1 rounded-8 border bg-surface-base px-4 py-3 shadow-sm">
            <header class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate text-sm"><span class="font-medium text-ink-gray-9">{{ who(m).name }}</span> <span class="text-ink-gray-5">&lt;{{ who(m).addr }}&gt;</span></div>
                <div class="mt-0.5 truncate text-base text-ink-gray-9">{{ m.subject }}</div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <span class="mr-1 text-xs" :class="statusCls[m.status]">{{ m.direction === 'Received' ? 'Received' : m.status }}</span>
                <span class="mr-1 text-sm text-ink-gray-5" :title="fmtDateTime(m.at)">{{ timeAgo(m.at) }}</span>
                <Tooltip text="Reply"><Button variant="ghost" size="sm" icon="lucide-reply" :disabled="!canCompose" :data-testid="`email-reply-${m.id}`" @click="start(m)" /></Tooltip>
                <Tooltip text="Reply All"><Button variant="ghost" size="sm" icon="lucide-reply-all" :disabled="!canCompose" @click="start(m, true)" /></Tooltip>
              </div>
            </header>
            <div class="mt-1 text-sm text-ink-gray-6">To: <span class="text-ink-gray-8">{{ toOf(m).join(', ') }}</span><template v-if="m.cc?.length"> · CC: <span class="text-ink-gray-8">{{ m.cc.join(', ') }}</span></template></div>
            <div class="my-2.5 h-px bg-outline-gray-1" />
            <div class="dms-rich dms-email prose prose-sm max-w-none text-base text-ink-gray-8" v-html="bodyHtml(m)" />
            <div v-if="m.docs?.length" class="mt-3 flex flex-wrap gap-2">
              <button v-for="d in m.docs" :key="d.docId" type="button" class="flex max-w-xs items-center gap-2 rounded-6 border px-2 py-1.5 text-left hover:bg-surface-gray-1" @click="openDoc(d)">
                <DocIcon :mime="d.mime" :name="d.name" size="sm" /><span class="min-w-0"><span class="block truncate text-sm text-ink-gray-8">{{ d.name }}</span><span v-if="d.size" class="block text-2xs text-ink-gray-5">{{ fmtSize(d.size) }}</span></span>
              </button>
            </div>
          </article>
        </li>
      </ol>
    </div>

    <!-- the reply bar / composer (Frappe CRM style: TO / CC BCC / SUBJECT, the text, signature, then emoji · attach · template) -->
    <div class="sticky bottom-0 border-t bg-surface-base">
      <div class="flex items-center gap-2 px-5 py-2">
        <Tooltip :text="composeBlock || ''" :disabled="canCompose">
          <Button :variant="open ? 'subtle' : 'ghost'" icon-left="lucide-mail" label="Reply" :disabled="!canCompose" data-testid="email-reply-bar" @click="open ? null : start(list[0] || null)" />
        </Tooltip>
      </div>
      <div v-if="open" class="flex max-h-[70vh] flex-col border-t" data-testid="email-composer">
        <div class="dms-scroll min-h-0 flex-1 overflow-y-auto px-5">
          <!-- TO, with CC / BCC on the right -->
          <div class="flex items-start gap-3 py-2.5">
            <span :class="label" class="pt-1">To:</span>
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <span v-for="(a, i) in f.to" :key="a" :class="chip" :title="nameOfAddr(a)" data-testid="email-to-chip">{{ a }}<button type="button" class="rounded-full p-0.5 hover:bg-surface-gray-3" :aria-label="`Remove ${a}`" @click="f.to.splice(i, 1)"><span class="lucide-x size-3" /></button></span>
              <Dropdown v-if="addOptions('to').length" :options="addOptions('to')"><button type="button" class="h-6 rounded px-1 text-sm text-ink-gray-4 hover:text-ink-gray-7" data-testid="email-to-add">{{ f.to.length ? '+' : 'Add the client\'s address' }}</button></Dropdown>
              <span v-if="!clientAddrs.length" class="text-sm text-ink-gray-5">No email address saved on this record. Add one in Data (it needs approval).</span>
            </div>
            <div class="flex shrink-0 gap-3 pt-0.5 text-sm">
              <button type="button" :class="f.showCc ? 'font-medium text-ink-gray-8' : 'text-ink-gray-4 hover:text-ink-gray-7'" @click="f.showCc = !f.showCc">CC</button>
              <button type="button" :class="f.showBcc ? 'font-medium text-ink-gray-8' : 'text-ink-gray-4 hover:text-ink-gray-7'" @click="f.showBcc = !f.showBcc">BCC</button>
            </div>
          </div>
          <div v-for="k in ['cc', 'bcc'].filter((x) => f[x === 'cc' ? 'showCc' : 'showBcc'])" :key="k" class="flex items-start gap-3 pb-2.5">
            <span :class="label" class="pt-1">{{ k }}:</span>
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <span v-for="(a, i) in f[k]" :key="a" :class="chip" :title="nameOfAddr(a)">{{ a }}<button type="button" class="rounded-full p-0.5 hover:bg-surface-gray-3" @click="f[k].splice(i, 1)"><span class="lucide-x size-3" /></button></span>
              <Dropdown v-if="addOptions(k).length" :options="addOptions(k)"><button type="button" class="h-6 rounded px-1 text-sm text-ink-gray-4 hover:text-ink-gray-7">{{ f[k].length ? '+' : 'Add' }}</button></Dropdown>
            </div>
          </div>
          <!-- SUBJECT -->
          <div class="flex items-center gap-3 border-b pb-2.5">
            <span :class="label">Subject:</span>
            <input v-model="f.subject" :readonly="!!f.template" class="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:ring-0" placeholder="Subject" data-testid="email-subject" />
            <span v-if="f.template" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-gray-2 py-0.5 pl-2 pr-1 text-xs text-ink-gray-7" data-testid="email-template-chip" title="A template's text cannot be changed. Remove the template to write your own.">
              <span class="lucide-layout-template size-3" />{{ f.template }}<button type="button" class="rounded-full p-0.5 hover:bg-surface-gray-3" title="Remove the template" @click="clearTemplate"><span class="lucide-x size-3" /></button>
            </span>
          </div>
          <!-- the text, then the signature -->
          <div class="-mx-3">
            <RichText ref="editor" v-model="f.html" bare :toolbar="false" :disabled="locked" min-height="96px"
              :placeholder="customBlock && !f.template ? `Free text is off: ${customBlock} Insert an email template instead.` : ''" />
          </div>
          <p v-if="!f.template" class="pb-3 pt-4 text-base text-ink-gray-8" data-testid="email-signature">Money Honey Financial Services</p>
          <div v-if="replyingTo" class="pb-3">
            <button type="button" class="rounded-4 bg-surface-gray-2 px-2 text-xs text-ink-gray-6 hover:bg-surface-gray-3" :title="f.quote ? 'Hide the earlier email' : 'Show the earlier email'" @click="f.quote = !f.quote">···</button>
            <blockquote v-if="f.quote" class="mt-2 border-l-2 border-outline-gray-3 pl-3 text-sm italic text-ink-gray-6"><p class="not-italic text-xs text-ink-gray-5">On {{ fmtDateTime(replyingTo.at) }}, {{ who(replyingTo).name }} wrote:</p><div v-html="bodyHtml(replyingTo)" /></blockquote>
          </div>
          <!-- documents -->
          <div v-if="docs.length" class="flex flex-wrap gap-2 pb-3" data-testid="email-docs">
            <div v-for="(d, i) in docs" :key="d.docId" class="flex max-w-xs items-center gap-2 rounded-6 border bg-surface-gray-1 py-1 pl-1.5 pr-1" data-testid="email-doc">
              <DocIcon :mime="d.mime" :name="d.name" size="sm" />
              <span class="min-w-0"><span class="block truncate text-sm text-ink-gray-8">{{ d.name }}</span><span class="block text-2xs text-ink-gray-5">{{ fmtSize(d.size) }}</span></span>
              <Button variant="ghost" size="sm" icon="lucide-x" @click="docs.splice(i, 1)" />
            </div>
          </div>
          <p v-if="error" class="pb-2 text-sm text-ink-red-7" data-testid="email-error">{{ error }}</p>
        </div>
        <!-- emoji · attach a file · insert email template | Discard · Send -->
        <div class="flex items-center gap-0.5 border-t px-4 py-2">
          <Popover placement="top-start">
            <template #trigger><Tooltip text="Emoji"><Button variant="ghost" icon="lucide-smile" :disabled="locked" data-testid="email-emoji" /></Tooltip></template>
            <template #default="{ close }">
              <div class="grid w-64 grid-cols-8 gap-0.5 p-2">
                <button v-for="e in EMOJI" :key="e" type="button" class="flex size-7 items-center justify-center rounded text-lg hover:bg-surface-gray-2" @click="editor?.insert(e); close()">{{ e }}</button>
              </div>
            </template>
          </Popover>
          <AttachMenu :client-id="client.id" multiple tooltip="Attach a File" testid="email-attach" @pick="attach" />
          <Tooltip :text="tplBlock || 'Insert Email Template'"><Button variant="ghost" icon="lucide-layout-template" :disabled="!!tplBlock" data-testid="email-template-btn" @click="tplOpen = true" /></Tooltip>
          <div class="flex-1" />
          <Button label="Discard" @click="discard" />
          <Tooltip :text="kindBlock || ''" :disabled="!kindBlock"><Button class="ml-2" variant="solid" label="Send" :disabled="!canSend" data-testid="email-send" @click="send" /></Tooltip>
        </div>
      </div>
    </div>

    <!-- email templates -->
    <Dialog v-model:open="tplOpen" title="Email Templates" size="3xl">
      <div class="space-y-3" data-testid="email-templates">
        <div class="flex items-center gap-2">
          <TextInput v-model="tplQ" class="flex-1" placeholder="Search templates" autofocus>
            <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
          </TextInput>
          <Button v-if="isAdmin()" icon-left="lucide-plus" label="Create" @click="tplOpen = false; openSettings('templates')" />
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button v-for="t in templates" :key="t.id" type="button" class="flex h-44 flex-col rounded-8 border p-3 text-left transition-shadow hover:shadow-md" data-testid="email-template-card" @click="useTemplate(t)">
            <span class="truncate text-base font-medium text-ink-gray-9">{{ t.name }}</span>
            <span class="mt-2 border-t pt-2 text-sm text-ink-gray-6">Subject: {{ t.subject }}</span>
            <span class="mt-1 line-clamp-4 whitespace-pre-line text-sm text-ink-gray-5">{{ t.body.replace('{name}', client.members[0].first_name) }}</span>
          </button>
        </div>
        <p v-if="!templates.length" class="py-8 text-center text-sm text-ink-gray-5">No template matches.</p>
      </div>
    </Dialog>
    <DocPreview v-model:open="previewOpen" :doc="preview" sent />
  </div>
</template>
<style>
.dms-email blockquote { border-left: 2px solid var(--outline-gray-3, #d1d5db); padding-left: 0.75rem; color: var(--ink-gray-6, #6b7280); font-style: italic; margin: 0.5rem 0; }
.dms-email p { margin: 0.35rem 0; }
</style>
