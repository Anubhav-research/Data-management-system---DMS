// F2 Family log, sent by Investor DMS (split prompt §4, §7.2.4). Per Family ID only:
// {familyId, advisorMhfId, status: Assigned/Unassigned, investedLast18Months: Yes/No, updatedAt}. Nothing else.
// DECISION-06 (default, confirm): the family log comes from Investor DMS, because only Investor DMS knows
// advisor reassignments. Sent on every change (queued here, sent by jobs.js) plus a full daily snapshot.
import { useDb } from '@/stores/db'
import { now, DAY } from '@/utils/format'
import { bridge, flowOn } from './bridge'

const db = () => useDb()
const ACTIVE_STAGES = ['Investor', 'Unassigned']
const MONTHS_18 = 18 * 30.44 * DAY

/** The family's current value, from every investor group carrying the Family ID (one family can span several groups). */
export function familyEntry(familyId) {
  const groups = db().clients.filter((c) => c.familyId === familyId && ACTIVE_STAGES.includes(c.stage))
  if (!groups.length) return null
  const lastAssigned = (c) => Math.max(0, ...(c.ownershipHistory || []).filter((h) => h.userId === c.assignedTo).map((h) => h.from || 0))
  const assigned = groups.filter((c) => c.stage === 'Investor' && c.assignedTo).sort((a, b) => lastAssigned(b) - lastAssigned(a))[0]
  const invested = groups.some((c) => c.lastInvDate && now() - c.lastInvDate < MONTHS_18)
  return { familyId, advisorMhfId: assigned ? db().userById(assigned.assignedTo)?.mhf_id || null : null, status: assigned ? 'Assigned' : 'Unassigned', investedLast18Months: invested ? 'Yes' : 'No', updatedAt: new Date().toISOString() }
}
const sig = (e) => `${e.status}|${e.advisorMhfId}|${e.investedLast18Months}`

/** Called by every rule that can change the advisor, the Unassigned status or the 18-month investment fact. */
export function noteFamilyChange(c) {
  if (!c?.familyId) return
  const e = familyEntry(c.familyId); if (!e) return
  for (const g of db().clients.filter((x) => x.familyId === c.familyId)) g.f2Invested = e.investedLast18Months
  const s = db()
  if (s.f2Last[c.familyId] === sig(e)) return // send on change only
  s.f2Last[c.familyId] = sig(e)
  s.f2Outbox = (s.f2Outbox || []).filter((x) => x.familyId !== c.familyId) // only the latest value per family waits
  s.f2Outbox.push(e)
}

function recordSent(mode, entries, result) {
  const s = db()
  s.f2Sent.unshift(...entries.map((e) => ({ ...e, mode, sentAt: now(), result })))
  if (s.f2Sent.length > 1000) s.f2Sent.length = 1000
}
/** Send the queued changes (jobs.js, every few seconds). While F2 is switched off they stay queued. */
export async function sendFamilyLog() {
  const s = db()
  if (!s.f2Outbox?.length || !flowOn('F2')) return { pending: s.f2Outbox?.length || 0 }
  const entries = s.f2Outbox.slice()
  const r = await bridge('POST', '/family-log', { mode: 'change', entries })
  if (!r.ok) return { error: r.status }
  db().f2Outbox = db().f2Outbox.filter((x) => !entries.includes(x))
  recordSent('change', entries, 'sent')
  return { sent: entries.length }
}
/** Full daily snapshot for reconciliation (split prompt §4 F2). */
export async function sendSnapshot() {
  if (!flowOn('F2')) return { off: true }
  const ids = [...new Set(db().clients.filter((c) => c.familyId && ACTIVE_STAGES.includes(c.stage)).map((c) => c.familyId))]
  const entries = ids.map(familyEntry).filter(Boolean)
  const r = await bridge('POST', '/family-log', { mode: 'snapshot', entries })
  if (!r.ok) return { error: r.status }
  for (const e of entries) db().f2Last[e.familyId] = sig(e)
  recordSent('snapshot', entries, 'sent')
  return { sent: entries.length }
}
