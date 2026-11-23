// Client lifecycle engine - INVESTOR DMS. Source: DMS_02 §5-§6 (INV-*, UN-*), DMS_X05 T-12..T-24, DMS_06 §5
// (Unassigned), §6 (Junk), §7 (IS Mapping); split prompt §7.
// Only people registered on the Transaction Platform live here. Records arrive by the F1 handover, the one-time
// migration seed, or a platform investment for an Unassigned investor that names an employee. There is no path
// back to Prospect DMS: no Release to Pool, no Convert (split prompt §7.2.2).
// Every change of advisor, Unassigned status or "invested in the last 18 months" is reported to Prospect DMS
// through the family log F2 (services/familyLog.js).
import { useDb } from '@/stores/db'
import { LIMITS } from '@/data/masters'
import { DAY, now, fmtDate, fmtDateTime } from '@/utils/format'
import { notify } from './notify'
import { noteFamilyChange } from './familyLog'

export class RuleError extends Error {}
const db = () => useDb()

export const primary = (c) => c.members[0]
export const fullName = (m) => [m?.first_name, m?.middle_name, m?.last_name].filter(Boolean).join(' ')
export const clientName = (c) => (c ? fullName(primary(c)) : '')
export const primaryMobile = (c) => primary(c)?.contacts?.[0]?.mobile || ''
export const cityState = (c) => { const a = primary(c)?.addresses?.[0]; return a ? [a.city, a.state].filter(Boolean).join(', ') : '-' }
export const productShort = (c, short) => (primary(c)?.product || []).map((k) => short[k]).filter(Boolean).join(', ')
const daysSince = (t) => (t ? Math.floor((now() - t) / DAY) : 0)
export const addMonths = (t, m) => { const d = new Date(t); d.setMonth(d.getMonth() + m); return d.getTime() }

/** Investors held by a specialist (shown where the demo showed the Prospect + Lead count). No 1500 limit here. */
export function plCount(userId) { return db().clients.filter((c) => c.assignedTo === userId && c.stage === 'Investor').length }
export function assertRoom() { /* the 1500 limit counts Prospects + Leads only (PL-003): nothing to check in Investor DMS */ }

/** Rem. Days (INV-002 / INV-004; D02 §5.4) */
export function remDays(c) {
  if (c.stage !== 'Investor') return null
  if (c.invStatus === 'Prospect') return Math.max(0, LIMITS.PROSPECT_INVESTOR_DAYS - daysSince(c.invClockStart))
  const end = c.reassignedUntil || addMonths(c.lastInvDate || c.invClockStart, LIMITS.INACTIVE_TO_UNASSIGNED_MONTHS)
  return Math.max(0, Math.ceil((end - now()) / DAY))
}
/** Invested in the last 18 months (the only investment fact Prospect DMS receives, as Yes/No; split prompt §4 F2). */
export const investedLast18Months = (c) => (c.lastInvDate && c.lastInvDate > addMonths(now(), -LIMITS.INACTIVE_TO_UNASSIGNED_MONTHS) ? 'Yes' : 'No')

function stageChange(c, to, text, system = false) {
  const from = c.stage
  c.stage = to
  db().addActivity(c.id, 'stage', text || `Moved from ${from} to ${to}`, system ? { actor: null } : {}) // system jobs: no person
}

// ---------------- PAN (Data tab) ----------------
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export function checkPan(value) {
  const v = String(value || '').trim().toUpperCase()
  if (!v) return 'empty'
  if (!PAN_RE.test(v) && !/^CID\d+$/.test(v)) return 'invalid'
  return 'ok'
}
/** Everyone in an investor group is already verified on the platform (they arrive only by F1 or migration). */
export function verifyMemberPan(c, memberKey) {
  const m = c.members.find((x) => x.key === memberKey)
  if (!m?.panVerified) throw new RuleError('Members of an investor group arrive verified from the Transaction Platform.')
  return 'ok'
}

// ---------------- Family (DECISION-20) ----------------
/** All records of the same Family ID at the same stage (one family can span several investor groups when the
 *  platform holds them as different families). */
