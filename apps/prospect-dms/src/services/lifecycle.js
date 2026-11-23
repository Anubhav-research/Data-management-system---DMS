// Client lifecycle engine - PROSPECT DMS. Source: DMS_02 (POOL-*, PL-*), DMS_X05 STAGE_TRANSITIONS, DMS_06 §3 (Admin Pool),
// §6 (Junk), §7 (IS Mapping); split prompt §6. Investor clocks and Unassigned Investors live in Investor DMS.
// Investor Family / Unassigned Family records have no timers, never go to the Pool and are not junked here
// (split prompt §6.4, DECISION-16); their owner changes only through the family log (services/familyLog.js).
import { useDb } from '@/stores/db'
import { LIMITS, FAMILY_STAGES } from '@/data/masters'
import { DAY, now } from '@/utils/format'
import { notify } from './notify'
import { isDnd, raiseException, isInvestorMember, workableMembers } from './family'

export class RuleError extends Error {}
const db = () => useDb()

export const primary = (c) => c.members[0]
export const fullName = (m) => [m?.first_name, m?.middle_name, m?.last_name].filter(Boolean).join(' ')
export const clientName = (c) => (c ? fullName(primary(c)) : '')
export const primaryMobile = (c) => (isInvestorMember(primary(c)) ? '' : primary(c)?.contacts?.[0]?.mobile || '')
export const cityState = (c) => { const a = primary(c)?.addresses?.[0]; return a ? [a.city, a.state].filter(Boolean).join(', ') : '-' }
export const productShort = (c, short) => (primary(c)?.product || []).map((k) => short[k]).filter(Boolean).join(', ')
const daysSince = (t) => (t ? Math.floor((now() - t) / DAY) : 0)
const addMonths = (t, m) => { const d = new Date(t); d.setMonth(d.getMonth() + m); return d.getTime() }

/** Prospect + Lead count for a specialist (PL-003). */
export function plCount(userId) { return db().clients.filter((c) => c.assignedTo === userId && ['Prospect', 'Lead'].includes(c.stage)).length }
export function assertRoom(userId, adding = 1) {
  if (plCount(userId) + adding > LIMITS.PL_LIMIT) {
    const u = db().userById(userId)
    // Exact wording not in sources (OPEN_QUESTIONS E7) - placeholder
    throw new RuleError(`${u?.name || 'This specialist'} has reached the Prospect and Lead limit of ${LIMITS.PL_LIMIT}. Please free space first.`)
  }
}

/** Rem. Days (PL-007; D02 §5.4) */
export function remDays(c) {
  if (['Prospect', 'Lead'].includes(c.stage)) {
    const inactivity = LIMITS.PL_INACTIVITY_DAYS - daysSince(c.lastCallAt || c.takeoverDate)
    const cap = LIMITS.PL_CAP_DAYS - daysSince(c.takeoverDate)
    return Math.max(0, Math.min(inactivity, cap))
  }
  return null // Investor Family / Unassigned Family: no 90 / 730-day timer (split prompt §6.4)
}

function stageChange(c, to, text) {
  const from = c.stage
  c.stage = to
  db().addActivity(c.id, 'stage', text || `Moved from ${from} to ${to}`)
}

