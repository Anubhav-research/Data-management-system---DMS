// F4 Busy blocks (split prompt §8). This website publishes, per user, only {userMhfId, start, end, allDay} for
// upcoming appointments, 30 days ahead; it reads the other website's blocks for the signed-in user.
import { ref } from 'vue'
import { useDb } from '@/stores/db'
import { now, DAY } from '@/utils/format'
import { bridge, flowOn } from './bridge'

const db = () => useDb()
const SIDE = 'investor' // this website publishes as "investor" and reads "prospect"
const OTHER = 'prospect'
let lastSent = ''

/** Upcoming appointments of this website as anonymous blocks: events and scheduled deals (split prompt §8). */
export function ownBlocks() {
  const from = now(), to = now() + 30 * DAY
  const out = []
  for (const e of db().events) {
    if (e.cancelled || e.end < from || e.start > to) continue
    const people = new Set([...(e.attendees || []), e.createdBy].filter(Boolean))
    for (const uid of people) { const u = db().userById(uid); if (u) out.push({ userMhfId: u.mhf_id, start: e.start, end: e.end, allDay: !!e.allDay }) }
  }
  for (const d of db().deals) {
    if (d.status !== 'Scheduled' || d.end < from || d.start > to) continue
    const u = db().userById(db().clientById(d.clientId)?.assignedTo || d.createdBy)
    if (u) out.push({ userMhfId: u.mhf_id, start: d.start, end: d.end, allDay: !!d.allDay })
  }
  return out
}
/** Publish when something changed (and on the daily refresh with force=true). */
export async function publishBusy(force = false) {
  if (!flowOn('F4')) return { off: true }
  const blocks = ownBlocks()
  const sig = JSON.stringify(blocks)
  if (!force && sig === lastSent) return { unchanged: true }
  const r = await bridge('PUT', `/busy/${SIDE}`, { blocks })
  if (r.ok) lastSent = sig
  return r.ok ? { count: blocks.length } : { error: r.status }
}

/** The other website's blocks for one user, cached for the calendar and the overlap warning. */
export const otherBusy = ref([])
export async function loadOtherBusy(userId, from = now() - 7 * DAY, to = now() + 45 * DAY) {
  const u = db().userById(userId)
  if (!u || !flowOn('F4')) { otherBusy.value = []; return [] }
  const r = await bridge('GET', `/busy/${OTHER}?user=${encodeURIComponent(u.mhf_id)}&from=${from}&to=${to}`)
  otherBusy.value = r.ok ? r.data.blocks : []
  return otherBusy.value
}
/** Soft warning only: never blocks (split prompt §8). */
export function overlapsBusy(start, end) {
  return otherBusy.value.some((b) => start < b.end && end > b.start)
}
export const BUSY_LABEL = 'Busy (other DMS)'
export const OVERLAP_WARNING = 'This time overlaps an appointment in the other DMS. You can still save.'
