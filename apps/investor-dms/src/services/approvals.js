// Approval engine. Source: DMS_03 §20-§27, APP-001..APP-010, DMS_X02 APPROVAL_REQUEST, DMS_X05 OBJECT_STATUS,
// DMS_X07 N-21..N-26. Categories: Name, Mobile, Email, Delete Mobile/Email, Group Member, New Prospect.
import { useDb } from '@/stores/db'
import { now } from '@/utils/format'
import { approvalChain } from './access'
import { notify } from './notify'
import { RuleError, assertRoom, clientName, fullName } from './lifecycle'

const db = () => useDb()
const uname = (id) => db().userById(id)?.name || ''

export function pendingFor(clientId) { return db().approvals.filter((a) => a.clientId === clientId && a.status === 'Pending') }
export function currentStep(req) { return req.chain.find((s) => s.state === 'Pending') }
export function isMyTurn(req) { return currentStep(req)?.userId === db().sessionUserId }
export function myPendingApprovals() { return db().approvals.filter((a) => a.status === 'Pending' && isMyTurn(a)) }

/** Advance to the next present approver; absent approvers are skipped (APP-007). Top approver absent -> waits. */
function activateNext(req) {
  const idx = req.chain.findIndex((s) => s.state === 'Waiting')
  if (idx === -1) return false
  for (let i = idx; i < req.chain.length; i++) {
    const s = req.chain[i]; const u = db().userById(s.userId)
    const isTop = i === req.chain.length - 1
    if (u?.availability === 'Absent' && !isTop) { s.state = 'Skipped'; s.at = now(); continue }
    s.state = 'Pending'
    notifyApprover(req, s.userId)
    return true
  }
  return false
}

function notifyApprover(req, userId) {
  const c = db().clientById(req.clientId)
  const adv = uname(req.requestedBy)
  const link = { path: req.category === 'New Prospect' ? '/prospects' : `/record/${req.clientId}`, query: { tab: 'data', approval: req.id } }
  if (req.category === 'New Prospect') return notify(userId, 'N-21', `${adv} added a new Prospect entry. Review before it goes live.`, { path: '/prospects', query: { review: req.id } })
  if (req.category === 'Group Member' && req.payload?.op === 'add') return notify(userId, 'N-22', `${adv} added a new Group Member (${fullName(req.payload.member)}) under ${clientName(c)}. Review before it goes live.`, link)
  if (req.category === 'Group Member') return notify(userId, 'GM-REMOVE', `${adv} requested to remove ${req.payload.memberKeys.length} group member(s) from ${clientName(c)}'s group. Review before it goes live.`, link)
  const memberName = req.changes?.[0]?.memberName || clientName(c)
  notify(userId, 'N-23', `${adv} requested a change to ${memberName}'s record under ${clientName(c)}. Review before it goes live.`, link)
}

/**
 * Submit a request. Requester = signed-in user. Admin's own changes apply directly ([CONFIRM] D03 §23.2).
 * Only one pending request per category per record (APP-010).
 */
export function submitRequest({ clientId = null, category, categories, changes = [], payload = null }) {
  const me = db().me
  const cats = categories || [category]
  if (clientId) {
    const clash = pendingFor(clientId).find((a) => a.categories.some((x) => cats.includes(x)))
    if (clash) throw new RuleError(`A ${clash.categories.join(' / ')} request is already pending for this record. Wait for it to finish.`)
  }
  const req = { id: db().nextId('APR'), clientId, category: cats[0], categories: cats, changes, payload, requestedBy: me.id, requestedOn: now(), status: 'Pending', chain: [], history: [] }
  if (me.role === 'Admin') { applyRequest(req); req.status = 'Approved'; db().approvals.push(req); return req }
  req.chain = approvalChain(me.id).map((userId) => ({ userId, state: 'Waiting', at: null, edited: false }))
  db().approvals.push(req)
  activateNext(req)
  if (clientId) db().addActivity(clientId, 'approval', `sent ${cats.join(', ')} change for approval`)
  return req
}

/** Approve at the current level, optionally carrying the approver's edits forward (D03 §23.6). */
export function approve(req, editedChanges = null, editedPayload = null) {
  const step = currentStep(req)
  if (!step || step.userId !== db().sessionUserId) throw new RuleError('This request is not pending your approval.')
  if (editedChanges) { req.changes = editedChanges; step.edited = true }
  if (editedPayload) { req.payload = editedPayload; step.edited = true }
  step.state = 'Approved'; step.at = now()
  req.history.push({ userId: step.userId, action: 'Approved', at: now(), edited: step.edited })
  if (!activateNext(req)) {
    applyRequest(req) // may throw RuleError (e.g. 1500 at final approval) -> nothing applied
    req.status = 'Approved'
    const c = req.clientId ? db().clientById(req.clientId) : null
    const memberName = req.changes?.[0]?.memberName || (c ? clientName(c) : fullName(req.payload?.client?.members?.[0] || {}))
    notify(req.requestedBy, 'N-26', `Your requested change to ${memberName}'s record was approved.`, c ? { path: `/record/${c.id}` } : { path: '/prospects' })
    if (c) db().addActivity(c.id, 'approval', `${req.categories.join(', ')} change approved by ${uname(step.userId)}`)
  }
}