// ---------------- Pool (D02 §3) ----------------
function visibleSourceNames() { return db().poolSources.filter((s) => s.visible).map((s) => s.name) }
function refreshInactivePool() {
  for (const c of db().clients) if (c.stage === 'Pool' && c.poolState === 'Inactive' && c.inactiveUntil && c.inactiveUntil < now()) { c.poolState = 'Active'; c.inactiveUntil = null }
}
/** Specialist's batch of 20 (POOL-002). Draws a batch the first time the Pool is opened. */
export function myBatch(userId) {
  refreshInactivePool()
  let batch = db().clients.filter((c) => c.stage === 'Pool' && c.batchOf === userId)
  if (!batch.length && !db().clients.some((c) => c.batchOf === userId && c._batchDrawn)) drawBatch(userId)
  batch = db().clients.filter((c) => c.stage === 'Pool' && c.batchOf === userId)
  return batch
}
export function drawBatch(userId) {
  if (plCount(userId) >= LIMITS.PL_LIMIT) return { count: 0, full: true } // POOL-015
  const sources = visibleSourceNames()
  const free = db().clients.filter((c) => c.stage === 'Pool' && c.poolState === 'Active' && !c.batchOf && !c.poolHold && sources.includes(c.source) && !holdsFamilyNumber(c))
  // random pick (POOL-002 fairness)
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]] }
  const take = free.slice(0, LIMITS.POOL_BATCH)
  take.forEach((c) => { c.batchOf = userId })
  return { count: take.length }
}
/** NEXT releases the current batch and hands a new one (POOL-003). */
export function nextBatch(userId) {
  db().clients.filter((c) => c.stage === 'Pool' && c.batchOf === userId).forEach((c) => { c.batchOf = null })
  return drawBatch(userId)
}
/** True when any number or PAN on the record belongs to an Investor Family / Unassigned Family (do not distribute). */
export function holdsFamilyNumber(c) {
  return c.members.some((m) => (m.contacts || []).some((x) => isDnd(x.mobile, c.id)) || (m.pan && isDnd(m.pan, c.id)))
}
/** Pull a Pool record out of distribution into the Admin exception list "Matches an existing family" (§6.7.4). */
export function holdPoolRecord(c, why = 'family') {
  if (c.poolHold) return
  c.poolHold = why; c.batchOf = null
  raiseException('Matches an existing family', `${clientName(c)} (${c.id}) holds a number or PAN of an existing client family. Taken out of the Pool.`, { clientId: c.id })
  db().addActivity(c.id, 'stage', 'Taken out of the Pool: matches an existing client family')
}
function toInactivePool(c) {
  c.stage = 'Pool'; c.poolState = 'Inactive'; c.inactiveUntil = now() + LIMITS.INACTIVE_POOL_DAYS * DAY; c.batchOf = null
}

/** Pool -> Prospect / Lead (T-02, T-03; D02 §3.6.4). */
export function convertFromPool(c, to, ownerId) {
  assertRoom(ownerId)
  c.everConverted = true // A4 applies only to records never converted (D06 §6.2.2)
  c.assignedTo = ownerId; c.takeoverDate = now(); c.batchOf = null; c.poolState = null
  c.lastCallAt = c.lastCallAt || now()
  stageChange(c, to, `moved it from Pool to ${to}`)
}

/** Release to Pool from any stage (T-05, T-11; PL-009, PL-012). Returns 'Junk' if A5 fires. */
export function releaseToPool(c, reason = 'Release to Pool') {
  const was = c.stage
  if (FAMILY_STAGES.includes(was)) throw new RuleError('An Investor Family never goes to the Pool.') // split prompt §6.4
  if (was === 'Pool') {
    // The record stays in the Pool, so the system Junk rules apply "in place of the Inactive Pool" (D06 §6.2.3)
    const rule = poolJunkRule(c)
    if (rule) { moveToJunk(c, 'System', 'Pool', '', rule); return 'Junk' }
    toInactivePool(c); db().addActivity(c.id, 'stage', 'Released to Pool (Inactive for 30 days)'); return 'Inactive'
  }
  const recentCall = c.lastCallAt && now() - c.lastCallAt < 30 * DAY
  const prevOwner = c.assignedTo
  c.everConverted = true // it was a Prospect / Lead / Investor
  c.assignedTo = null; c.takeoverDate = null; c.msgWindowUntil = null; c.replyWindowUntil = null
  if (reason === 'Release to Pool') c.counters.releases++
  stageChange(c, 'Pool', `${reason} from ${was}`) // seen by Admin only (fresh view below)
  // POOL-016 fresh view: the next specialist starts from a clean history. Everything up to and including the
  // release is hidden from non-Admin users; they see one neutral "Returned to the Pool" entry.
  c.freshViewAfter = now() + 1
  db().activities.push({ id: db().nextId('A'), clientId: c.id, at: c.freshViewAfter, actor: null, type: 'stage', text: 'Returned to the Pool' })
  if (c.counters.releases >= LIMITS.JUNK_RELEASES) { moveToJunk(c, 'System', 'Pool', '', 'A5'); return 'Junk' } // D06 §6.2.2 A5: returns to the Pool, then the Pool rule junks it
  if (recentCall) toInactivePool(c); else { c.poolState = 'Active'; c.inactiveUntil = null }
  c.prevOwner = prevOwner
  return c.poolState
}

