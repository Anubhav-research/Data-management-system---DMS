// Prospect DMS dashboard (product owner, 21 Nov 2026): "how is the business running" at a glance, for every level.
// Only this website's own data. Scope by hierarchy: an advisor sees their own work, a team leader and above their
// downline (one team or one advisor on request), Admin everything. No targets and no ranking (product owner).
// Every figure carries the records behind it (`drill`), so a click opens the list showing exactly those records
// (?ids=...&from=...). Counts use the same rules as the lists they open, so the two always match (QA TS-21).
import { useDb } from '@/stores/db'
import { visibleUserIds, isAdmin, downline } from './access'
import { myPendingApprovals } from './approvals'
import { STAGE_ROUTE } from '@/data/masters'
import { isFamilyComplete } from './family' // complete families are not in the Investor Family list

const db = () => useDb()
const DAY = 86400000
export const inP = (t, p) => t != null && t >= p.from && t < p.to

// ---------------------------------------------------------------- period
export const RANGES = ['Today', 'This week', 'This month', 'This quarter', 'Custom']
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
/** The period chosen; weeks start on Monday. */
export function periodOf(f) {
  const d0 = new Date(startOfDay())
  if (f.range === 'Today') return { from: d0.getTime(), to: d0.getTime() + DAY }
  if (f.range === 'This week') { const s = new Date(d0); s.setDate(d0.getDate() - ((d0.getDay() + 6) % 7)); return { from: s.getTime(), to: s.getTime() + 7 * DAY } }
  if (f.range === 'This month') return { from: new Date(d0.getFullYear(), d0.getMonth(), 1).getTime(), to: new Date(d0.getFullYear(), d0.getMonth() + 1, 1).getTime() }
  if (f.range === 'This quarter') { const q = Math.floor(d0.getMonth() / 3) * 3; return { from: new Date(d0.getFullYear(), q, 1).getTime(), to: new Date(d0.getFullYear(), q + 3, 1).getTime() } }
  const from = f.from ? new Date(`${f.from}T00:00:00`).getTime() : d0.getTime() - 29 * DAY
  const to = f.to ? new Date(`${f.to}T00:00:00`).getTime() + DAY : d0.getTime() + DAY
  return { from, to }
}
/**
 * What the period is compared with: the same stretch of the period before, up to the same point - this month so far
 * against the same days of last month, not against the whole of last month.
 */
export function previousOf(f, p) {
  const upTo = Math.min(Date.now(), p.to) - p.from
  const back = (months) => { const d = new Date(p.from); d.setMonth(d.getMonth() - months); return d.getTime() }
  const from = f.range === 'Today' ? p.from - DAY : f.range === 'This week' ? p.from - 7 * DAY : f.range === 'This month' ? back(1) : f.range === 'This quarter' ? back(3) : p.from - (p.to - p.from)
  const caption = { Today: 'vs yesterday', 'This week': 'vs same days last week', 'This month': 'vs same days last month', 'This quarter': 'vs same days last quarter' }[f.range] || 'vs the period before'
  return { from, to: from + (f.range === 'Custom' ? p.to - p.from : upTo), caption }
}
/** One point per day of the period up to today, for the small trend lines. */
function days(p) { const out = []; for (let t = p.from; t < Math.min(p.to, startOfDay() + DAY); t += DAY) out.push(t); return out }
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ---------------------------------------------------------------- scope
/** Who is counted: '' = everyone I can see, 'team:<id>' = a leader and their downline, 'user:<id>' = one person. */
export function scopeUsers(sel) {
  const vis = visibleUserIds()
  if (sel?.startsWith('user:')) return [sel.slice(5)].filter((id) => vis.includes(id))
  if (sel?.startsWith('team:')) { const id = sel.slice(5); return [id, ...downline(id)].filter((x) => vis.includes(x)) }
  return vis
}
export function scopeOptions() {
  const s = db(); const vis = visibleUserIds(); const me = s.me
  const people = s.users.filter((u) => vis.includes(u.id) && u.role !== 'Admin' && u.active !== false)
  const leaders = people.filter((u) => ['TL', 'VP', 'President'].includes(u.role) && u.id !== me?.id)
  return [
    { label: isAdmin() ? 'Everyone' : me?.role === 'IS' ? 'Me' : 'My whole team', value: '' },
    ...leaders.map((u) => ({ label: `${u.name}'s team`, value: `team:${u.id}`, group: 'Teams' })),
    ...people.map((u) => ({ label: u.name, sub: u.role, value: `user:${u.id}`, group: 'People' })),
  ]
}

