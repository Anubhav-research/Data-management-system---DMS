<script setup>
// Small rich-text box for circulars: bold, italic, bullet / numbered list, link. Plain contenteditable, so it needs no
// editor library. Pasted content is reduced to plain text (no foreign styles in a circular), except tables.
// `images` (circulars, product owner 23 Nov 2026): a picture is part of the text, where the cursor is - pasted with
// Ctrl+V (a screenshot, or a picture copied from a website / Word), dropped on the box, or chosen with the toolbar.
// It is shrunk to at most 1400 px wide and kept inside the text, so the reader sees text, picture, text as written.
import { ref, onMounted, watch } from 'vue'
import { toast } from 'frappe-ui'
const model = defineModel({ type: String, default: '' })
// `bare`: no border or toolbar frame of its own (the email composer draws its own); `disabled`: read-only text
const props = defineProps({ placeholder: String, bare: Boolean, disabled: Boolean, toolbar: { type: Boolean, default: true }, minHeight: { type: String, default: '150px' },
  images: Boolean, maxHeight: { type: String, default: '18rem' } })
const el = ref(null)
const imgInput = ref(null)
const active = ref({})
const busy = ref(0)
onMounted(() => { el.value.innerHTML = model.value || '' })
watch(model, (v) => { if (el.value && v !== el.value.innerHTML) el.value.innerHTML = v || '' })
const sync = () => { model.value = el.value.innerText.trim() || el.value.querySelector('img') ? el.value.innerHTML : ''; state() }
function state() { active.value = Object.fromEntries(['bold', 'italic', 'insertUnorderedList', 'insertOrderedList'].map((c) => [c, document.queryCommandState(c)])) }
function cmd(c, v) { el.value.focus(); document.execCommand(c, false, v); sync() }
/** Put text (an emoji) where the cursor is; used by the email composer. */
function insert(text) { if (props.disabled) return; el.value.focus(); document.execCommand('insertText', false, text); sync() }
defineExpose({ insert, focus: () => el.value?.focus() })
function link() { const url = window.prompt('Link address (https://...)'); if (url) cmd('createLink', /^https?:\/\//.test(url) ? url : `https://${url}`) }

// ---------------------------------------------------------------- pictures
const MAX_W = 1400
const MAX_IN = 15 * 1024 * 1024
const readAsUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob) })
/** A picture file -> a data URL no wider than MAX_W (PNG stays PNG so screenshots of tables stay sharp; photos -> JPEG). */
async function shrink(file) {
  const src = await readAsUrl(file)
  if (/svg|gif/.test(file.type)) return src
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  const scale = Math.min(1, MAX_W / img.naturalWidth)
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  const png = c.toDataURL('image/png')
  const out = file.type === 'image/png' && png.length < 1.5e6 ? png : c.toDataURL('image/jpeg', 0.85)
  return out.length < src.length || scale < 1 ? out : src
}
/** Saved cursor position, so a picture chosen from the file dialog lands where the cursor was. */
let range = null
function keepRange() { const s = window.getSelection(); if (s.rangeCount && el.value.contains(s.anchorNode)) range = s.getRangeAt(0).cloneRange() }
function restoreRange() {
  el.value.focus()
  if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range) }
}
async function addImages(files) {
  const pics = [...files].filter((f) => f.type.startsWith('image/'))
  if (!pics.length) return false
  busy.value++
  try {
    for (const f of pics) {
      if (f.size > MAX_IN) { toast.error(`${f.name || 'The picture'} is larger than 15 MB.`); continue }
      const url = await shrink(f)
      restoreRange()
      document.execCommand('insertHTML', false, `<img src="${url}" alt="${(f.name || 'picture').replace(/["<>&]/g, '')}"><p><br></p>`)
      keepRange()
    }
  } catch { toast.error('This picture could not be read.') } finally { busy.value--; sync() }
  return true
}
function pickImages(e) { const files = [...e.target.files]; e.target.value = ''; addImages(files) }
function drop(e) {
  if (!props.images || !e.dataTransfer?.files?.length) return
  e.preventDefault()
  const pos = document.caretRangeFromPoint?.(e.clientX, e.clientY); if (pos) range = pos
  addImages(e.dataTransfer.files)
}

