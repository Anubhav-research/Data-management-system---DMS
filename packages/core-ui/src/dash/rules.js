// Dashboard rules shared by Prospect DMS and Investor DMS (spec: docs/DASHBOARD_SPEC.md §2, product owner 24 Nov 2026).
// Pure functions only: no store, no data. Each website's services/dashboard.js uses these on its own records.
export const DAY = 86400000

// ---------------------------------------------------------------- period (§2.2)
export const RANGES = ['Today', 'This week', 'This month', 'Last 30 days', 'Last 60 days', 'Last 90 days', 'Custom']
export const DEFAULT_RANGE = 'This month'
export const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
export const inP = (t, p) => t != null && t >= p.from && t < p.to

/** The period chosen. Weeks start on Monday; "Last N days" ends with today. */
export function periodOf(f) {
  const d0 = startOfDay(); const end = d0 + DAY
  const last = (n) => ({ from: end - n * DAY, to: end })
  switch (f?.range) {
    case 'Today': return { from: d0, to: end }
    case 'This week': { const s = new Date(d0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return { from: s.getTime(), to: s.getTime() + 7 * DAY } }
    case 'Last 30 days': return last(30)
    case 'Last 60 days': return last(60)
    case 'Last 90 days': return last(90)
    case 'Custom': {
      const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : d0 - 29 * DAY
      const to = f.to ? new Date(`${f.to}T00:00:00`).getTime() + DAY : end
      return { from, to: Math.max(to, from + DAY) }
    }
    default: { const d = new Date(d0); return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() } } // This month
  }
}
/** The period to compare with (§2.2). Today, This week and This month run to the end of today, so they are compared
 *  with the same days of the day, week or month before (product owner 28 Nov 2026: "This week" against "the previous
 *  7 days" compared a part week with a full one). Other periods: the previous period of the same length. */
export function previousOf(p, range) {
  const soFar = Math.min(p.to, startOfDay() + DAY) - p.from
  if (range === 'Today') return { from: p.from - DAY, to: p.from, caption: 'vs yesterday' }
  if (range === 'This week') return { from: p.from - 7 * DAY, to: p.from - 7 * DAY + soFar, caption: 'vs same days last week' }
  if (range === 'This month') {
    const d = new Date(p.from); const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()
    return { from, to: Math.min(p.from, from + soFar), caption: 'vs same days last month' }
  }
  const len = p.to - p.from; const days = Math.round(len / DAY)
  return { from: p.from - len, to: p.from, caption: days === 1 ? 'vs previous day' : `vs previous ${days} days` }
}
/** Change in % against the previous period; null when there is nothing to compare with. */
export const change = (v, was) => (v == null || was == null ? null : was === 0 ? (v === 0 ? 0 : null) : Math.round(((v - was) / Math.abs(was)) * 100))
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)

// ---------------------------------------------------------------- counting rules (§2.7)
/** Connected = Call Status Connected AND duration above 0 seconds (D04 §1.3). */
export const isConnected = (call) => call?.status === 'Connected' && (call.duration || 0) > 0
export const talkTime = (calls) => calls.filter(isConnected).reduce((s, c) => s + (c.duration || 0), 0)

// ---------------------------------------------------------------- colours (§2.5)
export const CONNECT_GREEN_AT = 75
export const TIMER_AMBER_DAYS = 7
export const connectTone = (rate) => (rate != null && rate >= CONNECT_GREEN_AT ? 'green' : null)
/**
 * When the request reached the approver who has it now. No time is stamped when a level becomes Pending, but a level
 * becomes Pending at the moment the level below acts, so: the previous level's action time, or the request time.
 */
export function reachedCurrentLevelAt(a) {
  const chain = a.chain || []; const i = chain.findIndex((s) => s.state === 'Pending')
  if (i < 0) return a.requestedOn
  for (let j = i - 1; j >= 0; j--) if (chain[j].at) return chain[j].at
  return a.requestedOn
}
/** Age at the current level: up to 2 days normal, over 2 up to 3 amber, over 3 red. */
export function approvalTone(a, at = Date.now()) {
  const d = (at - reachedCurrentLevelAt(a)) / DAY
  return d > 3 ? 'red' : d > 2 ? 'amber' : null
}

// ---------------------------------------------------------------- drill-down (§2.3)
/** A link that opens a list showing exactly these records, with the removable "From Dashboard" chip. */
export const listTo = (path, ids, label) => ({ path, query: { ids: [...new Set(ids)].join(','), from: label } })
export const drill = (path, listLabel, ids, label) => [{ label: listLabel, count: new Set(ids).size, to: listTo(path, ids, label) }]

// ---------------------------------------------------------------- card building helpers
/** One figure of a card. `ids` are the records behind it; `open` builds its drill-down from them. */
export function fig(label, ids, open, extra = {}) {
  const list = [...new Set(ids)]
  const value = extra.value ?? list.length
  // when the figure counts something else than records (people of a family), say how many records open behind it
  const sub = extra.sub ?? (value !== list.length ? `in ${list.length} record${list.length === 1 ? '' : 's'}` : undefined)
  return { label, value, ids: list, listCount: list.length, drill: open ? open(list, extra.drillLabel || label) : null, ...extra, sub }
}
/** A period figure: this period, with the change against the previous one. `bad` = a rise is bad (red). */
export function figP(label, ids, prevIds, open, extra = {}) {
  const f = fig(label, ids, open, extra)
  const was = extra.prevValue ?? new Set(prevIds).size
  return { ...f, delta: change(f.value, was), bad: !!extra.bad }
}