// ---------------------------------------------------------------- drill-down
const listTo = (path, ids, label) => ({ path, query: { ids: ids.join(','), from: label } })
export const drillCalls = (ids, label) => [{ label: 'Call Logs', count: ids.length, to: listTo('/call-logs', ids, label) }]
export const drillEvents = (ids, label) => [{ label: 'Events', count: ids.length, to: listTo('/events', ids, label) }]
export const drillTasks = (ids, label) => [{ label: 'Tasks', count: ids.length, to: listTo('/tasks', ids, label) }]
export const drillMessages = (channel, ids, label) => [{ label: channel === 'wa' ? 'WhatsApp Logs' : 'Email Logs', count: ids.length, to: listTo(channel === 'wa' ? '/whatsapp-logs' : '/email-logs', ids, label) }]
/** Records can sit in different sections (Prospects, Leads ...): one link per section. */
export function drillClients(ids, label) {
  const by = {}
  for (const id of new Set(ids)) { const c = db().clientById(id); const st = c?.stage; if (!st || !STAGE_ROUTE[st] || (st === 'Pool' && !isAdmin())) continue; (by[st] ||= []).push(id) }
  const order = ['Pool', 'Prospect', 'Lead', 'Investor Family', 'Junk']
  return Object.entries(by).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([st, list]) => ({ label: st === 'Prospect' ? 'Prospects' : st === 'Lead' ? 'Leads' : st, count: list.length, to: listTo(STAGE_ROUTE[st], list, label) }))
}

// ---------------------------------------------------------------- facts
const callsIn = (p, users) => db().calls.filter((c) => inP(c.at, p) && users.includes(c.madeBy))
const connected = (c) => c.status === 'Connected'
/** Stage moves from the record history ("moved it from Pool to Prospect"), by who moved it. */
export function moves(p, users) {
  return db().activities.filter((a) => a.type === 'stage' && inP(a.at, p) && users.includes(a.actor)).map((a) => {
    const m = String(a.text).match(/from (.+?) to (.+)$/); return m ? { id: a.id, clientId: a.clientId, at: a.at, actor: a.actor, from: m[1], to: m[2] } : null
  }).filter(Boolean)
}
const handovers = (p, users) => db().handovers.filter((h) => inP(h.createdAt, p) && users.includes(h.advisorId) && h.status !== 'Reverted')
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const change = (v, was) => (v == null || was == null ? null : was === 0 ? (v === 0 ? 0 : null) : Math.round(((v - was) / Math.abs(was)) * 100))

