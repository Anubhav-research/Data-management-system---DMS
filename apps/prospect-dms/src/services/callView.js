// Display helpers for a call log, shared by the record's Calls tab, Activity and Call Logs page
// (Frappe CRM CallArea / CallLogDetailModal pattern). Pure presentation - rules live in services/calls.js.
import { useDb } from '@/stores/db'
import { clientName } from './lifecycle'

const db = () => useDb()

/** Outbound: specialist -> client person. Inbound: client person -> specialist. */
export function callParties(l) {
  const c = db().clientById(l.clientId)
  const user = db().userById(l.madeBy)
  const emp = { label: user?.name || 'Unknown', sub: user?.mhf_id || '', kind: 'user', userId: l.madeBy }
  const person = { label: l.clientName || (c ? clientName(c) : 'Unknown'), sub: '', kind: 'client' }
  return l.direction === 'Inbound' ? { caller: person, receiver: emp } : { caller: emp, receiver: person }
}

export const callTitle = (l) => (l.direction === 'Inbound' ? 'Inbound Call' : 'Outbound Call')
export const callVerb = (l) => (l.direction === 'Inbound' ? 'has reached out' : l.manual ? 'has logged a call' : 'has made a call')
export const callIcon = (l) => (l.direction === 'Inbound' ? 'lucide-phone-incoming' : 'lucide-phone-outgoing')

/** "Nov 6, Friday" (timeline badge) */
export function callDay(at) {
  const d = new Date(at)
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.toLocaleString('en-US', { weekday: 'long' })}`
}
/** "Fri, Nov 6, 2026 2:55 pm" (details) */
export function callWhen(at) {
  const d = new Date(at)
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
  return `${d.toLocaleString('en-US', { weekday: 'short' })}, ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${d.getFullYear()} ${time}`
}
/** "45s", "8m 43s", "1h 2m" */
export function callDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
  if (h) return `${h}h ${m}m`
  if (m) return s ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

/** Badge colour for the outcome / not-connected reason */
const OUTCOME_THEME = { Followup: 'blue', Interested: 'green', 'Passive Communication': 'orange', 'Not Interested': 'red', 'Wrong Number': 'gray', Disconnected: 'gray' }
export const callTheme = (l) => (l.status === 'Connected' ? OUTCOME_THEME[l.subStatus] || 'gray' : 'red')
/** Text colour for the status line in Call Details */
export const callStatusClass = (l) => ({ blue: 'text-ink-blue-6', green: 'text-ink-green-6', orange: 'text-ink-amber-6', red: 'text-ink-red-6', gray: 'text-ink-gray-6' })[callTheme(l)]

/**
 * Demo recording: the phone system is simulated, so a quiet WAV of the call's length is generated in the
 * browser (8 kHz, 8-bit mono) and cached per call. Real deployments use the Asterisk recording URL.
 */
const cache = new Map()
export function recordingUrl(l) {
  if (!l?.recording || !l.duration) return ''
  if (cache.has(l.id)) return cache.get(l.id)
  const rate = 8000, n = Math.min(l.duration, 3600) * rate
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
  v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true)
  const bytes = new Uint8Array(buf, 44)
  let seed = l.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 7)
  for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; bytes[i] = 128 + ((seed >> 16) % 3) - 1 } // faint line hiss
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  cache.set(l.id, url)
  return url
}
