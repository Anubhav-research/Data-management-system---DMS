// Fast "find by id" for the big lists in the website store (clients, users). Same answer as
// list.find((x) => x.id === id), but from an id -> position index instead of walking the whole reactive list
// (with ~10,000 records that walk made every page slow). The index is checked on every use (the item at that
// position must still carry that id) and rebuilt from the plain list when it is stale, so adds, removes, reorders
// and a full reload from the server are all picked up. Reactivity is kept: the caller still reads the list
// through the store (its length and the item), so screens update as before.
import { toRaw } from 'vue'

export function byIdLookup() {
  let raw = null; let map = new Map()
  const rebuild = (arr) => { raw = arr; map = new Map(); for (let i = 0; i < arr.length; i++) if (arr[i] && !map.has(arr[i].id)) map.set(arr[i].id, i) }
  return (list, id) => {
    if (id == null || !list) return undefined
    void list.length // keep the caller's reactivity on the list size (adds and removes)
    const arr = toRaw(list)
    let i = arr === raw ? map.get(id) : undefined
    if (i === undefined || arr[i]?.id !== id) { rebuild(arr); i = map.get(id) }
    return i === undefined ? undefined : list[i]
  }
}

/** The earliest time per key over a list, in one pass: e.g. each client's next event. Same answer as filtering the
 *  list for each key and taking the first by time, without re-reading the whole list for every row. */
export function earliestPer(list, key, when, keep = () => true) {
  const m = new Map()
  for (const x of list) { if (!keep(x)) continue; const k = key(x); const t = when(x); if (!(m.get(k) <= t)) m.set(k, t) }
  return m
}