export function moveToLead(c) { stageChange(c, 'Lead', 'moved it from Prospect to Lead') } // T-09 (clocks unchanged, PL-008)
export function moveToProspect(c) { stageChange(c, 'Prospect', 'moved it from Lead to Prospect') }

// Prospect/Lead -> Investor: replaced by the conversion wizard and the F1 handover (services/handover.js).

// ---------------- PAN verification (simulated Transaction Platform; D02 §5.2, INV-001) ----------------
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
/** 'empty' | 'invalid' | 'nomatch' | 'ok'. Demo rule: any valid PAN / CID verifies; a PAN starting with "X" has no match. */
export function checkPan(value) {
  const v = String(value || '').trim().toUpperCase()
  if (!v) return 'empty'
  if (!PAN_RE.test(v) && !/^CID\d+$/.test(v)) return 'invalid'
  return v.startsWith('X') ? 'nomatch' : 'ok'
}
/** Verify one person's PAN from the Data tab, at any stage (product-owner decision 06 Nov 2026).
 */
export function verifyMemberPan(c, memberKey, value) {
  const m = c.members.find((x) => x.key === memberKey)
  const state = checkPan(value)
  if (state === 'empty') throw new RuleError('Enter the PAN first, then click Verify.')
  if (state === 'invalid') throw new RuleError('PAN format must be AAAAA9999A.')
  if (state === 'nomatch') { m.panVerified = false; db().addActivity(c.id, 'data', `PAN verification for ${fullName(m)}: no match found`); return 'nomatch' }
  const v = String(value).trim().toUpperCase()
  m.pan = v; m.extra = { ...(m.extra || {}), pan: v }; m.panVerified = true; m.panVerifiedAt = now()
  db().addActivity(c.id, 'data', `PAN format checked for ${fullName(m)}. Platform registration is checked in Convert to Investor.`)
  return 'ok'
}

