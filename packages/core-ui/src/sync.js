// Server-state sync client (shared CODE; each website talks only to its OWN /api through its own Vite proxy).
// - load:   GET /api/state on start; if the database is empty, the website writes its fresh seed (first writer wins)
// - save:   debounced PUT /api/state with an optimistic version; 409 = someone else saved first -> reload + message
// - poll:   GET /api/state/version every 10 s; reload when it changed and this tab has no unsaved edits
// Per-tab overlays (signed-in user, active call, ...) are never sent to the server.
// "Unsaved" is decided by comparing with the last copy loaded from / saved to the server, so no change can slip
// through between a reload and the next edit.
import { nextTick } from 'vue'

const json = async (r) => { try { return await r.json() } catch { return null } }

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

function strip(state, localKeys) {
  const out = {}
  for (const [k, v] of Object.entries(state)) if (!localKeys.includes(k)) out[k] = v
  return JSON.stringify(out)
}

/**
 * @param store      Pinia store holding the whole website state
 * @param opts       { version, localKeys, actor: () => string, isBusy: () => bool, onConflict, onReloaded, onOffline }
 */
export function installServerSync(store, opts) {
  let version = opts.version
  let timer = null, inflight = null, offline = false
  let saved = strip(store.$state, opts.localKeys) // what the server holds for this version
  const current = () => strip(store.$state, opts.localKeys)
  const unsaved = () => current() !== saved

  store.$subscribe(() => {
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null; flush() }, 400)
  }, { detached: true })

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