/** Headline numbers with their change against the comparison period and a daily trend line. */
export function headline(p, prev, users) {
  const c = callsIn(p, users); const cp = callsIn(prev, users)
  const conn = c.filter(connected); const connP = cp.filter(connected)
  const fu = c.filter((x) => connected(x) && x.subStatus === 'Followup'); const fuP = cp.filter((x) => connected(x) && x.subStatus === 'Followup')
  const ni = c.filter((x) => connected(x) && x.subStatus === 'Not Interested'); const niP = cp.filter((x) => connected(x) && x.subStatus === 'Not Interested')
  const mv = moves(p, users); const mvP = moves(prev, users)
  const taken = mv.filter((m) => m.from === 'Pool' && m.to === 'Prospect'); const takenP = mvP.filter((m) => m.from === 'Pool' && m.to === 'Prospect')
  const toLead = mv.filter((m) => m.to === 'Lead' && m.from !== 'Lead'); const toLeadP = mvP.filter((m) => m.to === 'Lead' && m.from !== 'Lead')
  const ho = handovers(p, users); const hoP = handovers(prev, users)
  const people = (l) => l.reduce((s, h) => s + h.memberCount, 0)
  const talk = (l) => l.reduce((s, x) => s + (x.duration || 0), 0)
  const series = (list, at, val = () => 1) => days(p).map((d) => list.filter((x) => at(x) >= d && at(x) < d + DAY).reduce((s, x) => s + val(x), 0))
  const rateSeries = days(p).map((d) => { const day = c.filter((x) => x.at >= d && x.at < d + DAY); return day.length ? Math.round((day.filter(connected).length / day.length) * 100) : null })
  return [
    { key: 'calls', label: 'Calls made', value: c.length, delta: change(c.length, cp.length), spark: series(c, (x) => x.at), drill: drillCalls(c.map((x) => x.id), 'Calls made') },
    { key: 'connect', label: 'Connected', value: pct(conn.length, c.length), suffix: '%', sub: `${conn.length} of ${c.length} calls`, delta: change(pct(conn.length, c.length), pct(connP.length, cp.length)), spark: rateSeries, drill: drillCalls(conn.map((x) => x.id), 'Connected calls') },
    { key: 'talk', label: 'Talk time', value: talk(conn), time: true, sub: conn.length ? `${Math.round(talk(conn) / conn.length / 60)} min a call` : '', delta: change(talk(conn), talk(connP)), spark: series(conn, (x) => x.at, (x) => (x.duration || 0) / 60), drill: drillCalls(conn.map((x) => x.id), 'Connected calls') },
    { key: 'followups', label: 'Followups set', value: fu.length, delta: change(fu.length, fuP.length), spark: series(fu, (x) => x.at), drill: drillCalls(fu.map((x) => x.id), 'Calls ending in a followup') },
    { key: 'taken', label: 'Taken from Pool', value: taken.length, sub: 'became Prospects', delta: change(taken.length, takenP.length), spark: series(taken, (x) => x.at), drill: drillClients(taken.map((m) => m.clientId), 'Taken from Pool') },
    { key: 'leads', label: 'New Leads', value: toLead.length, sub: 'moved to Lead', delta: change(toLead.length, toLeadP.length), spark: series(toLead, (x) => x.at), drill: drillClients(toLead.map((m) => m.clientId), 'Moved to Lead') },
    { key: 'conv', label: 'Converted to Investor', value: people(ho), sub: `${new Set(ho.map((h) => h.familyId)).size} famil${new Set(ho.map((h) => h.familyId)).size === 1 ? 'y' : 'ies'}`, delta: change(people(ho), people(hoP)), spark: series(ho, (x) => x.createdAt, (x) => x.memberCount), drill: drillClients(ho.map((h) => h.clientId), 'Converted to Investor'), testid: 'dash-conv-people' },
    { key: 'ni', label: 'Not interested', value: pct(ni.length, conn.length), suffix: '%', sub: `${ni.length} of ${conn.length} connected`, delta: change(pct(ni.length, conn.length), pct(niP.length, connP.length)), negativeIsBetter: true, spark: series(ni, (x) => x.at), drill: drillCalls(ni.map((x) => x.id), 'Calls: not interested') },
  ]
}

/** Where the records stand now (stock), and how many moved between stages in the period (flow). */
export function funnel(p, users) {
  const s = db(); const mine = (c) => users.includes(c.assignedTo)
  const at = (st) => s.clients.filter((c) => c.stage === st && (st === 'Pool' || mine(c)))
  const mv = moves(p, users)
  const flow = (from, to) => mv.filter((m) => m.from === from && m.to === to)
  const conv = handovers(p, users)
  const stages = [
    ...(isAdmin() ? [{ stage: 'Pool', label: 'Pool', ids: at('Pool').map((c) => c.id), testid: 'dash-pool' }] : []),
    { stage: 'Prospect', label: 'Prospects', ids: at('Prospect').map((c) => c.id), testid: 'dash-prospects', inFlow: flow('Pool', 'Prospect') },
    { stage: 'Lead', label: 'Leads', ids: at('Lead').map((c) => c.id), testid: 'dash-leads', inFlow: mv.filter((m) => m.to === 'Lead' && m.from !== 'Lead') },
    { stage: 'Investor Family', label: 'Investor Family', ids: at('Investor Family').filter((c) => !isFamilyComplete(c)).map((c) => c.id), testid: 'dash-investor-family', inFlow: conv.map((h) => ({ clientId: h.clientId })) },
  ]
  return stages.map((x) => ({ ...x, count: x.ids.length, to: { path: STAGE_ROUTE[x.stage] }, moved: x.inFlow ? x.inFlow.length : null, movedDrill: x.inFlow ? drillClients(x.inFlow.map((m) => m.clientId), `Moved to ${x.label}`) : null }))
}

