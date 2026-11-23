// Calling and messaging - Investor DMS. Source: DMS_04 (CALL-001..014, MSG-001..013). Investors only.
// The phone system (Asterisk/AMI) and WhatsApp/email gateways are simulated.
import { useDb } from '@/stores/db'
import { LIMITS, WINDOW_OUTCOMES, EVENT_REQUIRED_OUTCOMES } from '@/data/masters'
import { now, DAY } from '@/utils/format'
import { RuleError, clientName, fullName } from './lifecycle'
import { hasSwitch, isAdmin, approvalChain } from './access'
import { notify } from './notify'

const db = () => useDb()

/** Phone Numbers list: every person and number, tagged PRIMARY or relationship (CALL-001, Fig 5635). */
export function phoneBook(c) {
  return c.members.map((m) => ({ name: fullName(m), tag: m.relationship === 'Primary' ? 'PRIMARY' : (m.relationship || 'Other').toUpperCase(), numbers: m.contacts.filter((x) => x.mobile && !x.pendingAdd).map((x) => x.mobile), key: m.key }))
}

/** One call at a time per client or group (D04 §2.4). */
export function startCall(c, mobile, personName) {
  if (db().activeCall) throw new RuleError('You are already on a call.')
  if (c.stage !== 'Investor') throw new RuleError('Only Investors can be called.')
  if (db().pendingLog) throw new RuleError('Please complete your incomplete call log first.')
  if (c.callLockBy && c.callLockBy !== db().sessionUserId) throw new RuleError('Someone else is already on a call with this client or group.')
  c.callLockBy = db().sessionUserId
  db().activeCall = { clientId: c.id, mobile, personName: personName || clientName(c), startedAt: now(), minimized: false, direction: 'Outbound' }
}

/** End the simulated call. connected=false -> auto-saved with reason, no pop-up (CALL-005). */
export function endCall({ connected, reason = 'Busy' }) {
  const call = db().activeCall; if (!call) return null
  const c = db().clientById(call.clientId)
  c.callLockBy = null
  db().activeCall = null
  const duration = Math.max(connected ? 1 : 0, Math.round((now() - call.startedAt) / 1000))
  const base = { clientId: c.id, stageAtCall: c.stage, direction: call.direction, mobile: call.mobile, at: call.startedAt, duration: connected ? duration : 0, madeBy: db().sessionUserId, recording: connected }
  if (!connected) {
    const log = { id: db().nextId('CL'), ...base, status: 'Not Connected', subStatus: reason, clientName: call.personName, comment: '' }
    db().calls.push(log)
    afterAnyCall(c)
    db().addActivity(c.id, 'call', `made a call: Not Connected (${reason})`, { callId: log.id })
    return { log }
  }
  // Connected -> Create Call Log pop-up that cannot be dismissed (CALL-003)
  db().pendingLog = { ...base, status: 'Connected', personName: call.personName }
  return { pending: true }
}

/**
 * Manual "Log a Call" from the Calls tab (product owner, 06 Nov 2026 - relaxes CALL-001 "system-created only").
 * Not Connected is saved at once, with the same Pool rules as a phone-system call.
 * Connected is staged like a phone-system call and finished by saveCallLog, so the same outcome rules apply
 * (comment mandatory, event first for Followup/Interested, message window, Pool conversion).
 */
export function logManualCall(c, { direction, mobile, at, duration, connected, reason }) {
  if (db().activeCall) throw new RuleError('You are on a call. Log it when the call ends.')
  if (db().pendingLog) throw new RuleError('Please complete your incomplete call log first.')
  if (!mobile) throw new RuleError('Mobile Number is mandatory.')
  if (!at || at > now()) throw new RuleError('Call date and time cannot be in the future.')
  const base = { clientId: c.id, stageAtCall: c.stage, direction, mobile, at, duration: connected ? Math.max(1, duration || 0) : 0, madeBy: db().sessionUserId, recording: false, manual: true }
  const person = c.members.find((m) => m.contacts.some((x) => x.mobile === mobile))
  if (connected) { db().pendingLog = { ...base, status: 'Connected', personName: person ? fullName(person) : '' }; return { pending: true } }
  if (!reason) throw new RuleError('Reason is mandatory when the call did not connect.')
  const log = { id: db().nextId('CL'), ...base, status: 'Not Connected', subStatus: reason, clientName: person ? fullName(person) : clientName(c), comment: '' }
  db().calls.push(log)
  afterAnyCall(c)
  db().addActivity(c.id, 'call', `logged a call: Not Connected (${reason})`, { callId: log.id })
  return { log }
}