export const familyRecords = (c, stage = c.stage) => db().clients.filter((x) => x.familyId && x.familyId === c.familyId && x.stage === stage)
/** DECISION-20 (default, confirm): assignment and IS Mapping move every group of a family together. */
function withFamily(list) {
  const out = new Map(list.map((c) => [c.id, c]))
  for (const c of list) for (const x of familyRecords(c)) out.set(x.id, x)
  return [...out.values()]
}
export function familyExtras(ids) { const list = ids.map((id) => db().clientById(id)); return withFamily(list).filter((c) => !ids.includes(c.id)) }

function setOwner(c, userId, dataCode, why, system = false) {
  c.assignedTo = userId; c.restoreTo = null
  c.ownershipHistory = [...(c.ownershipHistory || []).map((h) => ({ ...h, to: h.to || now() })), { userId, dataCode: dataCode ?? c.dataCode, from: now(), to: null }]
  db().addActivity(c.id, 'owner', why, system ? { actor: null } : {})
  noteFamilyChange(c)
}

// ---------------- Admin bulk Assign to (X04 BULK_ACTIONS). No Release to Pool in Investor DMS. ----------------
/** Investor: the Data Code stays on the investor and the new specialist handles it as a delegated book (D02 §5.11). */
export function adminAssign(ids, userId) {
  const list = withFamily(ids.map((id) => db().clientById(id)))
  if (list.some((c) => c.stage !== 'Investor')) throw new RuleError('Only Investors can be assigned here.')
  for (const c of list) setOwner(c, userId, c.dataCode, `Admin assigned to ${db().userById(userId).name}${ids.includes(c.id) ? '' : ' (same family, moved together – DECISION-20)'}`)
  return list.length
}

// ---------------- Junk: only from Unassigned (split prompt §7.2.2) ----------------
export const allNumbers = (c) => c.members.flatMap((m) => (m.contacts || []).filter((x) => x.mobile && !x.pendingAdd).map((x) => x.mobile))
export function reportNumber(c, mobile) { c.numberReports = c.numberReports || {}; c.numberReports[mobile] = (c.numberReports[mobile] || 0) + 1 }
function junkLogEntry(c, action, from, comment = '') {
  const me = db().me
  db().junkLog.push({ at: now(), action, by: me ? `${me.name} (${me.mhf_id})` : 'Admin', clientId: c.id, name: clientName(c), from, comment, record: JSON.stringify(c) })
}
/** CSV of the Junk log, newest first. Readable columns come from the record as it was at that moment (the saved copy),
 *  so an entry still shows the investor's value and advisor after the record changes. The full copy stays as the last
 *  column (GEN-010: enough to rebuild the record). Amounts are plain numbers so they add up in Excel. */
export function junkLogCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Date & Time', 'Action', 'Done By', 'Client ID', 'Name', 'Mobile No.', 'City & State', 'AUM (₹)', 'Last Investment Date',
    'Last Investment Product', 'Last Investment Amount (₹)', 'Previous IS', 'Data Code', 'Reason / Comment', 'Full Record (JSON)']
  const rows = [...db().junkLog].sort((a, b) => b.at - a.at).map((e) => {
    let c = {}; try { c = JSON.parse(e.record || '{}') } catch { /* keep the readable columns empty */ }
    const code = c.dataCode || c.prevDataCode // the advisor is the owner of the Data Code the investor sat under
    const adv = db().users.find((u) => code && u.dataCodes?.includes(code)) || db().userById(c.sourceIs || c.assignedTo)
    return [fmtDateTime(e.at), e.action, e.by, c.cid || '', e.name || clientName(c), c.members ? primaryMobile(c) : '', c.members ? cityState(c) : '',
      c.aum || 0, c.lastInvDate ? fmtDate(c.lastInvDate) : 'No investment', c.lastInvProduct || '', c.lastInvAmount || '',
      adv ? `${adv.name} (${adv.mhf_id})` : '', c.dataCode || c.prevDataCode || '', e.comment || '', e.record]
  })
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') // BOM: Excel shows ₹ correctly
}
export function moveToJunk(c, by = 'Admin', from = null, comment = '', rule = null) {
  if (c.stage !== 'Unassigned') throw new RuleError('Only Unassigned Investors can be moved to Junk.')
  if (by === 'Admin') junkLogEntry(c, 'Moved to Junk', from || c.stage, comment)
  c.movedFrom = 'Unassigned'; c.movedOn = now(); c.movedBy = by; c.junkComment = comment; c.junkRule = rule
  c.assignedTo = null; c.callLockBy = null
  db().events.filter((e) => e.clientId === c.id && !e.cancelled).forEach((e) => { e.cancelled = true })
  db().approvals.filter((a) => a.clientId === c.id && a.status === 'Pending').forEach((a) => { a.status = 'Cancelled'; notify(a.requestedBy, 'APR-CANCEL', `Your pending change request on ${clientName(c)} was cancelled because the record was moved to Junk.`) })
  stageChange(c, 'Junk', `Moved to Junk by Admin${comment ? ` – “${comment}”` : ''}`)
}
export function adminJunk(ids, comment = '') {
  for (const id of ids) if (db().clientById(id).stage !== 'Unassigned') throw new RuleError("Investors held by a specialist can't be junked. Junk is only for Unassigned Investors.")
  for (const id of ids) moveToJunk(db().clientById(id), 'Admin', null, comment)
}
/** Restore returns to Unassigned Investors (split prompt §7.2.2). */
export function restoreFromJunk(ids) {
  for (const id of ids) {
    const c = db().clientById(id)
    junkLogEntry(c, 'Restored to Unassigned', c.movedFrom || '-')
    c.junkRule = null; c.numberReports = {}; c.unassignedSince = now()
    stageChange(c, 'Unassigned', 'Restored from Junk to Unassigned Investors')
  }
}

