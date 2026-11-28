// Server-state sync client (shared CODE; each website talks only to its OWN /api through its own Vite proxy).
// - load:   GET /api/state on start; if the database is empty, the website writes its fresh seed (first writer wins)
// - save:   debounced PUT /api/state with an optimistic version; 409 = someone else saved first -> reload + message
// - poll:   GET /api/state/version every 10 s; reload when it changed and this tab has no unsaved edits
// Per-tab overlays (signed-in user, active call, ...) are never sent to the server.
// "Unsaved" is decided by comparing with the last copy loaded from / saved to the server, so no change can slip
// through between a reload and the next edit. The copy is built record by record (see tracker below).
import { nextTick, watch, effectScope, toRaw, ref } from 'vue'

const json = async (r) => { try { return await r.json() } catch { return null } }

/** Goes up by one on every change to the shared data (any record, any list). A page that reads the plain data
 *  for speed (the dashboard) reads this to know when to work its figures out again. */
export const dataVersion = ref(0)

export async function bootState(freshState) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch('/api/state', { cache: 'no-store' })
    if (!r.ok) throw new Error(`The website's server did not answer (${r.status}). Is "npm run dev:all" running?`)
    const { version, state } = await r.json()
    if (state) return { version, state }
    const seed = freshState()
    const put = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version, state: seed, savedBy: 'seed' }) })
    if (put.ok) return { version: (await put.json()).version, state: seed }
    // 409: another browser seeded at the same moment - load theirs
  }
  throw new Error('Could not load the database.')
}

/**
 * Change tracking and text for the whole state, record by record (25 Nov 2026, demo data at real volume: one watcher
 * on the whole state re-read all of it, and the whole state was turned into text again, on every edit and poll).
 * - every record (object) in a top-level list has its own watcher; an edit re-reads only that record and drops only
 *   its cached text (synchronously, so a save right after an edit always has it).
 * - lists are re-checked once per tick for records added or removed; other top-level values are watched whole.
 * - text() gives the same JSON as JSON.stringify(state without the local keys), built from the current lists, using
 *   cached text only for records whose watcher exists (a record added a moment ago is always written fresh).
 * - the record watchers are set up in small slices in the background, so the website opens without waiting for tens
 *   of thousands of them. Until all are set up, a check every 2 s compares the data with the last copy, so an edit to
 *   a record not watched yet is still saved.
 */
function tracker(store, localKeys, onChange) {
  const scope = effectScope(true)
  const isRec = (x) => x !== null && typeof x === 'object'
  const recText = new WeakMap() // plain record -> its JSON text
  const recStop = new Map() // plain record -> stop its watcher
  const members = new Map() // list key -> Set of its plain records
  const keyText = new Map() // top-level non-list key -> JSON text
  const keyStop = new Map() // top-level key -> stop its watcher

  // ---- record watchers, set up in the background
  const pending = [] // { k, raw, i }: a list whose records from position i still need a watcher
  let pumping = false
  let safety = null; let seen = null
  const BIG = 200 // more records than this waiting: keep the 2 s safety check running until they are watched
  function watchRecord(r, proxy) { recStop.set(r, scope.run(() => watch(proxy, () => { recText.delete(r); onChange() }, { deep: true, flush: 'sync' }))) }
  function step() {
    const end = performance.now() + 25
    while (pending.length && performance.now() < end) {
      const job = pending[0]; const list = store.$state[job.k]; const raw = toRaw(list)
      if (raw !== job.raw) { pending.shift(); continue } // the list was replaced; its new contents have their own job
      for (; job.i < raw.length && performance.now() < end; job.i++) { const r = raw[job.i]; if (isRec(r) && !recStop.has(r)) watchRecord(r, list[job.i]) }
      if (job.i >= raw.length) pending.shift()
    }
    if (pending.length) setTimeout(step, 0)
    else { pumping = false; clearInterval(safety); safety = null }
  }
  function queue(k, raw, missing) {
    if (!missing) return
    pending.push({ k, raw, i: 0 })
    if (missing > BIG && !safety) {
      seen = null // set by the next text() (at start: the copy the server holds)
      safety = setInterval(() => { const t = text(); if (t !== seen) { seen = t; onChange() } }, 2000)
    }
    if (!pumping) { pumping = true; setTimeout(step, 0) }
  }

  function reconcile(k) {
    const list = store.$state[k]; const now = new Set(); let missing = 0
    const raw = Array.isArray(list) ? toRaw(list) : null
    if (raw) for (const r of raw) if (isRec(r)) { now.add(r); if (!recStop.has(r)) missing++ }
    const before = members.get(k) || new Set(); members.set(k, now)
    for (const r of before) if (!now.has(r) && ![...members.values()].some((m) => m.has(r))) { recStop.get(r)?.(); recStop.delete(r); recText.delete(r) }
    if (raw) queue(k, raw, missing)
  }
  function unwatchKey(k) { keyStop.get(k)?.(); keyStop.delete(k); keyText.delete(k); if (members.has(k)) { members.set(k, new Set()); reconcile(k); members.delete(k) } }
  function watchKey(k) {
    if (Array.isArray(toRaw(store.$state)[k])) {
      keyStop.set(k, scope.run(() => watch(() => store.$state[k], () => { reconcile(k); onChange() }, { deep: 1 })))
      reconcile(k)
    } else {
      keyStop.set(k, scope.run(() => watch(() => store.$state[k], () => { keyText.delete(k); onChange() }, { deep: true, flush: 'sync' })))
    }
  }
  function syncKeys() {
    const raw = toRaw(store.$state); const keys = Object.keys(raw).filter((k) => !localKeys.includes(k))
    for (const k of [...keyStop.keys()]) if (!keys.includes(k) || members.has(k) !== Array.isArray(raw[k])) unwatchKey(k)
    for (const k of keys) if (!keyStop.has(k)) watchKey(k)
  }
  // top-level keys added, removed, or a list replaced by something else (a reload from the server can do that)
  scope.run(() => watch(() => Object.keys(store.$state).map((k) => `${k}:${Array.isArray(store.$state[k])}`).join(','), () => { syncKeys(); onChange() }))

  function text() {
    const raw = toRaw(store.$state); const parts = []
    for (const k of Object.keys(raw)) {
      if (localKeys.includes(k)) continue
      const v = raw[k]; let t
      if (Array.isArray(v)) {
        const items = new Array(v.length)
        for (let i = 0; i < v.length; i++) {
          const r = v[i]
          if (!isRec(r)) { const x = JSON.stringify(r); items[i] = x === undefined ? 'null' : x; continue }
          let x = recText.get(r)
          if (x === undefined) { x = JSON.stringify(r); if (recStop.has(r)) recText.set(r, x) }
          items[i] = x
        }
        t = `[${items.join(',')}]`
      } else {
        t = keyText.get(k)
        if (t === undefined) { t = JSON.stringify(v); if (t !== undefined && keyStop.has(k)) keyText.set(k, t) }
      }
      if (t !== undefined) parts.push(`${JSON.stringify(k)}:${t}`)
    }
    const out = `{${parts.join(',')}}`
    if (safety && seen === null) seen = out
    return out
  }
  syncKeys()
  return { text }
}

