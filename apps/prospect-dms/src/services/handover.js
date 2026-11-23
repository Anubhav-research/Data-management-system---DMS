// Conversion to Investor and the F1 Investor handover (split prompt §5).
// Only the verified people's basic details cross (the contract in services/bridge/contract). History stays here.
import { useDb } from '@/stores/db'
import { PRODUCT_INTEREST } from '@/data/masters'
import { now } from '@/utils/format'
import { transact } from '@/stores/sync'
import { RuleError, clientName, fullName } from './lifecycle'
import { notify } from './notify'
import { bridge, tp, loadContract, INVESTOR_DATA_MODE } from './bridge'
import { isInvestorMember, workableMembers, raiseException, normalize, isFamilyComplete } from './family'
export const familyDoneText = (c) => `Congratulations! You have registered every member of family ${c.familyId} (primary member: ${fullName(c.members[0])}) on the Money Honey Transaction Platform. The whole family is now in Investor DMS.`

const db = () => useDb()
const PRODUCT_LABEL = Object.fromEntries(PRODUCT_INTEREST.map((p) => [p.key, p.label]))
export const CONVERTIBLE_STAGES = ['Prospect', 'Lead', 'Investor Family']

// ---------------- Step 1: verify on the Transaction Platform ----------------
/** One row per non-investor member, PAN/CID prefilled from the Data tab. */
export function wizardRows(c) {
  return workableMembers(c).map((m) => ({ key: m.key, name: fullName(m), rel: m.relationship, value: (m.pan || m.extra?.pan || '').toUpperCase(), state: '', tp: null }))
}
/** Calls tp-sim POST /tp/verify for one row. */
export async function verifyRow(row) {
  const v = String(row.value || '').trim().toUpperCase(); row.value = v
  if (!v) { row.state = ''; row.tp = null; return row }
  row.state = 'checking'
  const r = await tp('POST', '/tp/verify', { value: v })
  if (!r.ok) { row.state = 'error'; row.tp = null; return row }
  row.tp = r.data
  row.state = { registered: 'registered', nomatch: 'nomatch', invalid: 'invalid', empty: '' }[r.data.result] ?? 'error'
  return row
}
/**
 * Final state per row: verified · nomatch · invalid · other-advisor (already an investor with another advisor) ·
 * other-family (different family on the platform). Mutates rows.
 * The people converted together must share one platform family (D03 §25.2). That family may differ from the one of
 * this family's earlier investors: they are then converted as a SEPARATE investor group in Investor DMS
 * (product owner, 13 Nov 2026) and r.separate is set.
 */
export function classifyRows(c, rows) {
  const ownerMhf = db().userById(c.assignedTo)?.mhf_id
  // reference platform family: the first registered person in Data-tab order
  let refFamily = null
  for (const r of rows) {
    r.separate = false
    if (!['registered', 'verified', 'other-family', 'other-advisor'].includes(r.state) || !r.tp) continue
    if (r.tp.advisorMhfId && r.tp.advisorMhfId !== ownerMhf) { r.state = 'other-advisor'; continue } // D03 §25.4, from tp-sim data only
    if (!refFamily) refFamily = r.tp.platformFamilyId
    r.state = r.tp.platformFamilyId === refFamily ? 'verified' : 'other-family' // D03 §25.2
    r.separate = r.state === 'verified' && !!c.platformFamilyId && r.tp.platformFamilyId !== c.platformFamilyId
  }
  return rows
}
export const DIFFERENT_FAMILY_MSG = 'These members belong to different families on the Transaction Platform. Move them into separate groups first, then convert each group to Investor.' // D03 §25.2
export function blockReason(rows) {
  if (rows.some((r) => r.state === 'other-family')) return DIFFERENT_FAMILY_MSG
  const adv = rows.find((r) => r.state === 'other-advisor')
  if (adv) return `${adv.name} is already an investor with ${adv.tp.advisorName || adv.tp.advisorMhfId}. Conversion is blocked.` // D03 §25.4 names the specialist
  if (!rows.some((r) => r.state === 'verified')) return 'At least one person must be verified on the Transaction Platform to continue.'
  return null
}