/** What needs doing now (not tied to the period): the list a person works from. */
export function attention(users) {
  const s = db(); const now = Date.now(); const today = startOfDay()
  const mine = (c) => c && users.includes(c.assignedTo)
  const lastCall = (cid) => Math.max(0, ...s.calls.filter((x) => x.clientId === cid && x.direction === 'Outbound').map((x) => x.at))
  const evs = s.events.filter((e) => !e.cancelled && ((e.attendees || []).some((a) => users.includes(a)) || users.includes(e.createdBy)))
  const overdue = evs.filter((e) => e.type === 'Call Follow-up' && e.start < now && e.start > now - 60 * DAY && e.clientId && lastCall(e.clientId) < e.start && ['Prospect', 'Lead', 'Investor Family'].includes(s.clientById(e.clientId)?.stage))
  const todays = evs.filter((e) => e.start >= today && e.start < today + DAY)
  const tasks = s.tasks.filter((t) => users.includes(t.assignedTo) && t.due < now && !['Completed', 'Rejected'].includes(t.status) && t.due > now - 60 * DAY)
  const missed = s.calls.filter((x) => x.direction === 'Inbound' && x.status !== 'Connected' && x.at > now - 14 * DAY && mine(s.clientById(x.clientId)) && lastCall(x.clientId) < x.at)
  const idle = s.clients.filter((c) => ['Prospect', 'Lead'].includes(c.stage) && mine(c) && (!c.lastCallAt || c.lastCallAt < now - 60 * DAY))
  const reply = s.clients.filter((c) => mine(c) && c.replyWindowUntil > now)
  const approvals = myPendingApprovals()
  return [
    { key: 'overdue', icon: 'lucide-phone-missed', tone: 'red', label: 'Followup calls overdue', hint: 'No call since the followup time', count: overdue.length, drill: drillEvents(overdue.map((e) => e.id), 'Followup calls overdue') },
    { key: 'today', icon: 'lucide-calendar-clock', tone: 'blue', label: 'Events today', hint: 'Calls and meetings planned for today', count: todays.length, drill: drillEvents(todays.map((e) => e.id), 'Events today') },
    { key: 'missed', icon: 'lucide-phone-incoming', tone: 'red', label: 'Missed calls not called back', hint: 'They called in the last 14 days', count: missed.length, drill: drillCalls(missed.map((x) => x.id), 'Missed calls not called back') },
    { key: 'reply', icon: 'lucide-message-circle', tone: 'green', label: 'Clients who replied', hint: 'Replied in 24 hours: message them freely', count: reply.length, drill: drillClients(reply.map((c) => c.id), 'Clients who replied (24 hours)') },
    { key: 'tasks', icon: 'lucide-list-todo', tone: 'amber', label: 'Tasks overdue', hint: 'Past their due date and not completed', count: tasks.length, drill: drillTasks(tasks.map((t) => t.id), 'Tasks overdue') },
    { key: 'idle', icon: 'lucide-hourglass', tone: 'amber', label: 'Not called for 60+ days', hint: 'Prospects and Leads going cold', count: idle.length, drill: drillClients(idle.map((c) => c.id), 'Not called for 60+ days') },
    ...(approvals.length ? [{ key: 'approvals', icon: 'lucide-badge-check', tone: 'violet', label: 'Approvals waiting for you', hint: 'Requests that need your decision', count: approvals.length, drill: drillClients(approvals.map((a) => a.clientId), 'Approvals waiting for you') }] : []),
  ]
}

