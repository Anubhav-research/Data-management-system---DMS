// F1 Investor handover, received by Investor DMS (split prompt §5.5), and platform investments (tp-sim).
import { useDb } from '@/stores/db'
import { PRODUCT_INTEREST, LIMITS } from '@/data/masters'
import { now, DAY } from '@/utils/format'
import { transact } from '@/stores/sync'
import { notify } from './notify'
import { bridge, tp, loadContract, flowOn } from './bridge'
import { clientName, assignUnassigned } from './lifecycle'
import { noteFamilyChange } from './familyLog'

const db = () => useDb()
const PRODUCT_KEY = Object.fromEntries(PRODUCT_INTEREST.map((p) => [p.label, p.key]))
const admins = () => db().users.filter((u) => u.role === 'Admin').map((u) => u.id)

export function raiseException(type, text, refs = {}) {
  const s = db()
  if (refs.ref && s.exceptions.some((e) => !e.resolved && e.type === type && e.ref === refs.ref)) return null
  const e = { id: s.nextId('EXC'), type, text, at: now(), resolved: false, ...refs }
  s.exceptions.unshift(e)
  notify(admins(), 'EXC', `${type}: ${text}`)
  return e
}
export function resolveException(id, note = '') {
  const e = db().exceptions.find((x) => x.id === id); if (!e) return
  e.resolved = true; e.resolvedAt = now(); e.resolvedBy = db().sessionUserId; e.note = note
}

/** Check against the contract: anything not allowed is dropped and logged (split prompt §5.5 step 2). */
function checkContract(h, contract) {
  const dropped = []
  const allowTop = [...(contract?.meta || []), ...(contract?.group || []), '_hash', '_attempts']
  for (const k of Object.keys(h)) if (!allowTop.includes(k)) { dropped.push(k); delete h[k] }
  for (const [i, m] of (h.members || []).entries()) {
    for (const k of Object.keys(m)) if (!(contract?.person || []).includes(k)) { dropped.push(`members[${i}].${k}`); delete m[k] }
    for (const [list, fields] of Object.entries(contract?.personLists || {})) for (const row of m[list] || []) for (const k of Object.keys(row)) if (!fields.includes(k)) { dropped.push(`members[${i}].${list}.${k}`); delete row[k] }
  }
  return dropped
}

let seq = 0
function toMember(p, key) {
  seq++
  return {
    key, first_name: p.firstName, middle_name: p.middleName || '', last_name: p.lastName, gender: p.gender || '', language: p.language || '',
    relationship: key === 'p' ? 'Primary' : p.relationship || '', pan: p.pan, date_of_birth: p.dateOfBirth || '', panVerified: true, cid: p.cid,
    contacts: (p.mobiles || []).map((x, i) => ({ id: `c${Date.now()}${seq}${i}`, type: x.type || 'Residence', mobile: x.mobile, is_whatsapp: !!x.isWhatsapp })),
    emails: (p.emails || []).map((x, i) => ({ id: `e${Date.now()}${seq}${i}`, email: x.email })),
    addresses: (p.addresses || []).map((a, i) => ({ id: `a${Date.now()}${seq}${i}`, ...a })),
    product: (p.productInterest || []).map((l) => PRODUCT_KEY[l]).filter(Boolean),
    extra: { pan: p.pan, nationality: p.nationality || '', date_of_birth: p.dateOfBirth || '' },
  }
}

/** Inv Status from the platform (D02 §5.2.4): Prospect Investor if no investment, else Active / Inactive by date. */
async function platformStatus(cids) {
  let last = null; let aum = 0; let total = 0 // total: the lifetime amount invested on the platform
  for (const cid of cids) {
    const r = await tp('GET', `/tp/profile/${encodeURIComponent(cid)}`)
    if (!r.ok) continue
    aum += r.data.aum || 0
    total += (r.data.investments || []).reduce((t, i) => t + (i.amount || 0), 0)
    if (r.data.lastInvestment && (!last || r.data.lastInvestment.date > last.date)) last = r.data.lastInvestment
  }
  if (!last) return { invStatus: 'Prospect', invClockStart: now(), lastInvDate: null, lastInvProduct: null, lastInvAmount: null, aum, totalInvested: total || null, invested: aum ? Math.min(total || aum, aum) : null }
  const active = now() - last.date < LIMITS.ACTIVE_MONTHS * 30.44 * DAY
  return { invStatus: active ? 'Active' : 'Inactive', invClockStart: last.date, lastInvDate: last.date, lastInvProduct: last.product, lastInvAmount: last.amount, aum, totalInvested: total || null, invested: aum ? Math.min(total || aum, aum) : null }
}