// ---------------- Admin bulk (D06 §3, X04 BULK_ACTIONS) ----------------
/** All-or-nothing 1500 check (D02 §3.11). */
export function adminConvert(ids, to, advisorId) {
  const list = ids.map((id) => db().clientById(id))
  if (list.some((c) => c.poolHold)) throw new RuleError('A selected record matches an existing client family and cannot be given out.') // §6.7.4
  assertRoom(advisorId, list.length)
  for (const c of list) {
    if (c.batchOf && c.batchOf !== advisorId) c.takenByAdminFrom = c.batchOf // D02 §3.12
    // Junk counters are for the life of the record; only Restore resets them (D06 §6.2.3)
    c.assignedTo = advisorId; c.takeoverDate = now(); c.batchOf = null; c.poolState = null; c.everConverted = true
    c.lastCallAt = now() // clocks start fresh (D02 §3.6.4)
    stageChange(c, to, `Admin converted to ${to} for ${db().userById(advisorId)?.name}`)
  }
  notify(advisorId, 'POOL-CONV', `Admin has assigned you ${list.length} new ${to === 'Lead' ? 'Leads' : 'Prospects'}. Click to view.`, { path: to === 'Lead' ? '/leads' : '/prospects' }, ids)
}
// ---------------- Junk (D06 §6) ----------------
const RULE_TEXT = {
  A1: '20 Pool calls did not connect', A2: '20 connected Pool calls were Not Interested', A3: 'every number on the record is dead',
  A4: '30 Pool calls without a conversion', A5: 'released to Pool five times',
}
/** Every mobile on the record (all persons). */
export const allNumbers = (c) => workableMembers(c).flatMap((m) => (m.contacts || []).filter((x) => x.mobile && !x.pendingAdd).map((x) => x.mobile))
/** A number reported as Invalid Number (phone system) or Wrong Number (specialist) counts toward A3 (D06 §6.2.2). */
export function reportNumber(c, mobile) {
  c.numberReports = c.numberReports || {}
  c.numberReports[mobile] = (c.numberReports[mobile] || 0) + 1
}
function junkLogEntry(c, action, from, comment = '') {
  const me = db().me
  db().junkLog.push({ at: now(), action, by: me ? `${me.name} (${me.mhf_id})` : 'Admin', clientId: c.id, name: clientName(c), from, comment, record: JSON.stringify(c) })
}
/** CSV text of the Junk log (D01 §375: every move to Junk and every restore). */
export function junkLogCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Date Time', 'Action', 'By', 'Record ID', 'Name', 'Moved From', 'Comment', 'Full Record (JSON)']
  const rows = db().junkLog.map((e) => [new Date(e.at).toISOString(), e.action, e.by, e.clientId, e.name, e.from, e.comment, e.record])
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n')
}
/** System Junk rules A1-A4 for a Pool record that would stay in the Pool; any one is enough (D06 §6.2.2-6.2.3).
 *  Returns the rule id or null. A5 is checked on release (releaseToPool). */
export function poolJunkRule(c) {
  const k = c.counters || {}
  if ((k.notConnected || 0) >= LIMITS.JUNK_NOT_CONNECTED) return 'A1'
  if ((k.notInterested || 0) >= LIMITS.JUNK_NOT_INTERESTED) return 'A2'
  const nums = allNumbers(c); const rep = c.numberReports || {}
  if (nums.length && nums.every((n) => (rep[n] || 0) >= LIMITS.DEAD_NUMBER_REPORTS)) return 'A3'
  if ((k.poolCalls || 0) >= LIMITS.JUNK_POOL_CALLS && !c.everConverted) return 'A4'
  return null
}
/** Move one record to Junk (Admin or System). D06 §6.3: leaves any batch, stops counting toward 1500, events leave the
 *  Calendar, pending approvals are cancelled and the requester is told [CONFIRM in D06], Activity records who did it. */
