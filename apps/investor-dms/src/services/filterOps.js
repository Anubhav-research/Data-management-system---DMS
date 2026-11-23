// Advanced filter (port of Frappe CRM Filter.vue semantics, run in the browser instead of on the server).
// A filter is { field, op, value }. Field types are worked out from the list's own data:
//   date   - timestamps            -> Equals / Not equals / Is / > / < / >= / <= / Between / Timespan
//   number - numbers               -> Equals / Not equals / Like / Not like / In / Not in / Is / < / > / <= / >=
//   select - few distinct values   -> Equals / Not equals / In / Not in / Is
//   text   - anything else         -> Equals / Not equals / Like / Not like / In / Not in / Is
import { fmtDateTime } from '@/utils/format'

const isTs = (v) => typeof v === 'number' && v > 978307200000 && v < 4102444800000 // 2001..2100 in ms
const isEmpty = (v) => v == null || v === '' || v === '-' || v === '—' || (Array.isArray(v) && !v.length)

/** Work out each field's type (and pick-list options) from the rows. */
export function describeFields(fields, rows) {
  return fields.map((f) => {
    if (f.type) return f
    const vals = rows.map((r) => r[f.key]).filter((v) => !isEmpty(v))
    if (!vals.length) return { ...f, type: 'text' }
    if (vals.every(isTs)) return { ...f, type: 'date' }
    if (vals.every((v) => typeof v === 'number')) return { ...f, type: 'number' }
    if (vals.every((v) => typeof v === 'string')) {
      const distinct = [...new Set(vals)]
      if (distinct.length <= 15 && distinct.length < Math.max(4, vals.length * 0.6) && distinct.every((s) => s.length <= 40)) return { ...f, type: 'select', options: distinct.sort() }
    }
    return { ...f, type: 'text' }
  })
}

const O = (label, value = label.toLowerCase()) => ({ label, value })
export const OPERATORS = {
  text: [O('Equals'), O('Not equals'), O('Like'), O('Not like'), O('In'), O('Not in'), O('Is')],
  number: [O('Equals'), O('Not equals'), O('Like'), O('Not like'), O('In'), O('Not in'), O('Is'), O('<'), O('>'), O('<='), O('>=')],
  select: [O('Equals'), O('Not equals'), O('In'), O('Not in'), O('Is')],
  date: [O('Equals'), O('Not equals'), O('Is'), O('>'), O('<'), O('>='), O('<='), O('Between'), O('Timespan')],
}
export const defaultOperator = (type) => (type === 'select' || type === 'number' ? 'equals' : type === 'date' ? 'between' : 'like')
export function defaultValue(field, op) {
  if (op === 'is') return 'set'
  if (field.type === 'select' && (op === 'in' || op === 'not in')) return []
  if (field.type === 'select') return field.options?.[0] ?? ''
  if (op === 'timespan') return 'this month'
  if (field.type === 'date') return op === 'between' ? [] : ''
  return ''
}
export const IS_OPTIONS = [{ label: 'Set', value: 'set' }, { label: 'Not Set', value: 'not set' }]
export const TIMESPANS = ['Last Week', 'Last Month', 'Last Quarter', 'Last 6 Months', 'Last Year', 'Yesterday', 'Today', 'Tomorrow', 'This Week', 'This Month', 'This Quarter', 'This Year', 'Next Week', 'Next Month', 'Next Quarter', 'Next 6 Months', 'Next Year'].map((l) => O(l))

export function placeholder(field, op) {
  if (op === 'in' || op === 'not in') return field.type === 'number' ? '100, 200, 300' : 'John, Jane, Doe'
  if (op === 'like' || op === 'not like') return field.type === 'number' ? '%100%' : '%John%'
  if (field.type === 'number') return '1000'
  if (field.type === 'date') return 'Select date'
  return 'John Doe'
}