function afterAnyCall(c) {
  c.lastCallAt = now(); c.lastCalled = now(); c.totalCalls = (c.totalCalls || 0) + 1 // every call restarts 90-day clock (PL-004)
}

export const needsEvent = (outcome) => EVENT_REQUIRED_OUTCOMES.includes(outcome)

/** Save the pending log. For outcomes needing an event, the event must already be created (CALL-013). */
export function saveCallLog({ outcome, clientNameSel, comment }) {
  const p = db().pendingLog; if (!p) return
  if (!outcome) throw new RuleError('Call Outcome is mandatory.')
  if (!clientNameSel) throw new RuleError('Client Name is mandatory.')
  if (!comment?.trim()) throw new RuleError('Comment is mandatory on every connected call.') // CALL-007
  const c = db().clientById(p.clientId)
  const log = { id: db().nextId('CL'), clientId: p.clientId, stageAtCall: p.stageAtCall, direction: p.direction, mobile: p.mobile, at: p.at, duration: p.duration, status: 'Connected', subStatus: outcome, clientName: clientNameSel, comment: comment.trim(), madeBy: p.madeBy, recording: p.recording !== false, ...(p.manual ? { manual: true } : {}) }
  db().calls.push(log)
  db().pendingLog = null
  afterAnyCall(c)
  c.callStatus = outcome
  db().addActivity(c.id, 'call', `${p.manual ? 'logged' : 'made'} a call: ${outcome}`, { callId: log.id })
  if ((WINDOW_OUTCOMES[c.stage] || []).includes(outcome)) c.msgWindowUntil = now() + LIMITS.MSG_WINDOW_HOURS * 3600000 // MSG-001
  return { log, offerDeal: c.stage === 'Investor' && outcome === 'Interested' }
}

// ---------------- Messaging (D04 §10-§16) ----------------
export const windowOpen = (c) => !!(c.msgWindowUntil && c.msgWindowUntil > now())
export const replyOpen = (c) => !!(c.replyWindowUntil && c.replyWindowUntil > now())
export function waNumbers(c) {
  return c.members.flatMap((m) => m.contacts.filter((x) => x.is_whatsapp && !x.pendingAdd).map((x) => ({ name: fullName(m), mobile: x.mobile, contactId: x.id })))
}
export function messagingBlockReason(c, channel, kind) {
  if (c.stage !== 'Investor') return 'Only Investors can be messaged.'
  const sw = `${channel === 'wa' ? 'wa' : 'email'}_${kind}` // kind: template | custom | document (WhatsApp only)
  // Who may message (product owner, 21 Nov 2026): Admin always; otherwise only the advisor of the record and the
  // people above them in the Money Honey hierarchy (their TL, that TL's VP, the VP's President) - not other TLs or
  // VPs. The windows below (12-hour template, 24-hour free text) apply to everyone, Admin included.
  if (!isAdmin()) {
    const me = db().sessionUserId
    if (!c.assignedTo || (me !== c.assignedTo && !approvalChain(c.assignedTo).includes(me))) return 'Only the IS of this record and the people above them can message this client.'
    if (!hasSwitch(sw)) return 'You do not have this permission. Ask Admin to enable it in User Access.'
  }
  if (kind === 'template' && !windowOpen(c)) return 'Messaging opens for 12 hours after a Followup call.'
  if ((kind === 'custom' || kind === 'document') && !replyOpen(c)) return 'Free text is allowed only within 24 hours of the client\'s reply.'
  return null
}
// `doc`: a document from the Document Repository or the computer, sent with the message (as in Prospect DMS). It has
// its own permission (wa_document, on for advisors); a message typed with it still needs wa_custom.
export function sendWhatsApp(c, mobile, { template, body, doc }, kind = 'template') {
  if (doc) kind = 'document'
  const reason = messagingBlockReason(c, 'wa', kind) || (doc && body ? messagingBlockReason(c, 'wa', 'custom') : null); if (reason) throw new RuleError(reason)
  // Simulated gateway: numbers ending in 0 are "not on WhatsApp" (D04 §13.6)
  const notOnWa = String(mobile).endsWith('0')
  const msg = { id: db().nextId('WA'), clientId: c.id, stage: c.stage, mobile, at: now(), direction: 'Sent', type: kind === 'document' ? 'Document' : kind === 'template' ? 'Template' : 'Free Text', template: template || null, body: body || '', doc: doc ? { docId: doc.docId, name: doc.name, mime: doc.mime || null, size: doc.size || null, ...(doc.local ? { local: true } : {}) } : null, status: notOnWa ? 'Not on WhatsApp' : 'Sent', sentBy: db().sessionUserId }
  db().wa.push(msg)
  db().addActivity(c.id, 'whatsapp', doc ? `sent a document on WhatsApp: ${doc.name}` : `sent a WhatsApp ${kind === 'template' ? 'template' : 'message'}`)
  if (notOnWa) {
    for (const m of c.members) for (const x of m.contacts) if (x.mobile === mobile) x.is_whatsapp = false
    throw new RuleError('This number is not registered on WhatsApp. Please make sure and try with another number.')
  }
  setTimeout(() => { msg.status = 'Delivered' }, 1500)
  return msg
}
/** Simulate a client reply: opens the 24-hour custom window (MSG-007). */
export function simulateReply(c, channel, mobileOrEmail) {
  const entry = { id: db().nextId(channel === 'wa' ? 'WA' : 'EM'), clientId: c.id, stage: c.stage, at: now(), direction: 'Received', type: channel === 'wa' ? 'Free Text' : 'Custom', template: null, status: 'Received', sentBy: c.assignedTo }
  if (channel === 'wa') db().wa.push({ ...entry, mobile: mobileOrEmail, body: 'Thank you. Please share more details.' })
  else db().emails.push({ ...entry, email: mobileOrEmail, subject: 'Re: Follow-up on our call', body: 'Thanks, please share the details.' })
  c.replyWindowUntil = now() + LIMITS.CUSTOM_REPLY_HOURS * 3600000
}
/** Money Honey address of a staff member (demo: first.last@moneyhoney.co.in). */
export const staffEmail = (u) => (u ? `${u.name.trim().toLowerCase().replace(/[^a-z]+/g, '.')}@moneyhoney.co.in` : '')
/** Addresses an email may go to - To, CC and BCC alike: only the addresses saved on the family's members. A new
 *  address is added in Data first (with approval) (product owner, 21 Nov 2026). */