// ---------------- Step 2 and Confirm ----------------
/** DECISION-11 (default, confirm): if the family primary isn't verified, the first verified person in Data-tab order is preselected. */
export function defaultInvestorPrimary(c, rows) {
  const verified = rows.filter((r) => r.state === 'verified')
  return verified.find((r) => r.key === c.members[0].key)?.key || verified[0]?.key || null
}

function istIso(t = now()) {
  const d = new Date(t + 5.5 * 3600000)
  return d.toISOString().replace('Z', '+05:30')
}
function nextHandoverId() {
  const s = db(); s.handoverSeq = (s.handoverSeq || 0) + 1
  const d = new Date(); const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `HND-${ymd}-${String(s.handoverSeq).padStart(4, '0')}`
}
const val = (m, k) => m[k] ?? m.extra?.[k] ?? null

/** The F1 content: contract fields only, verified people only (split prompt §5.4). */
export function buildPayload(c, verifiedRows, investorPrimaryKey, handoverId, contractVersion) {
  const owner = db().userById(c.assignedTo); const me = db().me
  const famPrimaryIsInvestorPrimary = investorPrimaryKey === c.members[0].key
  const ref = (key) => 'P' + (c.members.findIndex((m) => m.key === key) + 1)
  const members = verifiedRows.map((r) => {
    const m = c.members.find((x) => x.key === r.key)
    // DECISION-27 (default, confirm): relationship is recorded against the family primary; when someone else becomes the
    // investor primary it is not known, so "[to be confirmed]" is sent and Investor DMS completes it
    // the family primary is already an investor: this person joins (or sits beside) that group, so the relationship to the
    // family primary is known and is sent as it is (a daughter stays Daughter, not Primary)
    const relationship = c.members[0].investor ? m.relationship || '' : r.key === investorPrimaryKey ? 'Primary' : famPrimaryIsInvestorPrimary ? m.relationship : '[to be confirmed]'
    return {
      personRef: ref(r.key), firstName: m.first_name, middleName: m.middle_name || '', lastName: m.last_name,
      gender: m.gender || null, dateOfBirth: val(m, 'date_of_birth'), language: m.language || null, nationality: val(m, 'nationality'),
      relationship, pan: r.tp.pan, cid: r.tp.cid, platformFamilyId: r.tp.platformFamilyId,
      mobiles: (m.contacts || []).filter((x) => x.mobile && !x.pendingAdd).map((x) => ({ type: x.type, mobile: x.mobile, isWhatsapp: !!x.is_whatsapp })),
      emails: (m.emails || []).filter((e) => !e.pendingAdd).map((e) => ({ email: e.email })),
      addresses: (m.addresses || []).map((a) => ({ type: a.type, address: a.address, city: a.city, pin: a.pin, state: a.state, country: a.country })),
      productInterest: (m.product || []).map((k) => PRODUCT_LABEL[k] || k),
    }
  })
  return {
    handoverId, idempotencyKey: handoverId, contractVersion, createdAt: istIso(), familyId: c.familyId,
    convertingAdvisorMhfId: owner?.mhf_id || null, convertingAdvisorName: owner?.name || null,
    actedByMhfId: me && me.id !== c.assignedTo ? me.mhf_id : null, convertedFromStage: c.stage,
    investorPrimary: ref(investorPrimaryKey), members,
  }
}

/** Re-checks at the moment of Confirm (split prompt §5.3 step 1), on the data as it is now. */
function recheckRecord(clientId, verifiedRows) {
  const c = db().clientById(clientId)
  if (!c || !CONVERTIBLE_STAGES.includes(c.stage)) throw new RuleError('This record is no longer a Prospect, Lead or Investor Family. Nothing was converted.')
  if (verifiedRows.some((r) => c.members.find((m) => m.key === r.key)?.investor || !c.members.some((m) => m.key === r.key))) throw new RuleError('This family changed while converting. Nothing was converted.')
  // DECISION-12 (default, confirm): block while an approval request is pending on the record
  if (db().approvals.some((a) => a.clientId === c.id && a.status === 'Pending')) throw new RuleError('Resolve the pending approval request before converting.')
  if (c.callLockBy || db().activeCall?.clientId === c.id) throw new RuleError('A call is in progress on this group. Convert after the call.')
  if (c.ownershipPending) throw new RuleError('Ownership update pending on this family. Contact Admin.')
  return c
}
async function recheckPlatform(verifiedRows) {
  for (const r of verifiedRows) {
    const fresh = await tp('POST', '/tp/verify', { value: r.value })
    if (!fresh.ok) throw new RuleError('The Transaction Platform is not reachable. Nothing was converted. Try again.')
    if (fresh.data.result !== 'registered' || fresh.data.cid !== r.tp.cid || fresh.data.platformFamilyId !== r.tp.platformFamilyId) throw new RuleError(`Platform details for ${r.name} changed. Verify again.`)
  }
}