/**
 * @param store      Pinia store holding the whole website state
 * @param opts       { version, localKeys, actor: () => string, isBusy: () => bool, onConflict, onReloaded, onOffline }
 */
export function installServerSync(store, opts) {
  let version = opts.version
  let timer = null, inflight = null, offline = false
  // any change: save a moment later (several quick edits become one save)
  const T = tracker(store, opts.localKeys, () => {
    dataVersion.value++
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null; flush() }, 400)
  })
  let saved = T.text() // what the server holds for this version
  const current = () => T.text()
  const unsaved = () => current() !== saved

  async function apply(state, v) {
    const keep = Object.fromEntries(opts.localKeys.map((k) => [k, store.$state[k]]))
    store.$patch((s) => {
      for (const k of Object.keys(s)) if (!opts.localKeys.includes(k) && !(k in state)) delete s[k]
      Object.assign(s, state, keep)
    })
    version = v
    saved = current()
    await nextTick()
  }

  async function reload() {
    const r = await fetch('/api/state', { cache: 'no-store' })
    if (!r.ok) return false
    const { version: v, state } = await r.json()
    if (!state) { location.reload(); return true } // database was reset: start again from the seed
    await apply(state, v)
    return true
  }

  async function doFlush() {
    const body = current()
    if (body === saved) return true
    try {
      const r = await fetch('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: `{"version":${version},"savedBy":${JSON.stringify(opts.actor?.() || null)},"state":${body}}` })
      if (r.ok) { version = (await json(r)).version; saved = body; if (offline) { offline = false; opts.onOffline?.(false) } return true }
      if (r.status === 409) { await reload(); opts.onConflict?.(); return false }
      throw new Error(String(r.status))
    } catch (e) {
      if (!offline) { offline = true; opts.onOffline?.(true) }
      clearTimeout(timer); timer = setTimeout(() => { timer = null; flush() }, 3000)
      return false
    }
  }
  /** One save at a time; a save requested while another runs waits for it, then saves whatever is new. */
  async function flush() {
    while (inflight) await inflight
    inflight = doFlush()
    try { return await inflight } finally { inflight = null }
  }

  const poll = setInterval(async () => {
    if (inflight || timer || opts.isBusy?.() || unsaved()) return
    try {
      const r = await fetch('/api/state/version', { cache: 'no-store' })
      if (!r.ok) return
      const { version: v } = await r.json()
      if (v !== version && !inflight && !timer && !unsaved()) { await reload(); opts.onReloaded?.() }
    } catch { /* server unreachable: try again next tick */ }
  }, 10000)

  return {
    /** Save now and wait; true when the server holds this tab's data. */
    async flushNow() { clearTimeout(timer); timer = null; return flush() },
    reload,
    hasUnsaved: () => !!inflight || !!timer || unsaved(),
    version: () => version,
    stop: () => clearInterval(poll),
  }
}
