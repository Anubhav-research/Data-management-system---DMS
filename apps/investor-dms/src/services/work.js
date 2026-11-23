// Notes, Tasks, Events, Deals. Source: DMS_05 (NOTE-*, TASK-*, EVT-*, DEAL-*), DMS_X07 N-04..N-13.
import { useDb } from '@/stores/db'
import { LIMITS } from '@/data/masters'
import { now, inr } from '@/utils/format'
import { notify } from './notify'
import { RuleError, clientName } from './lifecycle'
import { publishBusy } from './busy'

const db = () => useDb()
const uname = (id) => db().userById(id)?.name || ''

// ---------------- Events (EVT-001..006) ----------------
export function createEvent(ev) {
  if (!ev.type) throw new RuleError('Event type is mandatory.')
  if (!ev.title?.trim()) throw new RuleError('Title is mandatory.')
  if (!ev.allDay && ev.end < ev.start) throw new RuleError('End time cannot be before start time.')
  if (ev.type !== 'Internal Meeting' && !ev.clientId) throw new RuleError('Link the event to an Investor.') // D05 §4.5
  const c = ev.clientId ? db().clientById(ev.clientId) : null
  const e = { id: db().nextId('EV'), createdBy: db().sessionUserId, createdAt: now(), attendees: [db().sessionUserId], clientNames: [], description: '', reminders: [...(db().settings?.eventReminders || [10])], ...ev }
  db().events.push(e)
  if (c) {
    db().addActivity(c.id, 'event', 'has created an event', { eventId: e.id })
  }
  return e
}
export function updateEvent(e, patch) {
  if (!patch.allDay && patch.end < patch.start) throw new RuleError('End time cannot be before start time.')
  Object.assign(e, patch)
}

// ---------------- Notes (NOTE-001..009) ----------------
export function createNote({ title, content, clientId = null }) {
  if (!title?.trim()) throw new RuleError('Title is mandatory.')
  const n = { id: db().nextId('NT'), title: title.trim(), content, clientId, createdBy: db().sessionUserId, createdAt: now(), updatedAt: now(), updatedBy: db().sessionUserId, pinnedHome: false, pinnedClient: false }
  db().notes.push(n)
  if (clientId) db().addActivity(clientId, 'note', 'added a note', { noteId: n.id })
  return n
}
export function updateNote(n, { title, content }) {
  if (n.createdBy !== db().sessionUserId) throw new RuleError('Only the creator can edit this note.') // NOTE-003
  if (!title?.trim()) throw new RuleError('Title is mandatory.')
  Object.assign(n, { title: title.trim(), content, updatedAt: now(), updatedBy: db().sessionUserId })
}
/** Pins belong to the user ("a user can pin five notes", D05 §2.7) and to the screen: 'home' | 'client', each with its own
 *  state and limit 5 / 3 (NOTE-007, NOTE-008). Anyone who can see a note can pin it for themselves. */
const pinList = (n, where) => n.pins?.[where] || [] // old single flags are migrated on store load (db.js)
export const isPinned = (n, where) => pinList(n, where).includes(db().sessionUserId)
export function togglePin(n, where) {
  const me = db().sessionUserId
  const list = pinList(n, where)
  n.pins = n.pins || { home: [], client: [] }
  if (list.includes(me)) { n.pins[where] = list.filter((u) => u !== me); return false }
  const limit = where === 'home' ? LIMITS.PIN_HOME : LIMITS.PIN_CLIENT
  const mine = db().notes.filter((x) => (where === 'client' ? x.clientId === n.clientId : true) && isPinned(x, where))
  if (mine.length >= limit) throw new RuleError(`You can pin up to ${limit} notes ${where === 'home' ? 'on the Notes screen' : 'in this client'}. Please unpin one first.`)
  n.pins[where] = [...list, me]
  return true
}

