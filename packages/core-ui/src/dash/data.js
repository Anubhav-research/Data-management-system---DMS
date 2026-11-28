// Speed helpers for the dashboards (25 Nov 2026, demo data at real volume: 200+ people, thousands of calls a day).
// They change how fast the figures are worked out, never what they are.
import { toRaw } from 'vue'
import { dataVersion } from '../sync.js'

/** A lookup built once and kept for the rest of the current run only, so it never goes stale across changes. */
export function perRun(build) {
  let v = null
  return () => { if (!v) { v = build(); queueMicrotask(() => { v = null }) } return v }
}

/** Items of a list grouped by person (`key` gives one id or several). The returned function gives the items of one
 *  or more people in the list's own order, the same as list.filter((x) => who.includes(key(x))). */
export function byPerson(list, key) {
  const m = new Map()
  list.forEach((x, i) => { for (const k of [].concat(key(x))) { if (k == null) continue; const l = m.get(k) || m.set(k, []).get(k); if (l[l.length - 1] !== i) l.push(i) } })
  return (who) => {
    if (who.length === 1) return (m.get(who[0]) || []).map((i) => list[i])
    const at = new Set(); for (const u of who) for (const i of m.get(u) || []) at.add(i)
    return [...at].sort((a, b) => a - b).map((i) => list[i])
  }
}

/**
 * The website store, read as plain data while a dashboard is worked out (no reactive wrapper on each of thousands of
 * records). `run(fn)` works the dashboard out that way and makes the page do it again when the data changes
 * (dataVersion), or the signed-in person or the live call changes. `db()` gives the plain view during a run and the
 * normal store otherwise.
 */
export function plainStore(useDb) {
  let plain = null
  const db = () => plain || useDb()
  function run(fn) {
    if (plain) return fn() // already inside a run
    const st = useDb()
    void dataVersion.value; void st.sessionUserId; void st.pendingLog; void st.users.length
    const raw = toRaw(st.$state)
    plain = new Proxy(raw, { get: (t, k) => (k in t ? t[k] : st[k]) })
    try { return fn() } finally { plain = null }
  }
  return { db, run }
}