/**
 * Confirm conversion (split prompt §5.3). All or nothing in Prospect DMS; the handover is written to the outbox
 * and saved on the server BEFORE it is sent, so a bridge outage never loses it.
 */
export async function confirmConversion(clientId, rows, investorPrimaryKey) {
  const verifiedRows = rows.filter((r) => r.state === 'verified')
  if (!verifiedRows.length) throw new RuleError('At least one person must be verified on the Transaction Platform to continue.')
  const contract = await loadContract()
  recheckRecord(clientId, verifiedRows)
  await recheckPlatform(verifiedRows)
  // all or nothing, on the latest data; re-applied if someone else saved meanwhile (stores/sync.js transact)
  const handoverId = await transact(() => applyConversion(clientId, verifiedRows, investorPrimaryKey, contract))
  sendHandover(handoverId) // fire and forget; the outbox job retries
  return handoverId
}

function applyConversion(clientId, verifiedRows, investorPrimaryKey, contract) {
  const c = recheckRecord(clientId, verifiedRows)
  const handoverId = nextHandoverId()
  const payload = buildPayload(c, verifiedRows, investorPrimaryKey, handoverId, contract?.contractVersion || '1.0.0')
  const at = now(); const fromStage = c.stage
  const keys = verifiedRows.map((r) => r.key)
  const names = verifiedRows.map((r) => r.name)
  // 2. outbox
  db().handovers.unshift({
    id: handoverId, clientId: c.id, familyId: c.familyId, memberKeys: keys, memberCount: keys.length, status: 'Pending', delivery: 'outbox',
    createdAt: at, sentAt: null, ackAt: null, reasonCode: null, attempts: 0, nextTryAt: at, lastError: null, hash: null,
    contractVersion: payload.contractVersion, convertedFromStage: fromStage, advisorId: c.assignedTo, actedBy: db().sessionUserId, payload,
  })
  // 3. the whole record moves to Investor Family (same Client ID, history and advisor); 90/730-day timers stop
  if (fromStage !== 'Investor Family') { c.stage = 'Investor Family'; c.convertedAt = at; c.convertedFromStage = fromStage }
  const separate = !!c.platformFamilyId && verifiedRows[0].tp.platformFamilyId !== c.platformFamilyId // not the earlier investors' platform family
  c.platformFamilyId = c.platformFamilyId || verifiedRows[0].tp.platformFamilyId
  // 4. tag the verified people INVESTOR
  for (const r of verifiedRows) { const m = c.members.find((x) => x.key === r.key); m.investor = { handoverId, convertedAt: at, status: 'Pending', cid: r.tp.cid, platformFamilyId: r.tp.platformFamilyId, separateFamily: separate, dataRemoved: false }; m.pan = r.tp.pan }
  // 5. future events: closed when only investors were on them, else the investors are taken off the client list
  for (const e of db().events.filter((x) => x.clientId === c.id && !x.cancelled && x.start > at)) {
    const left = (e.clientNames || []).filter((n) => !names.includes(n))
    if ((e.clientNames || []).length && !left.length) { e.cancelled = true; e.closedReason = 'Closed – client converted'; e.closedAt = at }
    else e.clientNames = left
  }
  // 6. messaging windows: investors' numbers leave the selectors (calls.js); the record window stays for the other members
  // 7. not counted toward 1500 any more (plCount counts Prospect + Lead only; DECISION-14)
  // DECISION-19 (default, confirm): a verified person's number on another advisor's Prospect/Lead -> Admin exception + calls blocked there
  const nums = new Set(verifiedRows.flatMap((r) => (c.members.find((m) => m.key === r.key).contacts || []).map((x) => normalize(x.mobile))).filter(Boolean))
  for (const o of db().clients) {
    if (o.id === c.id || !['Prospect', 'Lead'].includes(o.stage) || o.assignedTo === c.assignedTo) continue
    if (o.members.some((m) => (m.contacts || []).some((x) => nums.has(normalize(x.mobile))))) {
      const e = raiseException('Two IS on one family', `${clientName(o)} (${o.id}) holds a number of a person just converted from family ${c.familyId}. Calls blocked until resolved.`, { clientId: o.id, ref: c.familyId })
      o.callBlocked = { reason: 'Two IS on one family', exceptionId: e?.id || null }
    }
  }
  // 8. Activity
  db().addActivity(c.id, 'stage', separate
    ? `converted ${names.join(', ')} to Investor. Registered in a different family on the Transaction Platform, so a separate investor group in Investor DMS.`
    : `converted ${keys.length} member(s) to Investor. Family moved to Investor Family.`)
  return handoverId
}

