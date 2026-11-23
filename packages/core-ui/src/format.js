// Shared formatter CODE (both websites). 
// Formatting helpers. All dates shown in IST style as in Figma (D01 §1.4). Amounts in rupees.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DAY = 86400000
export const now = () => Date.now()
export const daysFromNow = (d) => now() + d * DAY
export const toDate = (v) => (v == null || v === '' ? null : new Date(v))

function pad(n) { return String(n).padStart(2, '0') }
export function fmtTime(v) {
  const d = toDate(v); if (!d) return ''
  let h = d.getHours(); const m = pad(d.getMinutes()); const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${pad(h)}:${m} ${ap}`
}
export function fmtTimeShort(v) {
  const d = toDate(v); if (!d) return ''
  let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12
  return `${h}:${pad(d.getMinutes())} ${ap}`
}
/** "12 Oct 2026" */
export function fmtDate(v) {
  const d = toDate(v); if (!d) return '-'
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
/** "12 Oct 2026, 10:30 AM" */
export function fmtDateTime(v) {
  const d = toDate(v); if (!d) return '-'
  return `${fmtDate(d)}, ${fmtTime(d)}`
}
/** "Mon, 22 Jun 2026" */
export function fmtDayDate(v) {
  const d = toDate(v); if (!d) return ''
  return `${DAYS[d.getDay()]}, ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
/** panel style "7, Aug 2026" */
export function fmtPanelDate(v) {
  const d = toDate(v); if (!d) return '-'
  return `${d.getDate()}, ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
/** "Today, 11:42 AM" / "Yesterday, 06:12 PM" / full date (D04 §15) */
export function fmtRelativeDay(v) {
  const d = toDate(v); if (!d) return '-'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today - new Date(d).setHours(0, 0, 0, 0)) / DAY)
  if (diff === 0) return `Today, ${fmtTime(d)}`
  if (diff === 1) return `Yesterday, ${fmtTime(d)}`
  return fmtDateTime(d)
}
export function timeAgo(v) {
  const d = toDate(v); if (!d) return ''
  const s = Math.round((now() - d.getTime()) / 1000)
  if (s < 0) {
    const f = -s
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`
    if (f < 86400) return `in ${Math.round(f / 3600)} hours`
    return `in ${Math.round(f / 86400)} days`
  }
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`
  if (s < 86400) { const h = Math.round(s / 3600); return h === 1 ? '1 hour ago' : `${h} hours ago` }
  const days = Math.round(s / 86400)
  if (days === 1) return '1 day ago'
  if (days < 7) return `${days} days ago`
  if (days < 30) { const w = Math.round(days / 7); return w === 1 ? '1 week ago' : `${w} weeks ago` }
  if (days < 365) { const m = Math.round(days / 30); return m === 1 ? '1 month ago' : `${m} months ago` }
  const y = Math.round(days / 365); return y === 1 ? '1 year ago' : `${y} years ago`
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
export function fmtDurationShort(sec) {
  sec = Math.max(0, Math.round(sec || 0))
  return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`
}
/** Indian grouping ₹2,50,000 */
export function inr(n) {
  if (n == null || n === '' || isNaN(n)) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
/** AUM short form ₹25L / ₹1.2Cr (D02 §5.5) */
export function inrShort(n) {
  if (!n) return '-'
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  return inr(n)
}
export function initials(name = '') {
  const p = String(name).replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}
// ---- Masking (GEN-008, D04 §7.3 / §15 / §16) ----
export function maskPhoneDots(m) { // Call logs Pool-stage: "+91 •••••76655"
  const d = String(m || '').replace(/\D/g, '').slice(-10)
  return `+91 •••••${d.slice(-5)}`
}
export function maskPhoneX(m) { // WhatsApp logs: "+91 98XXXX3210"
  const d = String(m || '').replace(/\D/g, '').slice(-10)
  return `+91 ${d.slice(0, 2)}XXXX${d.slice(-4)}`
}
export function maskEmail(e) { // "aar••••••@corporate.in"
  const [u, dom] = String(e || '').split('@')
  if (!dom) return e
  return `${u.slice(0, 3)}••••••@${dom}`
}
export function fmtMobile(m) {
  const d = String(m || '').replace(/\D/g, '').slice(-10)
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : '-'
}
export function maskCard(c) { const d = String(c || '').replace(/\D/g, ''); return d ? `•••• •••• •••• ${d.slice(-4)}` : '' }
export function toInputDate(v) { const d = toDate(v); return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '' }
export function toInputTime(v) { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '' }
export function combineDateTime(date, time) { if (!date) return null; return new Date(`${date}T${time || '00:00'}:00`).getTime() }
