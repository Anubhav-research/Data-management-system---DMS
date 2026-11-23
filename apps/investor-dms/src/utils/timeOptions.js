// Time picker options, the same everywhere (product owner, 13 Nov 2026): the 5 minutes right after an anchor one
// by one (1-minute steps), then every 5 minutes. Values are 'HH:mm'; the picker shows them as e.g. "4:31 pm".
//  - end time:  timeOptions({ after: '16:30' })      -> 16:31 16:32 16:33 16:34 16:35 16:40 16:45 ... 23:55
//  - start/due: timeOptions({ date })                -> on today's date only times after now (the 5 minutes after now
//    one by one, then every 5 minutes); on a later date the whole day every 5 minutes
// Nothing can be scheduled in the past (product owner, 13 Nov 2026): todayIso() is the date pickers' min and
// pastReason() is checked on save.
export const TIME_FORMAT = 'h:mm a'
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0) }
const toHHMM = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
const LAST = 23 * 60 + 59

function build(anchor, onlyAfter) {
  const set = new Set()
  if (anchor !== null) for (let i = 1; i <= 5; i++) if (anchor + i <= LAST) set.add(anchor + i)
  const from = onlyAfter ? anchor + 5 : 0
  for (let n = Math.ceil((from + (onlyAfter ? 1 : 0)) / 5) * 5; n <= LAST; n += 5) set.add(n)
  if (onlyAfter && anchor + 1 <= LAST) set.add(LAST) // the day can always end at 11:59 pm
  return [...set].filter((n) => !onlyAfter || n > anchor).sort((a, b) => a - b).map((n) => ({ value: toHHMM(n) }))
}
/** "4:30 pm" */
const fmt12 = (n) => { const h = Math.floor(n / 60), m = n % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }
/** Length after the start, as Frappe CRM: "1 min", "45 mins", "1 hr", "1.25 hrs", "1 hr 5 mins" */
export function durationLabel(mins) {
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'}`
  if (mins % 15 === 0) { const h = mins / 60; return `${h} hr${h === 1 ? '' : 's'}` }
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h} hr${h === 1 ? '' : 's'} ${m} min${m === 1 ? '' : 's'}`
}

/**
 * @param {object} o
 * @param {string} [o.after]  'HH:mm': only times after it (end time)
 * @param {string} [o.date]   'YYYY-MM-DD' of the field; with no `after`, today's date adds 1-minute steps after now
 * @param {string} [o.keep]   current value, always offered so it stays selectable
 */
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
/** Next whole minute from now, as a Date (default start of a new event / deal). */
export const nextMinute = () => { const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1); return d }
/** Message when a date-time is in the past, else ''. Minute precision. */
export const pastReason = (ms, what = 'Date and time') => (ms !== null && ms !== undefined && ms < Math.floor(Date.now() / 60000) * 60000 ? `${what} must be after the current date and time.` : '')

export function timeOptions({ after = null, date = null, keep = null } = {}) {
  let list
  if (after) list = build(toMin(after), true).map((o) => ({ ...o, label: `${fmt12(toMin(o.value))} (${durationLabel(toMin(o.value) - toMin(after))})` }))
  else if (!date || date === todayIso()) { const d = new Date(); list = build(d.getHours() * 60 + d.getMinutes(), true) } // today: only after now
  else list = build(null, false)
  if (keep && /^\d{2}:\d{2}/.test(keep) && !list.some((o) => o.value === keep.slice(0, 5)) && (!after || toMin(keep) > toMin(after))) {
    list.push(after ? { value: keep.slice(0, 5), label: `${fmt12(toMin(keep))} (${durationLabel(toMin(keep) - toMin(after))})` } : { value: keep.slice(0, 5) }); list.sort((a, b) => toMin(a.value) - toMin(b.value))
  }
  return list
}