// ---- date helpers ----
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
const parseDay = (s) => (s ? dayStart(new Date(`${s}T00:00:00`)) : null) // 'YYYY-MM-DD' from the date picker
const DAY = 86400000
function timespanRange(span, now = new Date()) {
  const t = dayStart(now); const d = new Date(t)
  const startOfWeek = t - ((d.getDay() + 6) % 7) * DAY // Monday
  const m = d.getMonth(), y = d.getFullYear(), q = Math.floor(m / 3) * 3
  const monthStart = (yy, mm) => new Date(yy, mm, 1).getTime()
  switch (span) {
    case 'today': return [t, t + DAY]
    case 'yesterday': return [t - DAY, t]
    case 'tomorrow': return [t + DAY, t + 2 * DAY]
    case 'this week': return [startOfWeek, startOfWeek + 7 * DAY]
    case 'last week': return [startOfWeek - 7 * DAY, startOfWeek]
    case 'next week': return [startOfWeek + 7 * DAY, startOfWeek + 14 * DAY]
    case 'this month': return [monthStart(y, m), monthStart(y, m + 1)]
    case 'last month': return [monthStart(y, m - 1), monthStart(y, m)]
    case 'next month': return [monthStart(y, m + 1), monthStart(y, m + 2)]
    case 'this quarter': return [monthStart(y, q), monthStart(y, q + 3)]
    case 'last quarter': return [monthStart(y, q - 3), monthStart(y, q)]
    case 'next quarter': return [monthStart(y, q + 3), monthStart(y, q + 6)]
    case 'last 6 months': return [monthStart(y, m - 6), t + DAY]
    case 'next 6 months': return [t, monthStart(y, m + 7)]
    case 'this year': return [monthStart(y, 0), monthStart(y + 1, 0)]
    case 'last year': return [monthStart(y - 1, 0), monthStart(y, 0)]
    case 'next year': return [monthStart(y + 1, 0), monthStart(y + 2, 0)]
    default: return null
  }
}

const shown = (v) => (Array.isArray(v) ? v.join(', ') : isTs(v) ? fmtDateTime(v) : String(v ?? ''))
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((s) => String(s).trim().toLowerCase()).filter(Boolean)
const strip = (s) => String(s ?? '').replace(/%/g, '').trim().toLowerCase()

/** True when the filter is filled in enough to apply (an empty value narrows nothing, as in Frappe). */
export function isActive(f) {
  if (f.op === 'is' || f.op === 'timespan') return !!f.value
  if (Array.isArray(f.value)) return f.value.filter(Boolean).length > 0
  return f.value !== '' && f.value != null && strip(f.value) !== ''
}

/** Does this row value pass the filter? `type` comes from describeFields. */
export function matches(raw, f, type) {
  const op = f.op
  if (op === 'is') return f.value === 'set' ? !isEmpty(raw) : isEmpty(raw)
  if (type === 'date') {
    if (isEmpty(raw)) return false
    const day = dayStart(raw)
    if (op === 'timespan') { const r = timespanRange(f.value); return !r || (raw >= r[0] && raw < r[1]) }
    if (op === 'between') { const [a, b] = (f.value || []).map(parseDay); return (a == null || day >= a) && (b == null || day <= b) }
    const v = parseDay(f.value); if (v == null) return true
    return { equals: day === v, 'not equals': day !== v, '>': day > v, '<': day < v, '>=': day >= v, '<=': day <= v }[op] ?? true
  }
  if (type === 'number' && ['equals', 'not equals', '<', '>', '<=', '>='].includes(op)) {
    const n = Number(raw), v = Number(f.value)
    if (isNaN(v)) return true
    if (isEmpty(raw) || isNaN(n)) return op === 'not equals'
    return { equals: n === v, 'not equals': n !== v, '<': n < v, '>': n > v, '<=': n <= v, '>=': n >= v }[op]
  }
  const cell = shown(raw).toLowerCase()
  if (op === 'equals') return cell === String(f.value).trim().toLowerCase()
  if (op === 'not equals') return cell !== String(f.value).trim().toLowerCase()
  if (op === 'like') return cell.includes(strip(f.value))
  if (op === 'not like') return !cell.includes(strip(f.value))
  if (op === 'in') return list(f.value).includes(cell)
  if (op === 'not in') return !list(f.value).includes(cell)
  return true
}