// ---------------- Unassigned (D02 §6, UN-*, INV-009) ----------------
export function assignUnassigned(ids, userId, dataCode, why = null, system = false) {
  const list = withFamily(ids.map((id) => db().clientById(id)))
  for (const c of list) {
    c.prevDataCode = c.dataCode || c.prevDataCode
    c.dataCode = dataCode; c.unassignedSince = null
    if (c.invStatus === 'Prospect') c.invClockStart = now() // fresh 90 days
    else if (!(c.lastInvDate && now() - c.lastInvDate < LIMITS.ACTIVE_MONTHS * 30 * DAY)) { c.invStatus = 'Inactive'; c.reassignedUntil = addMonths(now(), LIMITS.REASSIGNED_INACTIVE_MONTHS) } // fresh 12 months
    c.stage = 'Investor'
    setOwner(c, userId, dataCode, why || `Assigned from Unassigned Investors to ${db().userById(userId)?.name} (${dataCode})`, system)
  }
  const n = list.length
  notify(userId, 'N-14', n === 1 ? 'You have been assigned 1 new Bonus Investor. Click to view.' : `You have been assigned ${n} new Bonus Investors. Click to view.`, { path: '/investors' }, list.map((c) => c.id))
}

// ---------------- IS Mapping transfer: Investors and Data Codes only (D06 §7, MAP-*; split prompt §7.2.9) ----------------
export function holdings(userId) {
  const cs = db().clients.filter((c) => c.assignedTo === userId && c.stage === 'Investor')
  return { prospects: 0, leads: 0, investors: cs.length, codes: [...new Set(cs.filter((c) => c.dataCode).map((c) => c.dataCode))] }
}
export function validateTransfer() { /* no 1500 limit for investors */ }
/** plan: { codes: { [code]: userId } } - a whole Data Code moves (MAP-007). */
export function executeTransfer(fromId, plan) {
  const summary = {}
  const bump = (u, n, code) => { summary[u] = summary[u] || { prospects: 0, leads: 0, investors: 0, codes: [] }; summary[u].investors += n; if (code) summary[u].codes.push(code) }
  for (const [code, userId] of Object.entries(plan.codes || {})) {
    if (!userId) continue
    const direct = db().clients.filter((c) => c.assignedTo === fromId && c.stage === 'Investor' && c.dataCode === code)
    const list = withFamily(direct) // DECISION-20: other groups of the same family move with it
    const to = db().userById(userId)
    list.forEach((c) => setOwner(c, userId, c.dataCode, direct.includes(c) ? `Data Code ${code} transferred via IS Mapping to ${to.name}` : `Moved with its family (Data Code ${code} transferred to ${to.name}) – DECISION-20`))
    const from = db().userById(fromId)
    from.dataCodes = from.dataCodes.filter((d) => d !== code); if (!to.dataCodes.includes(code)) to.dataCodes.push(code)
    bump(userId, list.length, code)
  }
  db().transfers.unshift({ id: db().nextId('TR'), at: now(), from: fromId, to: Object.entries(summary).map(([userId, s]) => ({ userId, ...s })), movedBy: db().sessionUserId })
  const src = db().userById(fromId).name
  for (const [u, s] of Object.entries(summary)) notify(u, 'N-27', `You have received ${s.investors} Investors from ${src}. Click to view.`, { path: '/investors' }) // N-27, Investors only
  return summary
}