// ---------------- Outbox: send, retry with backoff, read the acknowledgement ----------------
const findH = (id) => db().handovers.find((h) => h.id === id)
const backoff = (n) => Math.min(60000, 2000 * 2 ** Math.max(0, n - 1))

export async function sendHandover(id) {
  let h = findH(id)
  if (!h || h.status !== 'Pending' || h.delivery !== 'outbox' || !h.payload) return
  const r = await bridge('POST', '/handover', h.payload, h.retry ? { 'x-retry': '1' } : {})
  h = findH(id); if (!h) return
  if (r.ok) {
    h.delivery = 'at-bridge'; h.sentAt = now(); h.hash = r.data.hash || h.hash; h.stripped = r.data.stripped || []; h.retry = false; h.lastError = null
    if (r.data.duplicate && ['Accepted', 'Rejected'].includes(r.data.status)) applyAck(h, r.data.status, r.data.reasonCode)
  } else {
    h.attempts++; h.nextTryAt = now() + backoff(h.attempts)
    h.lastError = r.data?.flowOff ? 'F1 switched off by Admin' : r.status === 0 || r.down ? 'Bridge not reachable' : r.data?.error || `Error ${r.status}`
  }
}
export async function pollHandover(id) {
  const h = findH(id); if (!h || h.status !== 'Pending' || h.delivery !== 'at-bridge') return
  const r = await bridge('GET', `/handover/${encodeURIComponent(id)}/status`)
  if (r.ok && ['Accepted', 'Rejected'].includes(r.data.status)) applyAck(findH(id), r.data.status, r.data.reasonCode)
}
/** One pass of the outbox job (jobs.js runs it every few seconds). */
export async function processOutbox() {
  for (const h of db().handovers.filter((x) => x.status === 'Pending' && x.delivery === 'outbox' && x.nextTryAt <= now())) await sendHandover(h.id)
  for (const h of db().handovers.filter((x) => x.status === 'Pending' && x.delivery === 'at-bridge')) await pollHandover(h.id)
}

/** Remove everything except name, Investor tag, handover ID and conversion date (DECISION-13, mode "remove"). */
/** Mark the messages of an investor-to-be with their member key, so their chat stays visible after their numbers go. */
function linkMessages(c, m) {
  const nums = new Set((m.contacts || []).map((x) => normalize(x.mobile)).filter(Boolean))
  const mails = new Set((m.emails || []).map((e) => String(e.email || '').toLowerCase()).filter(Boolean))
  for (const w of db().wa) if (w.clientId === c.id && !w.memberKey && nums.has(normalize(w.mobile))) w.memberKey = m.key
  for (const e of db().emails) if (e.clientId === c.id && !e.memberKey && mails.has(String(e.email || '').toLowerCase())) e.memberKey = m.key
}
function stripInvestorData(m) {
  const keep = { key: m.key, first_name: m.first_name, middle_name: m.middle_name || '', last_name: m.last_name, relationship: m.key === 'p' ? 'Primary' : '', investor: { ...m.investor, dataRemoved: true } }
  for (const k of Object.keys(m)) delete m[k]
  Object.assign(m, keep, { contacts: [], emails: [], addresses: [], product: [], extra: {} })
}