function blankGroup(id, familyId, platformFamilyId) {
  return {
    id, cid: id, familyId, platformFamilyId, stage: 'Investor', members: [], verifiedKeys: [],
    poolState: null, inactiveUntil: null, batchOf: null, assignedTo: null, sourceIs: null, dataCode: null, prevDataCode: null,
    takeoverDate: now(), lastCallAt: null, callStatus: null, unassignedSince: null, totalCalls: 0, source: 'Prospect DMS', importDate: now(),
    movedFrom: null, movedOn: null, movedBy: null, msgWindowUntil: null, replyWindowUntil: null,
    counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [], documents: [], createdAt: now(), handoverIds: [],
  }
}

/** Process one delivered handover (synchronous: runs inside a transaction on the latest data). */
function applyHandover(h, contract, status) {
  const dropped = checkContract(h, contract)
  const s = db()
  const pans = new Set(s.clients.flatMap((c) => c.members.map((m) => String(m.pan || '').toUpperCase())).filter(Boolean))
  // 3. PAN already exists in Investor DMS -> reject, Admin exception
  const dup = h.members.find((m) => pans.has(String(m.pan).toUpperCase()))
  if (dup) {
    raiseException('Duplicate investor', `Handover ${h.handoverId}: PAN of ${dup.firstName} ${dup.lastName} already exists in Investor DMS. Rejected.`, { ref: h.handoverId })
    return { status: 'Rejected', reasonCode: 'DUPLICATE_INVESTOR', dropped }
  }
  const advisor = s.users.find((u) => u.mhf_id === h.convertingAdvisorMhfId && u.active)
  const actedBy = h.actedByMhfId ? s.users.find((u) => u.mhf_id === h.actedByMhfId) : null
  // 4. same Family ID already here (and the same platform family) -> join that group; else a new group
  const pf = h.members[0]?.platformFamilyId
  let c = s.clients.find((x) => x.familyId === h.familyId && ['Investor', 'Unassigned'].includes(x.stage) && (!x.platformFamilyId || x.platformFamilyId === pf))
  const joined = !!c
  // another investor group of the same DMS family but a different platform family -> this one is a separate group
  const sibling = !c && s.clients.find((x) => x.familyId === h.familyId && ['Investor', 'Unassigned'].includes(x.stage) && x.platformFamilyId && x.platformFamilyId !== pf)
  if (!c) {
    const primaryRef = h.investorPrimary
    const ordered = [...h.members].sort((a, b) => (a.personRef === primaryRef ? -1 : b.personRef === primaryRef ? 1 : 0))
    c = blankGroup(ordered[0].cid, h.familyId, pf)
    c.members = ordered.map((p, i) => toMember(p, i === 0 ? 'p' : 'm' + i))
    Object.assign(c, status)
    // 5. Assigned To = converting advisor; Source IS = converting advisor; Data Code = that advisor's own code
    c.assignedTo = advisor?.id || null; c.sourceIs = advisor?.id || null; c.dataCode = advisor?.dataCodes?.[0] || null
    c.originalSource = h.sourceName || null // contract 1.1.0; older handovers and migrated investors have none
    if (!advisor) { c.stage = 'Unassigned'; c.unassignedSince = now() }
    c.ownershipHistory = advisor ? [{ userId: advisor.id, dataCode: c.dataCode, from: now(), to: null }] : []
    s.clients.unshift(c)
  } else {
    const n = c.members.length
    h.members.forEach((p, i) => c.members.push(toMember(p, 'm' + (n + i))))
    // joined an Unassigned group: it returns to the converting IS with its next new investment (product owner, 14 Nov 2026)
    if (c.stage === 'Unassigned' && advisor) c.restoreTo = advisor.id
    if (status.lastInvDate && (!c.lastInvDate || status.lastInvDate > c.lastInvDate)) Object.assign(c, { lastInvDate: status.lastInvDate, lastInvProduct: status.lastInvProduct, lastInvAmount: status.lastInvAmount, invStatus: status.invStatus })
    c.aum = (c.aum || 0) + (status.aum || 0)
    if (status.totalInvested) c.totalInvested = (c.totalInvested || 0) + status.totalInvested
    if (status.invested) c.invested = (c.invested || 0) + status.invested
  }
  c.verifiedKeys = c.members.map((m) => m.key)
  c.handoverIds = [...(c.handoverIds || []), h.handoverId]
  // 7. Activity starts with one line only; every other tab starts empty (decision 8)
  const conv = s.users.find((u) => u.mhf_id === h.convertingAdvisorMhfId)
  const d = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  s.activities.push({ id: s.nextId('A'), clientId: c.id, at: now(), actor: null, type: 'stage', text: `Received from Prospect DMS on ${d}. Converted by ${conv?.name || h.convertingAdvisorName} (${h.convertingAdvisorMhfId})${actedBy ? `, acted by ${actedBy.name} (${actedBy.mhf_id})` : ''}.${joined ? ` ${h.members.length} member(s) joined this investor group.` : ''}${sibling ? ` Registered in a different family on the Transaction Platform than ${clientName(sibling)}'s investor group, so this is a separate investor group.` : ''}` })
  // "Needs Data Code": nothing is lost, Admin is told
  if (!advisor) raiseException('Needs Data Code', `Handover ${h.handoverId}: IS ${h.convertingAdvisorMhfId} is not an active user of Investor DMS. The investor is in Unassigned Investors.`, { ref: h.handoverId, clientId: c.id })
  else if (!c.dataCode) raiseException('Needs Data Code', `Handover ${h.handoverId}: ${advisor.name} (${advisor.mhf_id}) has no Data Code. Investor ${clientName(c)} needs one.`, { ref: h.handoverId, clientId: c.id })
  // 8. notify the advisor (Investor list with a silent filter)
  if (advisor) for (const m of h.members) notify(advisor.id, 'INV-REG', `${m.firstName} ${m.lastName} has been registered as an Investor and added to your Investor list. Click to view.`, { path: '/investors' }, [c.id])
  if (c.stage === 'Unassigned' && c.restoreTo) {
    const u = s.users.find((x) => x.id === c.restoreTo)
    if (status.lastInvDate && status.lastInvDate > (c.unassignedSince || 0) && u?.dataCodes?.length) restoreToConverter(c, u, 'the new family member has already invested')
    else s.activities.push({ id: s.nextId('A'), clientId: c.id, at: now(), actor: null, type: 'owner', text: `A family member joined this Unassigned group. With the next new investment the group returns to ${u?.name || 'the converting specialist'}'s Investors.` })
  }
  noteFamilyChange(c)
  return { status: 'Accepted', reasonCode: dropped.length ? 'FIELDS_DROPPED' : null, clientId: c.id, dropped }
}

/** Pull the inbox (every 10 s, on login, and when the Data Boundary page opens; split prompt §5.5 step 1). */
export async function processInbox() {
  if (!flowOn('F1')) return { off: true }
  const r = await bridge('GET', '/handover/inbox')
  if (!r.ok) return { error: r.status }
  const contract = await loadContract()
  let n = 0
  for (const h of r.data.items) {
    const done = db().inbox.find((x) => x.handoverId === h.handoverId && x.attempt === h._attempts)
    if (done) { queueAck(done); continue } // processed already (maybe by another tab): only the ack is missing
    const hash = h._hash; const attempt = h._attempts
    const status = await platformStatus(h.members.map((m) => m.cid)) // platform lookups first, outside the transaction
    // record + inbox entry + queued ack are saved together on the latest data; the ack is sent only after that save
    const created = await transact(() => {
      if (db().inbox.some((x) => x.handoverId === h.handoverId && x.attempt === attempt)) return false // another tab was faster
      const res = applyHandover(JSON.parse(JSON.stringify(h)), contract, status)
      db().inbox.unshift({ handoverId: h.handoverId, attempt, receivedAt: now(), familyId: h.familyId, clientId: res.clientId || null, members: h.members.length, advisorMhfId: h.convertingAdvisorMhfId, status: res.status, reasonCode: res.reasonCode, hash, dropped: res.dropped, contractVersion: h.contractVersion })
      queueAck(db().inbox[0])
      return true
    })
    if (created) n++
  }
  await sendAcks()
  return { processed: n }
}
function queueAck(entry) {
  const s = db()
  if (s.ackOutbox.some((a) => a.handoverId === entry.handoverId && a.attempt === entry.attempt)) return
  s.ackOutbox.push({ handoverId: entry.handoverId, attempt: entry.attempt, status: entry.status, reasonCode: entry.reasonCode, at: new Date().toISOString() })
}
/** F1-ack: {handoverId, status, reasonCode, at} only. Kept until the bridge takes it. */
export async function sendAcks() {
  if (!flowOn('F1_ACK')) return
  for (const a of db().ackOutbox.slice()) {
    const r = await bridge('POST', `/handover/${encodeURIComponent(a.handoverId)}/ack`, { status: a.status, reasonCode: a.reasonCode, at: a.at })
    if (r.ok) { db().ackOutbox = db().ackOutbox.filter((x) => x !== a); const e = db().inbox.find((x) => x.handoverId === a.handoverId && x.attempt === a.attempt); if (e) e.ackedAt = now() }
  }
}

/** An Unassigned group that a family member joined goes back, as one group, to the specialist who converted that member. */
function restoreToConverter(c, u, why) {
  assignUnassigned([c.id], u.id, u.dataCodes[0], `Back to ${u.name}'s Investors: a family member converted by ${u.name} joined this group and ${why}.`, true)
  c.restoreTo = null // assignUnassigned already notifies the specialist (N-14, with a filter to the group)
}

// ---------------- Platform investments (tp-sim) ----------------
/** New investments update Inv Status; an Unassigned investor whose platform record names an employee is assigned
 *  to that employee (D06 §5.2). Each change goes to the family log. */
export async function pullInvestments() {
  const s = db()
  const r = await tp('GET', `/tp/investments?since=${s.tpInvCursor || 0}`)
  if (!r.ok) return
  if (s.tpInvCursor == null || r.data.last < s.tpInvCursor) { s.tpInvCursor = r.data.last; return } // start watching from now
  for (const inv of r.data.items.sort((a, b) => a.seq - b.seq)) {
    if (inv.seq <= s.tpInvCursor) continue
    s.tpInvCursor = inv.seq
    const c = s.clients.find((x) => x.members.some((m) => m.cid === inv.cid) && ['Investor', 'Unassigned'].includes(x.stage))
    if (!c) continue
    if (!c.lastInvDate || inv.date >= c.lastInvDate) Object.assign(c, { lastInvDate: inv.date, lastInvProduct: inv.product, lastInvAmount: inv.amount, invClockStart: inv.date, reassignedUntil: null })
    c.aum = (c.aum || 0) + inv.amount
    c.totalInvested = (c.totalInvested || 0) + inv.amount
    c.invested = (c.invested || 0) + inv.amount // a new investment adds to both: what was put in and what it is worth
    if (now() - inv.date < LIMITS.ACTIVE_MONTHS * 30.44 * DAY) c.invStatus = 'Active'
    s.activities.push({ id: s.nextId('A'), clientId: c.id, at: now(), actor: null, type: 'stage', text: `Investment on the Transaction Platform: ${inv.product}, ₹${Number(inv.amount).toLocaleString('en-IN')}.` })
    const back = c.stage === 'Unassigned' && c.restoreTo && s.users.find((x) => x.id === c.restoreTo && x.active)
    if (back && back.dataCodes?.length) restoreToConverter(c, back, 'a new investment came in')
    else if (c.stage === 'Unassigned') {
      const p = await tp('GET', `/tp/profile/${encodeURIComponent(inv.cid)}`)
      const u = p.ok && s.users.find((x) => x.mhf_id === p.data.advisorMhfId && x.active)
      if (u && u.dataCodes?.length) assignUnassigned([c.id], u.id, u.dataCodes[0], `Assigned to ${u.name} by a platform investment naming this employee (D06 §5.2)`, true)
    }
    noteFamilyChange(c)
  }
}