// ---------------- Tasks (TASK-001..009) ----------------
/** Assignable users (TASK-003): IS -> team ISs + own TL + self; TL -> team + own senior + self. Others: own downline + senior + self (scope not defined). */
export function assignableUsers() {
  const me = db().me
  const team = db().users.filter((u) => u.active && (u.reportsTo === me.reportsTo || u.reportsTo === me.id) && u.id !== me.id && (me.role !== 'IS' || u.role === 'IS'))
  const senior = db().userById(me.reportsTo)
  return [me, ...team.filter((u) => u.reportsTo === me.id || me.role === 'IS'), ...(senior ? [senior] : [])]
}
export function createTask(t) {
  for (const [k, l] of [['title', 'Title'], ['priority', 'Priority'], ['assignedTo', 'Assigned To']]) if (!t[k]) throw new RuleError(`${l} is mandatory.`)
  const task = { id: db().nextId('TK'), status: 'To-Do', remark: '', description: '', createdBy: db().sessionUserId, createdAt: now(), updatedAt: now(), ...t }
  db().tasks.push(task)
  if (task.assignedTo !== db().sessionUserId) notify(task.assignedTo, 'N-05', `${uname(task.createdBy)} assigned you a task: ${task.title}.${task.due ? ` Due ${new Date(task.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.` : ''}`, { path: '/tasks', query: { open: task.id } })
  return task
}
export function updateTask(task, patch) {
  const me = db().sessionUserId
  const selfAssigned = task.createdBy === task.assignedTo
  const detailsChanged = ['title', 'description', 'priority', 'due', 'assignedTo'].some((k) => k in patch && patch[k] !== task[k])
  if (detailsChanged && task.createdBy !== me) throw new RuleError('Only the creator can change task details. The assignee can change the status.') // TASK-007
  if ('status' in patch && patch.status !== task.status && !selfAssigned && task.assignedTo !== me && task.createdBy !== me) throw new RuleError('Only the assignee can change the status.')
  if (['Completed', 'Rejected'].includes(patch.status) && !patch.remark?.trim()) throw new RuleError('Remark is required when completing or cancelling a task.') // TASK-006
  const oldStatus = task.status
  Object.assign(task, patch, { updatedAt: now() })
  if (patch.status && patch.status !== oldStatus && !selfAssigned) {
    const who = uname(task.assignedTo)
    if (patch.status === 'Completed') notify(task.createdBy, 'N-07', `${who} marked ${task.title} as Completed. Remark: "${task.remark}"`, { path: '/tasks' })
    else if (patch.status === 'Rejected') notify(task.createdBy, 'N-08', `${who} marked ${task.title} as Rejected. Remark: "${task.remark}"`, { path: '/tasks' })
    else notify(task.createdBy, 'N-06', `${who} updated ${task.title} to ${patch.status}.`, { path: '/tasks' })
  }
}

// ---------------- Deals (DEAL-001..014) ----------------
export function rowComplete(r) {
  if (!r.product || !(Number(r.amount) > 0)) return false
  if (r.product.startsWith('MF')) return !!(r.amc && r.scheme)
  if (r.product === 'FD') return !!(r.company && r.tenure)
  if (r.product === 'NCD') return !!r.issuer
  return true
}
export function dealSchemeText(d) { return d.rows.map((r) => r.scheme || r.company || r.issuer || '—').join(', ') }
export function dealProductsText(d) { return [...new Set(d.rows.map((r) => r.product))].join(', ') }
function checkSpacing(clientId, start, exceptId) { // DEAL-011
  const clash = db().deals.find((d) => d.clientId === clientId && d.id !== exceptId && Math.abs(d.start - start) < 60000)
  if (clash) throw new RuleError('Another deal for this investor already exists at this time. Deals must be at least 1 minute apart.')
}
export function createDeal(clientId, d) {
  const c = db().clientById(clientId)
  if (c.stage !== 'Investor') throw new RuleError('Deals can only be created on an Investor record (DEAL-001).')
  if (!d.rows.length || !d.rows.every(rowComplete)) throw new RuleError('Complete every product row before creating the deal.')
  checkSpacing(clientId, d.start)
  const deal = { id: db().nextId('DL'), clientId, status: 'Scheduled', finalAmount: null, remark: '', createdBy: db().sessionUserId, updatedAt: now(), ...d, total: d.rows.reduce((s, r) => s + Number(r.amount), 0) }
  db().deals.push(deal)
  publishBusy() // F4: scheduled deals are busy time
  db().addActivity(clientId, 'deal', `has created the deal (${inr(deal.total)})`, { dealId: deal.id })
  return deal
}
export function updateDeal(deal, d) {
  if (!d.rows.length || !d.rows.every(rowComplete)) throw new RuleError('Complete every product row.')
  if (d.status === 'Completed') {
    if (!(Number(d.finalAmount) > 0)) throw new RuleError('Final Investment Amount is mandatory for completed deals.')
    if (!d.remark?.trim()) throw new RuleError('This field is mandatory for completed deals.') // DEAL-008
  }
  checkSpacing(deal.clientId, d.start, deal.id)
  const old = deal.status
  Object.assign(deal, d, { total: d.rows.reduce((s, r) => s + Number(r.amount), 0), updatedAt: now() })
  publishBusy()
  db().addActivity(deal.clientId, 'deal', old !== deal.status ? `updated the deal: ${old} → ${deal.status}` : 'updated the deal', { dealId: deal.id })
  if (deal.status === 'Rejected' && old !== 'Rejected') { // DEAL-010 / N-13
    const owner = db().clientById(deal.clientId).assignedTo
    const tl = db().userById(owner)?.reportsTo
    notify(tl, 'N-13', `${uname(db().sessionUserId)} marked a deal for ${clientName(db().clientById(deal.clientId))} as Rejected.`, { path: `/record/${deal.clientId}`, query: { tab: 'deals' } })
  }
}
const ORDER = { Scheduled: 0, Completed: 1, Rejected: 1, Expired: 1 }
/** DEAL-012: Scheduled first (nearest date first), then finished most recent first. */
export function sortDeals(list) {
  return [...list].sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'Scheduled' ? a.start - b.start : b.updatedAt - a.updatedAt))
}