export function moveToJunk(c, by = 'Admin', from = null, comment = '', rule = null) {
  const wasOwner = c.assignedTo
  // an Investor Family remembers its family advisor: it can only be restored to them (product owner, 13 Nov 2026)
  if (c.stage === 'Investor Family') c.familyAdvisor = wasOwner
  // GEN-010 / D02 §3.11: the full record is written to the CSV log first, with time and Admin's identity
  if (by === 'Admin') junkLogEntry(c, 'Moved to Junk', from || c.stage, comment)
  c.movedFrom = from || c.stage; c.movedOn = now(); c.movedBy = by; c.junkComment = comment; c.junkRule = rule
  c.batchOf = null; c.assignedTo = null; c.poolState = null; c.inactiveUntil = null; c.callLockBy = null
  db().events.filter((e) => e.clientId === c.id && !e.cancelled).forEach((e) => { e.cancelled = true })
  db().approvals.filter((a) => a.clientId === c.id && a.status === 'Pending').forEach((a) => {
    a.status = 'Cancelled'
    notify(a.requestedBy, 'APR-CANCEL', `Your pending change request on ${clientName(c)} was cancelled because the record was moved to Junk.`)
  })
  stageChange(c, 'Junk', by === 'System' ? `Moved to Junk by the system (${rule}: ${RULE_TEXT[rule] || ''})` : `Moved to Junk by Admin${comment ? ` – “${comment}”` : ''}`)
  return wasOwner
}
/** Admin bulk Junk from Pool, Prospects, Leads, Unassigned (DMS_06 §6.2.1). Investors held by a specialist can't be junked (D02 §5.10). */
export function adminJunk(ids, comment = '') {
  const owners = {}
  for (const id of ids) {
    const c = db().clientById(id)
    // Admin may junk an Investor Family (product owner, 13 Nov 2026); not while a conversion is still pending
    if (c.stage === 'Unassigned Family') throw new RuleError('Unassigned Family records cannot be moved to Junk.')
    if (c.stage === 'Investor Family' && c.members.some((m) => m.investor?.status === 'Pending')) throw new RuleError(`${clientName(c)}: a conversion to Investor is still pending. Try again once it is confirmed.`)
  }
  for (const id of ids) { const c = db().clientById(id); const o = moveToJunk(c, 'Admin', null, comment); if (o) owners[o] = (owners[o] || 0) + 1 }
  for (const [u, n] of Object.entries(owners)) notify(u, 'JUNK', `Admin moved ${n} of your records to Junk.`) // D06 §6.3
}
/** Restore to Pool (D06 §6.5). Blocked if a number or PAN now matches an owned record. Bulk is all-or-nothing,
 *  like the other Admin bulk actions (how a partial block behaves is not specified: OPEN_QUESTIONS F7). */
export function restoreBlockers(ids) {
  const owned = db().clients.filter((o) => (o.assignedTo || FAMILY_STAGES.includes(o.stage)) && !ids.includes(o.id))
  const ownedNums = new Set(owned.flatMap(allNumbers))
  const ownedPans = new Set(owned.flatMap((o) => o.members.map((m) => m.pan).filter(Boolean)))
  return ids.map((id) => db().clientById(id)).filter((c) => allNumbers(c).some((n) => ownedNums.has(n)) || c.members.some((m) => m.pan && ownedPans.has(m.pan)))
}
export function restoreFromJunk(ids) {
  const fam = ids.map((id) => db().clientById(id)).filter((c) => c.movedFrom === 'Investor Family')
  if (fam.length) throw new RuleError(`${fam.map(clientName).join(', ')}: an Investor Family goes back only to Investor Family, with its family IS. Nothing was restored.`)
  const blocked = restoreBlockers(ids)
  if (blocked.length) throw new RuleError(`Restore is blocked: ${blocked.map(clientName).join(', ')} now match${blocked.length === 1 ? 'es' : ''} a record owned by a specialist (number or PAN). Nothing was restored.`)
  for (const id of ids) {
    const c = db().clientById(id)
    junkLogEntry(c, 'Restored', c.movedFrom || '-')
    c.junkRule = null; c.numberReports = {}
    const back = 'Pool'
    c.counters = { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }
    c.poolState = 'Active'; c.inactiveUntil = null
    stageChange(c, back, 'Restored from Junk to Pool')
  }
}

/** Restore an Investor Family from Junk: only to its family advisor (the investor's advisor; kept up to date by the
 *  family log while in Junk). Nobody else can be chosen (product owner, 13 Nov 2026). */
