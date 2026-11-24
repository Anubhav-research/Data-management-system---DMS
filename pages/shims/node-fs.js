// In-memory file system for the browser build of the services (GitHub Pages demo), saved to IndexedDB.
// The services keep using the same synchronous calls as on a server; the service worker loads every file before the
// services start (loadAll) and saves what changed after each request (flush).
import { Buffer } from './buffer.js'
import path from './node-path.js'

const files = new Map() // path -> Uint8Array
const dirs = new Set(['/'])
const dirty = new Set()
const norm = (p) => path.resolve(String(p))
const enoent = (p) => Object.assign(new Error(`ENOENT: no such file or directory, '${p}'`), { code: 'ENOENT' })
const bytes = (d) => (typeof d === 'string' ? Buffer.from(d) : d instanceof Uint8Array ? d : Buffer.from(String(d)))
function addDirs(p) { for (let d = path.dirname(p); !dirs.has(d); d = path.dirname(d)) dirs.add(d) }
function put(p, data) { addDirs(p); files.set(p, bytes(data)); dirty.add(p) }

const fs = {
  existsSync: (p) => { p = norm(p); return files.has(p) || dirs.has(p) },
  readFileSync(p, opt) {
    p = norm(p); const b = files.get(p); if (!b) throw enoent(p)
    const encoding = typeof opt === 'string' ? opt : opt?.encoding
    return encoding ? Buffer.from(b).toString(encoding === 'utf-8' ? 'utf8' : encoding) : Buffer.from(b)
  },
  writeFileSync: (p, data) => put(norm(p), data),
  appendFileSync(p, data) {
    p = norm(p); const old = files.get(p) || new Uint8Array(0)
    put(p, Buffer.concat([Buffer.from(old), Buffer.from(bytes(data))]))
  },
  mkdirSync(p) { p = norm(p); dirs.add(p); addDirs(p + '/x') },
  renameSync(a, b) { a = norm(a); b = norm(b); const d = files.get(a); if (!d) throw enoent(a); files.delete(a); dirty.add(a); put(b, d) },
  unlinkSync(p) { p = norm(p); if (!files.delete(p)) throw enoent(p); dirty.add(p) },
  copyFileSync(a, b) { a = norm(a); const d = files.get(a); if (!d) throw enoent(a); put(norm(b), new Uint8Array(d)) },
  rmSync(p) {
    p = norm(p)
    for (const f of [...files.keys()]) if (f === p || f.startsWith(p + '/')) { files.delete(f); dirty.add(f) }
    for (const d of [...dirs]) if (d === p || d.startsWith(p + '/')) dirs.delete(d)
  },
  statSync(p) {
    p = norm(p); const f = files.get(p)
    if (f) return { size: f.length, isFile: () => true, isDirectory: () => false, mtimeMs: 0 }
    if (dirs.has(p)) return { size: 0, isFile: () => false, isDirectory: () => true, mtimeMs: 0 }
    throw enoent(p)
  },
  readdirSync(p) {
    p = norm(p); const out = new Set()
    for (const f of [...files.keys(), ...dirs]) if (path.dirname(f) === p && f !== p) out.add(path.basename(f))
    return [...out]
  },
  // the services stream a stored file into the response: hand over the bytes in one piece
  createReadStream(p) { const data = fs.readFileSync(p); return { pipe(res) { res.end(data); return res } } },
}
export default fs

// ---------------------------------------------------------------- persistence (IndexedDB)
const DB = 'dms-demo-files'; const STORE = 'files'
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
})
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })

/** Loads every saved file into memory. Returns how many there were (0 = first visit). */
export async function loadAll() {
  const db = await open(); const tx = db.transaction(STORE, 'readonly'); const st = tx.objectStore(STORE)
  const [keys, vals] = await Promise.all([new Promise((r) => { const q = st.getAllKeys(); q.onsuccess = () => r(q.result) }), new Promise((r) => { const q = st.getAll(); q.onsuccess = () => r(q.result) })])
  files.clear(); dirs.clear(); dirs.add('/'); dirty.clear()
  keys.forEach((k, i) => { addDirs(k); files.set(k, new Uint8Array(vals[i])) })
  db.close(); return keys.length
}
/** Puts a whole set of files in place (the starting demo data) and marks them for saving. */
export function seedFiles(entries) { for (const [p, data] of entries) put(norm(p), data) }
/** Saves every file changed since the last save. */
export async function flush() {
  if (!dirty.size) return
  const list = [...dirty]; dirty.clear()
  const db = await open(); const tx = db.transaction(STORE, 'readwrite'); const st = tx.objectStore(STORE)
  for (const p of list) { const f = files.get(p); if (f) st.put(f, p); else st.delete(p) }
  await done(tx); db.close()
}
/** Forgets everything (Start over). */
export async function wipe() {
  files.clear(); dirs.clear(); dirs.add('/'); dirty.clear()
  const db = await open(); const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); await done(tx); db.close()
}