export function reject(req) {
  const step = currentStep(req)
  if (!step || step.userId !== db().sessionUserId) throw new RuleError('This request is not pending your approval.')
  step.state = 'Rejected'; step.at = now(); req.status = 'Rejected'
  req.history.push({ userId: step.userId, action: 'Rejected', at: now() })
  const u = db().userById(step.userId)
  const c = req.clientId ? db().clientById(req.clientId) : null
  if (req.category === 'Group Member' && req.payload?.op === 'add') notify(req.requestedBy, 'N-25', `Your request to add ${fullName(req.payload.member)} as a Group Member under ${clientName(c)} was rejected by ${u.name} (${u.mhf_id}).`, { path: `/record/${c.id}` })
  else if (req.category === 'Group Member') notify(req.requestedBy, 'GM-REJ', `Your request to remove group members from ${clientName(c)}'s group was rejected by ${u.name} (${u.mhf_id}).`, { path: `/record/${c.id}` })
  else {
    const memberName = req.changes?.[0]?.memberName || (c ? clientName(c) : fullName(req.payload?.client?.members?.[0] || {}))
    notify(req.requestedBy, 'N-24', `Your requested change to ${memberName}'s record was rejected by ${u.name} (${u.mhf_id}).`, c ? { path: `/record/${c.id}` } : null)
  }
  // remove rows that were only pending additions
  if (c) for (const m of c.members) { m.contacts = m.contacts.filter((x) => !(x.pendingAdd && x.reqId === req.id)); m.emails = m.emails.filter((x) => !(x.pendingAdd && x.reqId === req.id)) }
  if (c) db().addActivity(c.id, 'approval', `${req.categories.join(', ')} change rejected by ${u.name}`)
}

function applyRequest(req) {
  const c = req.clientId ? db().clientById(req.clientId) : null
  if (req.category === 'New Prospect') {
    const nc = req.payload.client
    assertRoom(nc.assignedTo) // 1500 re-checked at final approval (D02 §4.11)
    nc.stage = 'Prospect'; nc.takeoverDate = now(); nc.lastCallAt = now(); nc.createdAt = now()
    db().clients.unshift(nc)
    db().addActivity(nc.id, 'stage', 'Prospect created (manual, approved)')
    return
  }
  if (req.category === 'Group Member' && req.payload.op === 'add') {
    const n = c.members.length
    c.members.push({ ...req.payload.member, key: 'm' + Date.now(), label: `Group Member-${n}`, clientId: db().newClientId() })
    return
  }
  if (req.category === 'Group Member' && req.payload.op === 'remove') return applyRemoval(c, req.payload)
  for (const ch of req.changes) {
    const m = c.members.find((x) => x.key === ch.memberKey); if (!m) continue
    if (ch.section === 'identity') m[ch.field] = ch.new
    if (ch.section === 'contact' || ch.section === 'email') {
      const rows = ch.section === 'contact' ? m.contacts : m.emails
      const row = rows.find((x) => x.id === ch.rowId)
      if (ch.kind === 'add' && row) { delete row.pendingAdd; delete row.reqId; if (ch.section === 'contact') row.mobile = ch.new; else row.email = ch.new }
      if (ch.kind === 'modify' && row) { if (ch.section === 'contact') row.mobile = ch.new; else row.email = ch.new }
      if (ch.kind === 'delete') { const i = rows.findIndex((x) => x.id === ch.rowId); if (i > -1) rows.splice(i, 1) }
    }
  }
}

/** Remove group members (D03 §21). payload: { op:'remove', memberKeys, mode:'together'|'separate', primaryKey, destination, destinations } */
function applyRemoval(c, p) {
  const leaving = c.members.filter((m) => p.memberKeys.includes(m.key))
  const stayStage = c.stage === 'Lead' ? 'Lead' : 'Prospect'
  const groups = p.mode === 'together' || leaving.length === 1
    ? [{ members: [...leaving].sort((a) => (a.key === p.primaryKey ? -1 : 1)), dest: p.destination || p.destinations?.[leaving[0].key] }]
    : leaving.map((m) => ({ members: [m], dest: p.destinations[m.key] }))
  const stayCount = groups.filter((g) => g.dest === 'Stay').length
  if (stayCount) assertRoom(c.assignedTo, stayCount)
  c.members = c.members.filter((m) => !p.memberKeys.includes(m.key))
  for (const g of groups) {
    const members = g.members.map((m, i) => ({ ...m, key: i === 0 ? 'p' : 'm' + i, relationship: i === 0 ? 'Primary' : m.relationship }))
    // The person who becomes primary keeps their own Client ID, which becomes the new record ID
    const nc = JSON.parse(JSON.stringify({ ...c, members, id: members[0].clientId || db().newClientId(), ownershipHistory: [], documents: [] }))
    nc.members[0].clientId = nc.id
    nc.counters = { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }
    db().clients.unshift(nc)
    if (g.dest === 'Stay') { nc.stage = stayStage; nc.takeoverDate = now(); nc.lastCallAt = now() }
    else throw new RuleError('There is no Release to Pool in Investor DMS.')
    db().addActivity(nc.id, 'stage', `Created from group removal of ${clientName(c)}`)
  }
}

/** Pending indicators for the Data tab (D03 §22.5). */
export function pendingChangeIndex(clientId) {
  const idx = {}
  for (const r of pendingFor(clientId)) for (const ch of r.changes || []) idx[`${ch.memberKey}:${ch.section}:${ch.field || ch.rowId}`] = { kind: ch.kind, req: r }
  return idx
}