export function familyRestoreTargets(ids) {
  return ids.map((id) => db().clientById(id)).map((c) => ({ c, advisor: db().userById(c.familyAdvisor) }))
}
export function restoreFamiliesFromJunk(ids) {
  const list = familyRestoreTargets(ids)
  const bad = list.find((x) => x.c.movedFrom !== 'Investor Family')
  if (bad) throw new RuleError(`${clientName(bad.c)} was not an Investor Family. Use Restore to Pool.`)
  const noAdv = list.filter((x) => !x.advisor || !x.advisor.active || !x.advisor.switches?.dms)
  if (noAdv.length) throw new RuleError(`No active family IS for ${noAdv.map((x) => clientName(x.c)).join(', ')}. Nothing was restored.`)
  for (const { c, advisor } of list) {
    junkLogEntry(c, 'Restored', 'Investor Family')
    c.junkRule = null; c.junkComment = ''; c.movedFrom = null; c.assignedTo = advisor.id
    c.ownershipHistory = [...(c.ownershipHistory || []).map((h) => ({ ...h, to: h.to || now() })), { userId: advisor.id, from: now(), to: null }]
    stageChange(c, 'Investor Family', `Restored from Junk to Investor Family, with the family IS ${advisor.name}`)
    notify(advisor.id, 'FAM-ASSIGNED', `The family of ${clientName(c)} (${c.familyId}) was restored from Junk to your Investor Family list.`, { path: `/record/${c.id}` }, [c.id])
  }
}

/** Admin bulk "Assign to" on Prospect / Lead lists: record stays at the same stage (X04 BULK_ACTIONS).
 *  New takeover date, clocks restart, 1500 all-or-nothing (D02 §4.12). */
export function adminAssign(ids, userId) {
  const list = ids.map((id) => db().clientById(id))
  if (list.some((c) => FAMILY_STAGES.includes(c.stage))) throw new RuleError('An Investor Family follows the investor\'s IS. It cannot be assigned here.') // split prompt §6.4
  const pl = list.filter((c) => ['Prospect', 'Lead'].includes(c.stage)).length
  if (pl) assertRoom(userId, pl)
  for (const c of list) {
    c.assignedTo = userId
    c.takeoverDate = now(); c.lastCallAt = now()
    db().addActivity(c.id, 'owner', `Admin assigned to ${db().userById(userId).name}`)
  }
}
/** Admin bulk Release to Pool (X04 BULK_ACTIONS: Prospect, Lead). */
export function adminRelease(ids) {
  for (const id of ids) {
    const c = db().clientById(id)
    releaseToPool(c, 'Admin release')
  }
}

// ---------------- IS Mapping transfer (D06 §7, MAP-*) ----------------
export function holdings(userId) {
  const cs = db().clients.filter((c) => c.assignedTo === userId)
  return {
    prospects: cs.filter((c) => c.stage === 'Prospect').length,
    leads: cs.filter((c) => c.stage === 'Lead').length,
    // Investor Family records follow the investor's advisor (F2); IS Mapping never moves them (split prompt §6.8)
  }
}
/** plan: { prospects:[{userId,count}], leads:[{userId,count}] } */
export function validateTransfer(fromId, plan) {
  const add = {}
  for (const k of ['prospects', 'leads']) for (const a of plan[k]) if (a.userId && a.count) add[a.userId] = (add[a.userId] || 0) + Number(a.count)
  for (const [u, n] of Object.entries(add)) if (plCount(u) + n > LIMITS.PL_LIMIT) throw new RuleError(`${db().userById(u).name} would exceed the ${LIMITS.PL_LIMIT} Prospect and Lead limit (MAP-009).`)
}
export function executeTransfer(fromId, plan) {
  validateTransfer(fromId, plan)
  const summary = {}
  const bump = (u, k, n = 1) => { summary[u] = summary[u] || { prospects: 0, leads: 0 }; summary[u][k] += n }
  for (const [k, stage] of [['prospects', 'Prospect'], ['leads', 'Lead']]) {
    const pool = db().clients.filter((c) => c.assignedTo === fromId && c.stage === stage).sort(() => Math.random() - 0.5) // random (MAP-006)
    for (const a of plan[k]) {
      for (let i = 0; i < Number(a.count || 0) && pool.length; i++) {
        const c = pool.pop(); c.assignedTo = a.userId; c.takeoverDate = now(); c.lastCallAt = now() // clocks restart (PL-006)
        db().addActivity(c.id, 'owner', `Transferred via IS Mapping to ${db().userById(a.userId).name}`)
        bump(a.userId, k)
      }
    }
  }
  db().transfers.unshift({ id: db().nextId('TR'), at: now(), from: fromId, to: Object.entries(summary).map(([userId, s]) => ({ userId, ...s })), movedBy: db().sessionUserId })
  const src = db().userById(fromId).name
  // N-27 without Investors (split prompt §6.8)
  for (const [u, s] of Object.entries(summary)) notify(u, 'N-27', `You have received ${s.prospects} Prospects and ${s.leads} Leads from ${src}. Click to view.`, { path: '/prospects' })
  return summary
}