export function emailRecipients(c) {
  const client = c.members.flatMap((m) => m.emails.filter((e) => !e.pendingAdd && e.email).map((e) => ({ email: e.email, name: fullName(m) })))
  return { client, staff: [] }
}
/**
 * Send an email (Frappe CRM composer, 21 Nov 2026): to one or more of the client's saved addresses, with optional CC /
 * BCC (also only addresses saved on the record), a rich-text body (`html`), documents, and the email it replies to.
 * `kind`: 'template' (needs the 12-hour window) or 'custom' (free text: needs a client reply in the last 24 hours).
 */
export function sendEmail(c, to, { template, subject, body, html = '', docs = [], cc = [], bcc = [], replyTo = null }, kind = 'template') {
  const reason = messagingBlockReason(c, 'email', kind); if (reason) throw new RuleError(reason)
  const tos = [].concat(to).filter(Boolean)
  const mine = emailRecipients(c).client.map((x) => x.email)
  if (!tos.length) throw new RuleError('Add at least one address in To.')
  if (tos.some((x) => !mine.includes(x))) throw new RuleError('You can only email an address saved on this record.')
  if ([...cc, ...bcc].some((x) => !mine.includes(x))) throw new RuleError('CC and BCC can only be addresses saved on this record.')
  const msg = { id: db().nextId('EM'), clientId: c.id, stage: c.stage, email: tos[0], to: tos, cc, bcc, from: staffEmail(db().me), at: now(), direction: 'Sent', type: kind === 'template' ? 'Template' : 'Custom', template: template || null, subject, body, html, replyTo,
    docs: docs.map((d) => ({ docId: d.docId, name: d.name, mime: d.mime || null, size: d.size || null, ...(d.local ? { local: true } : {}) })), status: 'Sent', sentBy: db().sessionUserId }
  db().emails.push(msg)
  db().addActivity(c.id, 'email', `sent an email: ${subject}${docs.length ? ` (${docs.length === 1 ? `attached ${docs[0].name}` : `${docs.length} documents attached`})` : ''}`)
  setTimeout(() => { msg.status = 'Delivered' }, 1500)
  return msg
}

/** Simulated missed inbound call (N-02) - used from the demo toolbar. */
export function simulateMissedCall(c) {
  const owner = c.assignedTo; const tl = db().userById(owner)?.reportsTo
  const mobile = c.members[0].contacts[0].mobile
  db().calls.push({ id: db().nextId('CL'), clientId: c.id, stageAtCall: c.stage, direction: 'Inbound', mobile, at: now(), duration: 0, status: 'Not Connected', subStatus: 'Ringing', clientName: clientName(c), comment: '', madeBy: owner })
  const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  notify([owner, tl], 'N-02', `Missed call from ${mobile} at ${t}.`, { path: `/record/${c.id}` })
}