// ---------------- Clocks (system jobs) ----------------
/** DECISION-29 (default, confirm): moves to Unassigned happen in the nightly job ("Run daily jobs" in the demo), not on
 *  every page load. On every start: status refresh and expiries. With daily=true ("Run daily jobs" / the nightly job) investors whose
 *  clock ran out move to Unassigned Investors (T-19 / T-20) and the family log reports it. */
/**
 * End-of-day values (product owner, 21 Nov 2026): after the market closes (3:30 pm, Monday to Friday) each investor's
 * AUM - what the investments are worth now - moves with the market; the invested value stays. In production the
 * Transaction Platform sends the day's values; here each investor gets a small fixed move per day (-1.5% to +1.8%).
 */
export function lastClose(t = now()) {
  const d = new Date(t); d.setHours(15, 30, 0, 0); if (t < d.getTime()) d.setDate(d.getDate() - 1)
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() - 1)
  return d.getTime()
}
const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
export function refreshValues() {
  const close = lastClose(); let n = 0
  for (const c of db().clients) {
    if (!c.aum || (c.valuesAsOf || 0) >= close) continue
    const days = c.valuesAsOf ? Math.min(5, Math.max(1, Math.round((close - c.valuesAsOf) / DAY))) : 0
    for (let i = 0; i < days; i++) c.aum = Math.round(c.aum * (1 + ((hash(c.id + (close - i * DAY)) % 331) - 150) / 10000))
    c.valuesAsOf = close; n++
  }
  return n
}
export function runClocks(daily = false) {
  refreshValues()
  const moved = []
  for (const c of db().clients) {
    if (c.stage !== 'Investor') continue
    if (c.invStatus === 'Active' && c.lastInvDate && now() > addMonths(c.lastInvDate, LIMITS.ACTIVE_MONTHS)) c.invStatus = 'Inactive' // T-17
    if (daily && c.invStatus !== 'Active' && remDays(c) <= 0) {
      const old = c.assignedTo
      c.prevDataCode = c.dataCode; c.prevOwner = old; c.assignedTo = null; c.unassignedSince = now()
      stageChange(c, 'Unassigned', 'Moved to Unassigned Investors (system)', true)
      noteFamilyChange(c)
      moved.push(c.id)
    }
    if (c.f2Invested && c.f2Invested !== investedLast18Months(c)) noteFamilyChange(c)
  }
  for (const d of db().deals) if (d.status === 'Scheduled' && d.end < now()) d.status = 'Expired' // DEAL-009
  for (const t of db().tasks) if (['To-Do', 'In Progress'].includes(t.status) && t.due && t.due < now()) t.status = 'Expired' // TASK-005
  return moved
}

/** 7-day warnings for investors (N-19 / N-20), generated once per session. */
export function generateWarnings(userId) {
  const mine = db().clients.filter((c) => c.assignedTo === userId && c.stage === 'Investor')
  const groups = [
    ['N-19', mine.filter((c) => c.invStatus === 'Inactive' && remDays(c) <= LIMITS.WARNING_DAYS), (n) => `You have ${n} Inactive Investors close to moving to Unassigned. Click to view.`],
    ['N-20', mine.filter((c) => c.invStatus === 'Prospect' && remDays(c) <= LIMITS.WARNING_DAYS), (n) => `You have ${n} Prospect Investors with no investment in the last 83 days. Click to view.`],
  ]
  for (const [code, list, text] of groups) {
    if (!list.length) continue
    if (db().notifications.some((n) => n.to === userId && n.code === code)) continue
    notify(userId, code, text(list.length), { path: '/investors' }, list.map((c) => c.id))
  }
}