// ---------------- Clocks (system jobs, run on app start) ----------------
export function runClocks() {
  for (const c of db().clients) {
    if (['Prospect', 'Lead'].includes(c.stage) && remDays(c) <= 0) releaseToPool(c, 'Timer expiry') // PL-004 / PL-005
    if (c.stage === 'Pool' && !c.poolHold && holdsFamilyNumber(c)) holdPoolRecord(c) // §6.7.4
  }
  for (const t of db().tasks) if (['To-Do', 'In Progress'].includes(t.status) && t.due && t.due < now()) t.status = 'Expired' // TASK-005
  refreshInactivePool()
}

/** 7-day warnings (N-15..N-20) for a user, generated once per session. */
export function generateWarnings(userId) {
  const mine = db().clients.filter((c) => c.assignedTo === userId)
  const near = (stage, f) => mine.filter((c) => c.stage === stage && f(c))
  const inact = (c) => LIMITS.PL_INACTIVITY_DAYS - daysSince(c.lastCallAt || c.takeoverDate) <= LIMITS.WARNING_DAYS
  const cap = (c) => LIMITS.PL_CAP_DAYS - daysSince(c.takeoverDate) <= LIMITS.WARNING_DAYS
  const groups = [
    ['N-15', near('Prospect', inact), (n) => `You have ${n} Prospects with no call in the last 83 days. They will move to Pool in 7 days if no call is made. Click to view.`, '/prospects'],
    ['N-16', near('Prospect', cap), (n) => `You have ${n} Prospects approaching their 730-day limit. They will move to Pool in 7 days. Click to view.`, '/prospects'],
    ['N-17', near('Lead', inact), (n) => `You have ${n} Leads with no call in the last 83 days. They will move to Pool in 7 days if no call is made. Click to view.`, '/leads'],
    ['N-18', near('Lead', cap), (n) => `You have ${n} Leads approaching their 730-day limit. They will move to Pool in 7 days. Click to view.`, '/leads'],
  ]
  for (const [code, list, text, path] of groups) {
    if (!list.length) continue
    if (db().notifications.some((n) => n.to === userId && n.code === code)) continue
    notify(userId, code, text(list.length), { path }, list.map((c) => c.id))
  }
  familyReminders(userId)
}

/** DECISION-18 (default, confirm): Investor Family with no call to any non-investor member for 12 months ->
 *  notify the advisor and their TL. Nothing moves. Sent once per record per 12-month period. */
export function familyReminders(userId) {
  const due = db().clients.filter((c) => c.stage === 'Investor Family' && c.assignedTo === userId && workableMembers(c).length && daysSince(c.lastCallAt || c.convertedAt) >= LIMITS.FAMILY_REMINDER_DAYS && !(c.familyReminderAt && daysSince(c.familyReminderAt) < LIMITS.FAMILY_REMINDER_DAYS))
  for (const c of due) {
    c.familyReminderAt = now()
    const tl = db().userById(userId)?.reportsTo
    notify([userId, tl], 'FAM-REM', `No call to the family of ${clientName(c)} (${c.familyId}) for 12 months.`, { path: `/record/${c.id}` })
  }
}