export function applyAck(h, status, reasonCode = null) {
  if (!h || h.status !== 'Pending') return
  const c = db().clientById(h.clientId)
  h.ackAt = now(); h.reasonCode = reasonCode || null
  if (status === 'Accepted') {
    h.status = 'Delivered'
    if (c) for (const m of c.members.filter((x) => x.investor?.handoverId === h.id)) {
      m.investor.status = 'Accepted'
      linkMessages(c, m)
      if (INVESTOR_DATA_MODE === 'remove') stripInvestorData(m)
    }
    h.payload = null // the local copy of the sent personal data is not kept after acceptance
    if (c) db().addActivity(c.id, 'stage', 'Conversion confirmed by Investor DMS.')
    // the last member accepted: the family leaves the Investor Family list; only the person who converted is told (product owner, 23 Nov 2026)
    if (c && isFamilyComplete(c) && !c.completedAt) {
      c.completedAt = now()
      notify(h.actedBy || h.advisorId, 'FAM-DONE', familyDoneText(c), { path: `/record/${c.id}` })
    }
  } else {
    h.status = 'Failed'
    if (c) for (const m of c.members.filter((x) => x.investor?.handoverId === h.id)) m.investor.status = 'Rejected'
    if (c) db().addActivity(c.id, 'stage', `Conversion not accepted by Investor DMS${reasonCode ? ` (${reasonCode})` : ''}.`)
    notify(db().users.filter((u) => u.role === 'Admin').map((u) => u.id), 'HND-FAIL', `Conversion of ${c ? clientName(c) : 'a client'} to Investor failed${reasonCode ? ` (${reasonCode})` : ''}.`, c ? { path: `/record/${c.id}` } : null)
  }
}

/** Admin: send again with the same idempotency key (split prompt §5.6). */
export async function retryHandover(id) {
  await transact(() => markRetry(id))
  await sendHandover(id)
}
function markRetry(id) {
  const h = findH(id); if (!h || h.status !== 'Failed') throw new RuleError('Only a failed handover can be retried.')
  if (!h.payload) throw new RuleError('The handover content is no longer held. Revert and convert again.')
  h.status = 'Pending'; h.delivery = 'outbox'; h.retry = true; h.attempts = 0; h.nextTryAt = now(); h.reasonCode = null
  const c = db().clientById(h.clientId)
  if (c) for (const m of c.members.filter((x) => x.investor?.handoverId === id)) m.investor.status = 'Pending'
  if (c) db().addActivity(c.id, 'stage', 'Admin retried the conversion.')
}
/** Admin, DECISION-15 (default, confirm): remove the Investor tag and return the record to the stage it was converted from. */
export function revertHandover(id) { return transact(() => applyRevert(id)) }
function applyRevert(id) {
  const h = findH(id); if (!h || !['Failed', 'Pending'].includes(h.status)) throw new RuleError('Only a failed or pending handover can be reverted.')
  const c = db().clientById(h.clientId)
  h.status = 'Reverted'; h.revertedAt = now(); h.revertedBy = db().sessionUserId; h.payload = null
  if (!c) return
  for (const m of c.members.filter((x) => x.investor?.handoverId === id)) delete m.investor // data is still there: it is removed only after acceptance
  if (!c.members.some(isInvestorMember) && c.stage === 'Investor Family') { c.stage = h.convertedFromStage === 'Investor Family' ? 'Lead' : h.convertedFromStage; c.convertedAt = null; c.platformFamilyId = null }
  db().addActivity(c.id, 'stage', `Admin reverted the conversion. Record returned to ${c.stage}.`)
}
export const handoversOf = (c) => db().handovers.filter((h) => h.clientId === c.id)
export const pendingHandover = (c) => handoversOf(c).find((h) => h.status === 'Pending')
export const failedHandover = (c) => handoversOf(c).find((h) => h.status === 'Failed')
