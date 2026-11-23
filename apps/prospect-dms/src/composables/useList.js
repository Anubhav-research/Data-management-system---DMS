// List state: search, quick filters, advanced filter, sort and the notification "silent filter"
// (X07 NOTIFICATION_BEHAVIOUR). Pure UI logic over an array computed from the store.
import { ref, computed, watch, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeFields, isActive, matches } from '@/services/filterOps'

/**
 * @param source  () => rows
 * @param opts    { searchKeys: [fn|key], quickMatch: {key: (row, value) => bool}, getField: (row,key) => any, defaultSort }
 */
export function useList(source, opts = {}) {
  const route = useRoute(); const router = useRouter()
  const search = ref('')
  const quickValues = ref({})
  const advanced = ref([])
  const sort = ref(opts.defaultSort?.key ? [{ ...opts.defaultSort }] : [])
  const silentIds = ref(route.query.ids ? String(route.query.ids).split(',') : null)
  // a notification opened while this list is already showing changes only the query: follow it
  watch(() => route.query.ids, (v) => { silentIds.value = v ? String(v).split(',') : null })
  const loading = ref(true)
  setTimeout(() => (loading.value = false), 250) // brief loading state (skeleton)

  const get = (row, key) => (opts.getField ? opts.getField(row, key) : row[key])
  // the unfiltered rows: the toolbar's Filter panel reads them (provide/inject) to know each field's type and pick-list
  const allRows = computed(() => source())
  provide('dms-list-rows', allRows)
  const rows = computed(() => {
    let list = allRows.value
    if (silentIds.value) list = list.filter((r) => silentIds.value.includes(r.id))
    const q = search.value.trim().toLowerCase()
    if (q) list = list.filter((r) => (opts.searchKeys || []).some((k) => String(typeof k === 'function' ? k(r) : r[k] ?? '').toLowerCase().includes(q)))
    for (const [k, v] of Object.entries(quickValues.value)) {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
      const m = opts.quickMatch?.[k]
      // multi-select quick filter: keep a row if it matches any of the chosen values
      const one = (r, x) => (m ? m(r, x) : String(get(r, k) ?? '') === String(x))
      list = list.filter((r) => (Array.isArray(v) ? v.some((x) => one(r, x)) : one(r, v)))
    }
    // Advanced filters (Frappe CRM operators; services/filterOps). Field types come from the unfiltered rows.
    const active = advanced.value.filter(isActive)
    if (active.length) {
      const types = Object.fromEntries(describeFields([...new Set(active.map((f) => f.field))].map((key) => ({ key })), allRows.value).map((d) => [d.key, d.type]))
      for (const f of active) list = list.filter((r) => matches(get(r, f.field), f, types[f.field]))
    }
    // several sort keys, in order; Clear Sort returns to the list's defined order (GEN-005)
    let sorts = Array.isArray(sort.value) ? sort.value : sort.value?.key ? [sort.value] : []
    if (!sorts.length && opts.defaultSort?.key) sorts = [opts.defaultSort]
    if (sorts.length) {
      const now = Date.now()
      list = [...list].sort((a, b) => {
        for (const s of sorts) {
          const x = get(a, s.key), y = get(b, s.key); const d = s.dir === 'desc' ? -1 : 1
          if (x == null && y == null) continue
          if (x == null) return 1
          if (y == null) return -1
          // Forward-looking dates (event, due, deal date), ascending = DMS rule: nearest upcoming at the top,
          // then later ones; past dates follow, most recent first.
          if (s.dir !== 'desc' && opts.upcomingKeys?.includes(s.key)) {
            const fx = x >= now, fy = y >= now
            if (fx !== fy) return fx ? -1 : 1
            if (x !== y) return (x > y ? 1 : -1) * (fx ? 1 : -1)
            continue
          }
          if (x !== y) return (x > y ? 1 : -1) * d
        }
        return 0
      })
    }
    return list
  })
  function clearSilent() { silentIds.value = null; router.replace({ query: { ...route.query, ids: undefined, from: undefined } }) }
  function refresh() { loading.value = true; setTimeout(() => (loading.value = false), 300) }
  return { search, quickValues, advanced, sort, rows, silentIds, clearSilent, loading, refresh }
}
