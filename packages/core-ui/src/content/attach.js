// Attachments for a client's WhatsApp / email (product owner, 20 Nov 2026): from the Document Repository (Content
// Hub, company content) or from the advisor's computer. A file from the computer is client data, so it goes to this
// website's own back end (/api/files), never to the Content Hub. Both come back in the same shape:
//   { docId, name, mime, size, local }   (local: true = from the computer)
import { readFile, fileUrl } from './hub.js'

export const MAX_ATTACH = 10 * 1024 * 1024

export async function uploadFromComputer(file, clientId) {
  if (!file.size) throw new Error(`${file.name} is empty.`)
  if (file.size > MAX_ATTACH) throw new Error(`${file.name} is larger than 10 MB.`)
  const { data } = await readFile(file)
  const r = await fetch('/api/files', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, mime: file.type, data, clientId }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Could not upload ${file.name}.`)
  return { docId: j.id, name: j.name, mime: j.mime, size: j.size, local: true }
}

/** Where an attachment can be opened (preview) or downloaded. */
export const attachmentUrl = (d, { download = false } = {}) =>
  d.local ? `/api/files/${d.docId}${download ? '?download=1' : ''}` : fileUrl(d.docId, { download, sent: !download })
