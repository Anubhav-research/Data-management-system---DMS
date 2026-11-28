// Families in Prospect DMS (split prompt §5.1, §6.4, §6.5, §6.7).
// - Every record carries a permanent Family ID (FAM-xxxxx), the only identifier shared with Investor DMS.
// - A converted person is tagged INVESTOR: only the name is visible here; nothing can be done with them.
// - Every number and PAN of an Investor Family / Unassigned Family member is "do not distribute".
import { useDb } from '@/stores/db'
import { FAMILY_STAGES } from '@/data/masters'
import { now } from '@/utils/format'
import { notify } from './notify'

const db = () => useDb()
export const MASK = '••••'

export const isInvestorMember = (m) => !!m?.investor
export const workableMembers = (c) => (c?.members || []).filter((m) => !isInvestorMember(m))
export const investorMembers = (c) => (c?.members || []).filter(isInvestorMember)
/** "4 / 2" = 4 members, 2 of them investors (owner answer 12 Nov 2026: the whole family stays visible). */
export const memberCounts = (c) => ({ total: c.members.length, investors: investorMembers(c).length })
/** All members are investors: read-only "Fully converted", visible to Admin only (split prompt §6.4). */
export const isFullyConverted = (c) => FAMILY_STAGES.includes(c?.stage) && workableMembers(c).length === 0
export const isFamilyStage = (c) => FAMILY_STAGES.includes(c?.stage)
/** When the last member's conversion was accepted by Investor DMS; null while the family has someone left to work
 *  or any conversion is still waiting (it could still be rejected or reverted). */
export function fullyConvertedAt(c) {
  if (!isFullyConverted(c)) return null
  let last = 0
  for (const m of c.members) {
    if (m.investor?.status !== 'Accepted') return null
    const h = db().handovers.find((x) => x.id === m.investor.handoverId)
    last = Math.max(last, h?.ackAt || m.investor.convertedAt || 0)
  }
  return last || null
}
/** Product owner, 23 Nov 2026: once Investor DMS has accepted the last member, the family is complete. It leaves the
 *  Investor Family list (the work is done; the family lives in Investor DMS). The record is kept for history and counts. */
export const isFamilyComplete = (c) => !!fullyConvertedAt(c)

export function newFamilyId() {
  const s = db()
  s.familySeq = Math.max(s.familySeq || 0, ...s.clients.map((c) => Number(String(c.familyId || '').replace(/\D/g, '')) || 0)) + 1
  return `FAM-${String(s.familySeq).padStart(5, '0')}`
}

/** DECISION-31 (default, confirm): a match is the same PAN, or the same last 10 digits of a mobile. */
export function normalize(v) {
  const t = String(v || '').trim().toUpperCase()
  if (/^[A-Z]{5}\d{4}[A-Z]$/.test(t)) return t
  const d = t.replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : ''
}

/** Value -> record id, for every mobile and PAN held by an Investor Family / Unassigned Family member. */
// The index is kept for the rest of the current run only (a loop over every record asks for it once per record);
// the next user action or timer tick builds it again, so it never goes stale across changes.
let dndCache = null
export function dndIndex() {
  if (dndCache) return dndCache
  const idx = new Map()
  dndCache = idx; queueMicrotask(() => { dndCache = null })
  for (const c of db().clients) {
    if (!FAMILY_STAGES.includes(c.stage)) continue
    for (const m of c.members) {
      for (const x of m.contacts || []) { const k = normalize(x.mobile); if (k) idx.set(k, c.id) }
      const p = normalize(m.pan || m.extra?.pan); if (p) idx.set(p, c.id)
    }
  }
  return idx
}
/** Is this number / PAN protected ("do not distribute")? A record never blocks itself. */
export function isDnd(value, exceptClientId = null) {
  const k = normalize(value); if (!k) return false
  const owner = dndIndex().get(k)
  return !!owner && owner !== exceptClientId
}

// ---------------- Admin exceptions (shown on the Data Boundary page) ----------------
export function raiseException(type, text, refs = {}) {
  const s = db()
  if (!s.exceptions) s.exceptions = []
  // one open exception per type and record
  if (refs.clientId && s.exceptions.some((e) => !e.resolved && e.type === type && e.clientId === refs.clientId && (e.ref || null) === (refs.ref || null))) return null
  const e = { id: s.nextId('EXC'), type, text, at: now(), resolved: false, ...refs }
  s.exceptions.unshift(e)
  notify(s.users.filter((u) => u.role === 'Admin').map((u) => u.id), 'EXC', `${type}: ${text}`)
  return e
}
export function resolveException(id, note = '') {
  const e = db().exceptions?.find((x) => x.id === id); if (!e) return
  e.resolved = true; e.resolvedAt = now(); e.resolvedBy = db().sessionUserId; e.note = note
  // "Two advisors on one family": the other record may be called again once Admin resolves it (DECISION-19)
  if (e.type === 'Two IS on one family' && e.clientId) { const c = db().clientById(e.clientId); if (c) c.callBlocked = null }
}
export const openExceptions = () => (db().exceptions || []).filter((e) => !e.resolved)