/** Calls per day of the period: outgoing connected, outgoing not connected, incoming. */
export function callsByDay(p, users) {
  const c = callsIn(p, users); const ids = {}
  const rows = days(p).map((d) => {
    const day = c.filter((x) => x.at >= d && x.at < d + DAY); const k = dayKey(d)
    const groups = { Connected: day.filter((x) => x.direction === 'Outbound' && connected(x)), 'Not connected': day.filter((x) => x.direction === 'Outbound' && !connected(x)), Incoming: day.filter((x) => x.direction === 'Inbound') }
    for (const [g, l] of Object.entries(groups)) ids[`${k}|${g}`] = l.map((x) => x.id)
    return { date: k, ...Object.fromEntries(Object.entries(groups).map(([g, l]) => [g, l.length])) }
  })
  return { rows, ids, total: c.length }
}
/** How calls ended. */
export function outcomes(p, users) {
  const c = callsIn(p, users); const by = {}
  for (const x of c) { const k = connected(x) ? x.subStatus || 'Connected' : 'Not connected'; (by[k] ||= []).push(x.id) }
  return Object.entries(by).map(([outcome, ids]) => ({ outcome, calls: ids.length, ids })).sort((a, b) => b.calls - a.calls)
}
/** When clients pick up: connected calls by weekday and hour (outgoing calls of the last 90 days, for enough data). */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function bestHours(users) {
  const now = Date.now()
  const c = db().calls.filter((x) => x.direction === 'Outbound' && users.includes(x.madeBy) && x.at > now - 90 * DAY)
  const cells = {}
  for (const x of c) { const d = new Date(x.at); const h = d.getHours(); if (h < 9 || h > 20) continue; const k = `${WEEKDAYS[(d.getDay() + 6) % 7]}|${h}`; (cells[k] ||= { all: [], ok: [] }).all.push(x.id); if (connected(x)) cells[k].ok.push(x.id) }
  const rows = []; for (const day of WEEKDAYS) for (let h = 9; h <= 20; h++) { const v = cells[`${day}|${h}`]; rows.push({ day, hour: `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`, rate: v ? Math.round((v.ok.length / v.all.length) * 100) : null, calls: v ? v.all.length : 0, ids: v ? v.all : [] }) }
  return { rows, total: c.length, any: rows.some((r) => r.calls) }
}

/** Where records come from, and how far they get (all records in scope, not only this period). */
export function sources(users) {
  const s = db(); const by = {}
  for (const c of s.clients) {
    if (!(users.includes(c.assignedTo) || (isAdmin() && c.stage === 'Pool'))) continue
    const k = c.source || 'Not known'; const r = (by[k] ||= { source: k, all: [], leads: [], investors: [] })
    r.all.push(c.id); if (c.stage === 'Lead') r.leads.push(c.id); if (c.stage === 'Investor Family') r.investors.push(c.id)
  }
  return Object.values(by).map((r) => ({ ...r, total: r.all.length, conv: pct(r.investors.length, r.all.length) })).sort((a, b) => b.total - a.total)
}

