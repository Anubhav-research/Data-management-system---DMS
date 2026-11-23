// Content Hub client (shared CODE for every DMS website): the Document Repository and Circulars live on ONE server
// (services/content), reached through each website's own /content proxy. Admin publishes once; every website shows it.
// Also the in-app "copied document": Copy in Documents, then paste in a client's WhatsApp chat in the DMS and send.
import { ref, computed } from 'vue'

let userOf = () => null // set by the website: () => ({ mhfId, name, role })
export function setContentUser(fn) { userOf = fn }

const header = () => {
  const u = userOf(); if (!u) return {}
  return { 'x-dms-user': btoa(unescape(encodeURIComponent(JSON.stringify(u)))) }
}
async function call(method, path, body) {
  const r = await fetch(`/content${path}`, { method, cache: 'no-store', headers: { ...header(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  let j = null; try { j = await r.json() } catch {}
  if (!r.ok) throw new Error(j?.error || (r.status === 504 || r.status === 502 ? 'The Content Hub is not reachable. Is "npm run dev:all" running?' : `Content Hub error (${r.status}).`))
  return j
}

// ---------------------------------------------------------------- state
export const library = ref({ folders: [], docs: [], team: '', site: '', admin: false, loaded: false, error: '' })
export const circulars = ref({ items: [], types: [], team: '', admin: false, loaded: false, error: '' })
// Market Updates (three a day) are not counted: the red count means "something important is new" (product owner, 18 Nov 2026)
export const unreadCirculars = computed(() => circulars.value.items.filter((c) => !c.read && c.type !== 'Market Update').length)

export async function loadLibrary() {
  try { library.value = { ...(await call('GET', '/library')), loaded: true, error: '' } } catch (e) { library.value = { ...library.value, loaded: true, error: e.message } }
}
export async function loadCirculars() {
  try { circulars.value = { ...(await call('GET', '/circulars')), loaded: true, error: '' } } catch (e) { circulars.value = { ...circulars.value, loaded: true, error: e.message } }
}
// Quizzes (team only): each person counts once per quiz. "New" = published in the last 30 days and not attempted yet.
export const quizzes = ref({ items: [], admin: false, team: '', loaded: false, error: '' })
export const newQuizzes = computed(() => (quizzes.value.admin ? 0 : quizzes.value.items.filter((q) => !q.mine && Date.now() - q.publishedAt <= 30 * 86400000).length)) // Admin publishes quizzes, does not take them
export async function loadQuizzes() {
  // forUser: whose list this is, so a switch of user never acts on the previous user's list
  const forUser = userOf()?.mhfId || null
  try { quizzes.value = { ...(await call('GET', '/quizzes')), loaded: true, error: '', forUser } } catch (e) { quizzes.value = { ...quizzes.value, loaded: true, error: e.message } }
}
export const quizApi = {
  publish: (b) => call('POST', '/quizzes', b).then(tap(loadQuizzes)),
  update: (id, b) => call('PATCH', `/quizzes/${id}`, b).then(tap(loadQuizzes)),
  remove: (id) => call('DELETE', `/quizzes/${id}`).then(tap(loadQuizzes)),
  roster: (takerRole, people) => call('POST', '/quizzes/roster', { takerRole, people }), // this website's quiz takers (Admin)
  attempt: async (id) => {
    const r = await call('POST', `/quizzes/${id}/attempt`)
    const q = quizzes.value.items.find((x) => x.id === id); if (q) { q.mine = r.mine; q.attemptCount = r.attemptCount }
    return r
  },
}

let timer = null
/** Circulars are checked every minute, so the sidebar count stays current. */
export function watchCirculars() { const both = () => { loadCirculars(); loadQuizzes() }; both(); clearInterval(timer); timer = setInterval(both, 60000) }

export const api = {
  createFolder: (b) => call('POST', '/folders', b).then(tap(loadLibrary)),
  updateFolder: (id, b) => call('PATCH', `/folders/${id}`, b).then(tap(loadLibrary)),
  deleteFolder: (id) => call('DELETE', `/folders/${id}`).then(tap(loadLibrary)),
  uploadDoc: (b) => call('POST', '/docs', b),
  updateDoc: (id, b) => call('PATCH', `/docs/${id}`, b).then(tap(loadLibrary)),
  deleteDoc: (id) => call('DELETE', `/docs/${id}`).then(tap(loadLibrary)),
  docSent: (id, clientRef) => call('POST', `/docs/${id}/sent`, { clientRef }).catch(() => {}),
  publishCircular: (b) => call('POST', '/circulars', b).then(tap(loadCirculars)),
  updateCircular: (id, b) => call('PATCH', `/circulars/${id}`, b).then(tap(loadCirculars)),
  deleteCircular: (id) => call('DELETE', `/circulars/${id}`).then(tap(loadCirculars)),
  markRead: (id) => {
    const c = circulars.value.items.find((x) => x.id === id); if (!c || c.read) return Promise.resolve()
    c.read = true; return call('POST', '/circulars/read', { id }).catch(() => {})
  },
  markAllRead: () => { circulars.value.items.forEach((c) => { c.read = true }); return call('POST', '/circulars/read', { all: true }).catch(() => {}) },
}
function tap(fn) { return (v) => { fn(); return v } }

// ---------------------------------------------------------------- files
export const fileUrl = (docId, { download = false, sent = false } = {}) => `/content/files/${docId}${download ? '?download=1' : sent ? '?sent=1' : ''}`
export function download(doc) {
  const a = document.createElement('a'); a.href = fileUrl(doc.docId || doc.id, { download: true }); a.download = doc.name; document.body.appendChild(a); a.click(); a.remove()
}
/** File -> { name, data (base64) } for upload. */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve({ name: file.name, data: String(r.result).split(',')[1] || '', size: file.size })
    r.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    r.readAsDataURL(file)
  })
}

export function kindOf(mime = '', name = '') {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (/word/.test(mime) || /\.docx?$/i.test(name)) return 'word'
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return 'sheet'
  if (/presentation|powerpoint/.test(mime) || /\.pptx?$/i.test(name)) return 'slides'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}
export const KIND_ICON = { image: 'lucide-image', pdf: 'lucide-file-text', word: 'lucide-file-type', sheet: 'lucide-file-spreadsheet', slides: 'lucide-presentation', video: 'lucide-file-video', file: 'lucide-file' }
export const KIND_COLOR = { image: 'text-ink-violet-6 bg-surface-violet-1', pdf: 'text-ink-red-6 bg-surface-red-1', word: 'text-ink-blue-6 bg-surface-blue-1', sheet: 'text-ink-green-6 bg-surface-green-1', slides: 'text-ink-amber-6 bg-surface-amber-1', video: 'text-ink-cyan-6 bg-surface-cyan-1', file: 'text-ink-gray-6 bg-surface-gray-2' }
export const KIND_LABEL = { image: 'Image', pdf: 'PDF', word: 'Word', sheet: 'Excel', slides: 'PowerPoint', video: 'Video', file: 'File' }
export function fmtSize(n) {
  if (!n) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
export const AUDIENCE = [
  { value: 'All', label: 'All teams (B2C and B2B)' },
  { value: 'B2C', label: 'B2C team only' },
  { value: 'B2B', label: 'B2B team only' },
]
export const audienceShort = (a) => (a === 'All' ? 'All teams' : `${a} only`)

/** Folder path of a folder id: [{id,name}, ...] from the top. */
export function folderPath(folderId, folders = library.value.folders) {
  const out = []
  for (let f = folders.find((x) => x.id === folderId); f; f = folders.find((x) => x.id === f.parentId)) out.unshift(f)
  return out
}

// ---------------------------------------------------------------- copied document (paste into a WhatsApp chat)
const KEY = 'mh-copied-doc'
const MARK = 'MH-DOC:'
let saved = null; try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch {}
export const copiedDoc = ref(saved)
/**
 * Copy a document: kept here for the WhatsApp chats of this website, and the computer clipboard gets a short marker
 * (so Ctrl+V in a DMS chat finds it). An image is also put on the clipboard as a picture, so it can be pasted anywhere.
 */
export async function copyDoc(doc) {
  const d = { docId: doc.docId || doc.id, name: doc.name, mime: doc.mime, size: doc.size, at: Date.now() }
  copiedDoc.value = d; try { sessionStorage.setItem(KEY, JSON.stringify(d)) } catch {}
  let image = false
  try {
    if (d.mime === 'image/png' && window.ClipboardItem) {
      const blob = await (await fetch(fileUrl(d.docId))).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': new Blob([`${MARK}${d.docId} ${d.name}`], { type: 'text/plain' }) })])
      image = true
    } else await navigator.clipboard.writeText(`${MARK}${d.docId} ${d.name}`)
  } catch {}
  return { image }
}
/** The toast after Copy: where it can be pasted. */
export function copiedToast(doc, { image } = {}) {
  return `"${doc.name}" copied. Paste it (Ctrl+V) in a client's WhatsApp or email in the DMS${image ? ', or as a picture anywhere' : ''}.`
}
export function clearCopied() { copiedDoc.value = null; try { sessionStorage.removeItem(KEY) } catch {} }
/** A paste in a DMS chat: the copied document when the clipboard holds its marker (or nothing else). */
export function docFromPaste(text) {
  const t = String(text || '').trim()
  if (t.startsWith(MARK)) { const id = t.slice(MARK.length).split(' ')[0]; return copiedDoc.value?.docId === id ? copiedDoc.value : { docId: id, name: t.slice(MARK.length + id.length + 1) } }
  return null
}