// A table pasted from Excel / Word stays a table (e.g. an FD rate card), cleaned of its styles; anything else is text.
const KEEP = new Set(['TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI'])
function clean(node) {
  for (const n of [...node.childNodes]) {
    if (n.nodeType === 3) continue
    if (n.nodeType !== 1 || /^(STYLE|SCRIPT|META|TITLE|XML)$/i.test(n.tagName)) { n.remove(); continue }
    clean(n)
    const pic = props.images && n.tagName === 'IMG' && /^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(n.getAttribute('src') || '')
    if (!KEEP.has(n.tagName) && !pic) { n.replaceWith(...n.childNodes); continue }
    for (const a of [...n.attributes]) if (!['colspan', 'rowspan', ...(pic ? ['src', 'alt'] : [])].includes(a.name)) n.removeAttribute(a.name)
  }
  return node
}
async function paste(e) {
  e.preventDefault()
  const cd = e.clipboardData
  const html = cd.getData('text/html')
  // a screenshot or a copied picture arrives as a file (a picture copied from a page may also bring its HTML)
  const files = props.images ? [...cd.items].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) : []
  if (files.length && !/<table/i.test(html) && !(html && cd.getData('text/plain').trim())) { keepRange(); await addImages(files); return }
  if (/<table/i.test(html) || (props.images && /<img/i.test(html))) {
    const body = clean(new DOMParser().parseFromString(html, 'text/html').body)
    const out = /<img/i.test(html) && props.images ? body.innerHTML : [...body.querySelectorAll('table')].map((t) => t.outerHTML).join('<p></p>')
    document.execCommand('insertHTML', false, out)
  } else document.execCommand('insertText', false, cd.getData('text/plain'))
  sync()
}
const TOOLS = [['bold', 'lucide-bold', 'Bold'], ['italic', 'lucide-italic', 'Italic'], ['insertUnorderedList', 'lucide-list', 'Bullet list'], ['insertOrderedList', 'lucide-list-ordered', 'Numbered list']]
</script>
<template>
  <div :class="bare ? 'flex flex-col-reverse' : 'rounded-4 border border-outline-gray-2 focus-within:border-outline-gray-4'">
    <div v-show="!disabled && toolbar" class="flex items-center gap-0.5 px-1.5 py-1" :class="!bare && 'border-b'">
      <button v-for="[c, icon, label] in TOOLS" :key="c" type="button" :title="label" class="flex size-7 items-center justify-center rounded text-ink-gray-6 hover:bg-surface-gray-2"
        :class="active[c] && 'bg-surface-gray-3 text-ink-gray-9'" @mousedown.prevent="cmd(c)"><span :class="icon" class="size-4" /></button>
      <span class="mx-1 h-4 w-px bg-outline-gray-2" />
      <button type="button" title="Link" class="flex size-7 items-center justify-center rounded text-ink-gray-6 hover:bg-surface-gray-2" @mousedown.prevent="link"><span class="lucide-link size-4" /></button>
      <template v-if="images">
        <button type="button" title="Insert picture (or paste one with Ctrl+V)" class="flex size-7 items-center justify-center rounded text-ink-gray-6 hover:bg-surface-gray-2" data-testid="rt-image"
          @mousedown.prevent="keepRange(); imgInput.click()"><span class="lucide-image size-4" /></button>
        <input ref="imgInput" type="file" accept="image/*" multiple class="hidden" data-testid="rt-image-file" @change="pickImages" />
        <span v-if="busy" class="ml-2 text-xs text-ink-gray-5">Adding picture…</span>
      </template>
    </div>
    <div ref="el" :contenteditable="!disabled" role="textbox" aria-multiline="true" :data-placeholder="placeholder"
      :style="{ minHeight, maxHeight }" class="dms-rich prose prose-sm dms-scroll max-w-none overflow-y-auto px-3 py-2 text-base outline-none" :class="disabled ? 'text-ink-gray-6' : 'text-ink-gray-8'"
      @input="sync" @keyup="state(); keepRange()" @mouseup="state(); keepRange()" @blur="keepRange" @paste="paste" @drop="drop" @dragover="images && $event.preventDefault()" />
  </div>
</template>
<style>
.dms-rich:empty::before { content: attr(data-placeholder); color: var(--ink-gray-4, #9ca3af); pointer-events: none; }
.dms-rich ul { list-style: disc; padding-left: 1.25rem; } .dms-rich ol { list-style: decimal; padding-left: 1.25rem; }
.dms-rich a { color: var(--ink-blue-6, #2563eb); text-decoration: underline; }
.dms-rich table { border-collapse: collapse; margin: 0.5rem 0; font-variant-numeric: tabular-nums; }
.dms-rich td, .dms-rich th { border: 1px solid var(--outline-gray-2, #e5e7eb); padding: 0.3rem 0.65rem; }
.dms-rich tr:first-child td, .dms-rich th { background: var(--surface-gray-1, #f8f8f8); font-weight: 600; }
.dms-rich img { display: block; max-width: 100%; height: auto; margin: 0.5rem 0; border-radius: 6px; border: 1px solid var(--outline-gray-1, #ededed); }
</style>