/** Prospects and Leads by days since the last call: where records are going cold. */
// the business works in 30 / 60 / 90 days (product owner, 21 Nov 2026)
export const AGE_BUCKETS = [['0–30 days', 0, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['Over 90 days', 91, Infinity], ['Never called', null, null]]
export function ageing(users) {
  const now = Date.now()
  return ['Prospect', 'Lead'].map((stage) => {
    const list = db().clients.filter((c) => c.stage === stage && users.includes(c.assignedTo))
    const buckets = AGE_BUCKETS.map(([label, a, b]) => {
      const ids = list.filter((c) => (a == null ? !c.lastCallAt : c.lastCallAt && Math.floor((now - c.lastCallAt) / DAY) >= a && Math.floor((now - c.lastCallAt) / DAY) <= b)).map((c) => c.id)
      return { label, ids, count: ids.length }
    })
    return { stage, label: stage === 'Prospect' ? 'Prospects' : 'Leads', total: list.length, buckets }
  })
}

/** One row per person in scope (team leader and above): the same measures as the headline, with their team. */
export function teamTable(p, users) {
  const s = db(); const att = (uid) => attention([uid])
  return s.users.filter((u) => users.includes(u.id) && u.role !== 'Admin' && u.active !== false).map((u) => {
    const c = callsIn(p, [u.id]); const conn = c.filter(connected); const mv = moves(p, [u.id]); const ho = handovers(p, [u.id])
    const a = att(u.id)
    return { id: u.id, name: u.name, role: u.role, team: teamOf(u.id), leaderId: u.role === 'TL' ? u.id : null, calls: c.length, connected: conn.length, connect: pct(conn.length, c.length), talk: conn.reduce((t, x) => t + (x.duration || 0), 0),
      followups: c.filter((x) => connected(x) && x.subStatus === 'Followup').length, overdue: a.find((x) => x.key === 'overdue').count,
      leads: mv.filter((m) => m.to === 'Lead' && m.from !== 'Lead').length, conv: ho.reduce((t, h) => t + h.memberCount, 0),
      callIds: c.map((x) => x.id), overdueDrill: a.find((x) => x.key === 'overdue').drill }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** Messages and documents sent in the period, and the replies that came back. */
export function engagement(p, users) {
  const s = db(); const mineC = (cid) => users.includes(s.clientById(cid)?.assignedTo)
  const ch = (list) => {
    const sent = list.filter((m) => m.direction === 'Sent' && inP(m.at, p) && users.includes(m.sentBy))
    const got = list.filter((m) => m.direction === 'Received' && inP(m.at, p) && mineC(m.clientId))
    const messaged = new Set(sent.map((m) => m.clientId)); const replied = new Set(got.filter((m) => messaged.has(m.clientId)).map((m) => m.clientId))
    return { sent, got, rate: pct(replied.size, messaged.size), messaged: messaged.size, replied: replied.size }
  }
  const wa = ch(s.wa); const em = ch(s.emails)
  const docs = {}
  for (const m of wa.sent) if (m.doc) (docs[m.doc.name] ||= { name: m.doc.name, mime: m.doc.mime, n: 0 }).n++
  for (const m of em.sent) for (const d of m.docs || []) (docs[d.name] ||= { name: d.name, mime: d.mime, n: 0 }).n++
  return { wa, em, docs: Object.values(docs).sort((a, b) => b.n - a.n).slice(0, 5) }
}

/** Admin: handovers to Investor DMS in the period, by state (to spot a stuck or failed one). */
export function handoverStatus(p) {
  const list = db().handovers.filter((h) => inP(h.createdAt, p))
  return { Pending: list.filter((h) => h.status === 'Pending').length, Delivered: list.filter((h) => h.status === 'Delivered').length, Failed: list.filter((h) => h.status === 'Failed').length }
}

// ---------------------------------------------------------------- Analyse: build your own chart
// A measure is a list of facts (one per call, move, conversion or message) with the factors it can be grouped or
// split by. The chart sums `value` per group; a click opens the records behind that bar.
const langOf = (c) => c?.members?.[0]?.language || 'Not known'
const srcOf = (c) => c?.source || 'Not known'
const nameOf = (id) => db().userById(id)?.name || 'Unknown'
export const MEASURES = [
  { value: 'calls', label: 'Calls made', unit: 'calls', kind: 'calls' },
  { value: 'connected', label: 'Connected calls', unit: 'calls', kind: 'calls' },
  { value: 'talk', label: 'Talk time (minutes)', unit: 'min', kind: 'calls' },
  { value: 'followups', label: 'Followups set', unit: 'calls', kind: 'calls' },
  { value: 'moves', label: 'Stage moves', unit: 'records', kind: 'clients' },
  { value: 'conversions', label: 'Converted to Investor (people)', unit: 'people', kind: 'clients' },
  { value: 'wa', label: 'WhatsApp messages sent', unit: 'messages', kind: 'wa' },
  { value: 'email', label: 'Emails sent', unit: 'emails', kind: 'email' },
]
export const FACTORS = [
  { value: 'date', label: 'Date' }, { value: 'team', label: 'Team' }, { value: 'advisor', label: 'IS' }, { value: 'source', label: 'Source' }, { value: 'stage', label: 'Stage' },
  { value: 'outcome', label: 'Call outcome / type' }, { value: 'language', label: 'Language' }, { value: 'direction', label: 'Incoming / outgoing' },
]
/** The team a person belongs to: their team leader's team (a team leader leads their own); above that, Management. */
export function teamOf(uid) {
  const s = db(); let u = s.userById(uid)
  for (let i = 0; u && i < 8; i++) { if (u.role === 'TL') return `${u.name}'s team`; u = s.userById(u.reportsTo) }
  return 'Management'
}
export function facts(measure, p, users) { return rawFacts(measure, p, users).map((f) => ({ ...f, team: teamOf(f.uid) })) }
function rawFacts(measure, p, users) {
  const s = db(); const C = (id) => s.clientById(id)
  if (['calls', 'connected', 'talk', 'followups'].includes(measure)) {
    let list = callsIn(p, users)
    if (measure === 'connected' || measure === 'talk') list = list.filter(connected)
    if (measure === 'followups') list = list.filter((x) => connected(x) && x.subStatus === 'Followup')
    return list.map((x) => ({ id: x.id, at: x.at, value: measure === 'talk' ? (x.duration || 0) / 60 : 1, uid: x.madeBy, advisor: nameOf(x.madeBy), source: srcOf(C(x.clientId)), stage: x.stageAtCall || 'Not known',
      outcome: connected(x) ? x.subStatus || 'Connected' : 'Not connected', language: langOf(C(x.clientId)), direction: x.direction === 'Inbound' ? 'Incoming' : 'Outgoing' }))
  }
  if (measure === 'moves') return moves(p, users).map((m) => ({ id: m.clientId, at: m.at, value: 1, uid: m.actor, advisor: nameOf(m.actor), source: srcOf(C(m.clientId)), stage: `${m.from} → ${m.to}`, outcome: `${m.from} → ${m.to}`, language: langOf(C(m.clientId)), direction: '—' }))
  if (measure === 'conversions') return handovers(p, users).map((h) => ({ id: h.clientId, at: h.createdAt, value: h.memberCount, uid: h.advisorId, advisor: nameOf(h.advisorId), source: srcOf(C(h.clientId)), stage: h.convertedFromStage || 'Not known', outcome: 'Converted', language: langOf(C(h.clientId)), direction: '—' }))
  const list = (measure === 'wa' ? s.wa : s.emails).filter((m) => m.direction === 'Sent' && inP(m.at, p) && users.includes(m.sentBy))
  return list.map((m) => ({ id: m.id, at: m.at, value: 1, uid: m.sentBy, advisor: nameOf(m.sentBy), source: srcOf(C(m.clientId)), stage: m.stage || 'Not known', outcome: m.doc || m.docs?.length ? 'Document' : m.type || 'Message', language: langOf(C(m.clientId)), direction: 'Outgoing' }))
}
export function drillFor(measure, ids, label) {
  const k = MEASURES.find((m) => m.value === measure)?.kind
  return k === 'calls' ? drillCalls(ids, label) : k === 'clients' ? drillClients(ids, label) : drillMessages(k, ids, label)
}
/**
 * Group facts by a factor (date by day / week / month) and split by another: chart rows + the records of each bar.
 * Many values (150 advisors): only the biggest `topX` groups and `topS` split values are drawn; the rest are summed
 * into "Others", which still opens its records.
 */
export const OTHERS = 'Others'
export function groupFacts(list, by, split, grain = 'day', { topX = 0, topS = 0 } = {}) {
  const keyOf = (f, k) => {
    if (k !== 'date') return f[k]
    const d = new Date(f.at); if (grain === 'month') d.setDate(1); if (grain === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return dayKey(d.getTime())
  }
  const sum = (m, k, v) => m.set(k, (m.get(k) || 0) + v)
  const xTot = new Map(); const sTot = new Map()
  for (const f of list) { sum(xTot, keyOf(f, by), f.value); if (split) sum(sTot, String(keyOf(f, split)), f.value) }
  const keep = (tot, n) => (n && tot.size > n + 1 ? new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)) : null)
  const keepX = by === 'date' ? null : keep(xTot, topX); const keepS = split ? keep(sTot, topS) : null
  const rows = new Map(); const ids = {}; const series = new Set()
  for (const f of list) {
    let x = keyOf(f, by); if (keepX && !keepX.has(x)) x = OTHERS
    let sname = split ? String(keyOf(f, split)) : 'Total'; if (keepS && !keepS.has(sname)) sname = OTHERS
    series.add(sname)
    const r = rows.get(x) || { x }; r[sname] = Math.round(((r[sname] || 0) + f.value) * 10) / 10; rows.set(x, r)
    ;(ids[`${x}|${sname}`] ||= []).push(f.id)
  }
  const total = (r) => Object.keys(r).reduce((t, k) => t + (k === 'x' ? 0 : r[k]), 0)
  const out = [...rows.values()]
  out.sort((a, b) => (by === 'date' ? String(a.x).localeCompare(String(b.x)) : a.x === OTHERS ? 1 : b.x === OTHERS ? -1 : total(b) - total(a)))
  const names = [...series].sort((a, b) => (a === OTHERS ? 1 : b === OTHERS ? -1 : (sTot.get(b) || 0) - (sTot.get(a) || 0)))
  for (const r of out) for (const n of names) r[n] ??= 0
  return { rows: out, series: names, ids, hiddenX: keepX ? xTot.size - keepX.size : 0, hiddenS: keepS ? sTot.size - keepS.size : 0 }
}
