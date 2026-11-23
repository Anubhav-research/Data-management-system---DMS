// Investor DMS dashboard (product owner, 21 Nov 2026): the same page and rules as the Prospect DMS dashboard, built
// around what this website runs - investors (Prospect investor, Active, Inactive), their AUM, and deals (products,
// amounts, outcome). Only this website's own data. Scope by hierarchy: an advisor sees their own book, a team
// leader and above their downline (one team or one person on request), Admin everything. No targets, no ranking.
// Every figure carries the records behind it (`drill`): a click opens the list showing exactly those records
// (?ids=...&from=...). Counts use the same rules as the lists they open (QA TS-21).
import { useDb } from '@/stores/db'
import { visibleUserIds, isAdmin, downline } from './access'
import { myPendingApprovals } from './approvals'
import { STAGE_ROUTE } from '@/data/masters'
import { shownInLists } from './investorSignals' // the lists leave some investors out: the dashboard counts the same ones

const db = () => useDb()
const DAY = 86400000
export const inP = (t, p) => t != null && t >= p.from && t < p.to

// ---------------------------------------------------------------- period (as Prospect DMS)
export const RANGES = ['Today', 'This week', 'This month', 'This quarter', 'Custom']
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
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
export function previousOf(f, p) {
  const upTo = Math.min(Date.now(), p.to) - p.from
  const back = (months) => { const d = new Date(p.from); d.setMonth(d.getMonth() - months); return d.getTime() }
  const from = f.range === 'Today' ? p.from - DAY : f.range === 'This week' ? p.from - 7 * DAY : f.range === 'This month' ? back(1) : f.range === 'This quarter' ? back(3) : p.from - (p.to - p.from)
  const caption = { Today: 'vs yesterday', 'This week': 'vs same days last week', 'This month': 'vs same days last month', 'This quarter': 'vs same days last quarter' }[f.range] || 'vs the period before'
  return { from, to: from + (f.range === 'Custom' ? p.to - p.from : upTo), caption }
}
function days(p) { const out = []; for (let t = p.from; t < Math.min(p.to, startOfDay() + DAY); t += DAY) out.push(t); return out }
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ---------------------------------------------------------------- scope
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
/** The team a person belongs to: their team leader's team; above that, Management. */
export function teamOf(uid) {
  const s = db(); let u = s.userById(uid)
  for (let i = 0; u && i < 8; i++) { if (u.role === 'TL') return `${u.name}'s team`; u = s.userById(u.reportsTo) }
  return 'Management'
}

// ---------------------------------------------------------------- drill-down
const listTo = (path, ids, label) => ({ path, query: { ids: ids.join(','), from: label } })
export const drillCalls = (ids, label) => [{ label: 'Call Logs', count: ids.length, to: listTo('/call-logs', ids, label) }]
export const drillDeals = (ids, label) => [{ label: 'Deals', count: ids.length, to: listTo('/deals', ids, label) }]
export const drillEvents = (ids, label) => [{ label: 'Events', count: ids.length, to: listTo('/events', ids, label) }]
export const drillTasks = (ids, label) => [{ label: 'Tasks', count: ids.length, to: listTo('/tasks', ids, label) }]
export const drillMessages = (channel, ids, label) => [{ label: channel === 'wa' ? 'WhatsApp Logs' : 'Email Logs', count: ids.length, to: listTo(channel === 'wa' ? '/whatsapp-logs' : '/email-logs', ids, label) }]
export function drillClients(ids, label) {
  const by = {}
  for (const id of new Set(ids)) { const st = db().clientById(id)?.stage; if (!st || !STAGE_ROUTE[st] || (st !== 'Investor' && !isAdmin())) continue; (by[st] ||= []).push(id) }
  return Object.entries(by).map(([st, list]) => ({ label: st === 'Investor' ? 'Investors' : st === 'Unassigned' ? 'Unassigned Investors' : st, count: list.length, to: listTo(STAGE_ROUTE[st], list, label) }))
}

// ---------------------------------------------------------------- facts
const callsIn = (p, users) => db().calls.filter((c) => inP(c.at, p) && users.includes(c.madeBy))
const connected = (c) => c.status === 'Connected'
const ownerOf = (d) => db().clientById(d.clientId)?.assignedTo
const dealsIn = (p, users) => db().deals.filter((d) => inP(d.start, p) && users.includes(ownerOf(d)))
const invested = (d) => (d.status === 'Completed' ? Number(d.finalAmount ?? d.total ?? 0) : 0)
const myInvestors = (users) => db().clients.filter((c) => c.stage === 'Investor' && shownInLists(c) && users.includes(c.assignedTo))
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const change = (v, was) => (v == null || was == null ? null : was === 0 ? (v === 0 ? 0 : null) : Math.round(((v - was) / Math.abs(was)) * 100))
const decided = (l) => l.filter((d) => ['Completed', 'Rejected', 'Expired'].includes(d.status))

// AUM card line: the gain over the money invested, at the last end-of-day values
const short = (v) => (Math.abs(v) >= 1e7 ? `₹${(Math.abs(v) / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `₹${(Math.abs(v) / 1e5).toFixed(1)}L` : `₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`)
function gainText(aum, invested, n) { if (!invested) return `${n} investor${n === 1 ? '' : 's'} · end-of-day value`; const g = aum - invested; return `${g >= 0 ? '+' : '−'}${short(g)} (${g >= 0 ? '+' : '−'}${Math.abs(Math.round((g / invested) * 1000) / 10)}%) on ${short(invested)} invested` }
/** Headline numbers with their change against the comparison period and a daily trend. */
export function headline(p, prev, users) {
  const dl = dealsIn(p, users); const dlP = dealsIn(prev, users)
  const won = dl.filter((d) => d.status === 'Completed'); const wonP = dlP.filter((d) => d.status === 'Completed')
  const sum = (l) => l.reduce((t, d) => t + invested(d), 0)
  const c = callsIn(p, users); const cp = callsIn(prev, users); const conn = c.filter(connected); const connP = cp.filter(connected)
  const inv = myInvestors(users); const aum = inv.reduce((t, x) => t + Number(x.aum || 0), 0)
  const active = inv.filter((x) => x.invStatus === 'Active')
  const series = (list, at, val = () => 1) => days(p).map((d) => list.filter((x) => at(x) >= d && at(x) < d + DAY).reduce((s, x) => s + val(x), 0))
  return [
    { key: 'invested', label: 'Money invested', value: sum(won), money: true, sub: `${won.length} completed deal${won.length === 1 ? '' : 's'}`, delta: change(sum(won), sum(wonP)), spark: series(won, (d) => d.start, invested), drill: drillDeals(won.map((d) => d.id), 'Completed deals') },
    { key: 'won', label: 'Deals completed', value: won.length, delta: change(won.length, wonP.length), spark: series(won, (d) => d.start), drill: drillDeals(won.map((d) => d.id), 'Completed deals') },
    { key: 'winrate', label: 'Win rate', value: pct(won.length, decided(dl).length), suffix: '%', sub: `${won.length} of ${decided(dl).length} decided deals`, delta: change(pct(won.length, decided(dl).length), pct(wonP.length, decided(dlP).length)), drill: drillDeals(decided(dl).map((d) => d.id), 'Decided deals') },
    { key: 'avg', label: 'Average deal', value: won.length ? Math.round(sum(won) / won.length) : 0, money: true, sub: 'invested per completed deal', delta: change(won.length ? sum(won) / won.length : 0, wonP.length ? sum(wonP) / wonP.length : 0), drill: drillDeals(won.map((d) => d.id), 'Completed deals') },
    { key: 'aum', label: 'AUM', value: aum, money: true, sub: gainText(aum, inv.reduce((t, x) => t + Number(x.invested || 0), 0), inv.length), drill: drillClients(inv.map((x) => x.id), 'Investors (AUM)'), testid: 'dash-aum' },
    { key: 'active', label: 'Active investors', value: active.length, sub: `of ${inv.length} investors · now`, drill: drillClients(active.map((x) => x.id), 'Active investors') },
    { key: 'calls', label: 'Calls made', value: c.length, delta: change(c.length, cp.length), spark: series(c, (x) => x.at), drill: drillCalls(c.map((x) => x.id), 'Calls made') },
    { key: 'connect', label: 'Connected', value: pct(conn.length, c.length), suffix: '%', sub: `${conn.length} of ${c.length} calls`, delta: change(pct(conn.length, c.length), pct(connP.length, cp.length)), drill: drillCalls(conn.map((x) => x.id), 'Connected calls') },
  ]
}

/** The book now: investors by status, with their AUM. */
export function book(users) {
  const inv = myInvestors(users)
  return ['Active', 'Inactive', 'Prospect'].map((st) => {
    const l = inv.filter((c) => c.invStatus === st)
    return { status: st, label: st === 'Prospect' ? 'Not invested yet' : st, count: l.length, aum: l.reduce((t, c) => t + Number(c.aum || 0), 0), ids: l.map((c) => c.id) }
  })
}
/** Money invested in the period by product (completed deals: the product rows of each deal, by share of the final amount). */
export function byProduct(p, users) {
  const by = {}
  for (const d of dealsIn(p, users).filter((x) => x.status === 'Completed')) {
    const rows = d.rows || []; const planned = rows.reduce((t, r) => t + Number(r.amount || 0), 0) || 1; const final = invested(d)
    for (const r of rows) { const k = r.product || 'Other'; const e = (by[k] ||= { product: k, amount: 0, ids: [] }); e.amount += Math.round((final * Number(r.amount || 0)) / planned); if (!e.ids.includes(d.id)) e.ids.push(d.id) }
  }
  return Object.values(by).map((e) => ({ ...e, lakh: Math.round(e.amount / 1e4) / 10 })).sort((a, b) => b.amount - a.amount)
}
/** Deals of the period by week and outcome. */
export function dealsByWeek(p, users) {
  const ids = {}; const rows = new Map()
  for (const d of dealsIn(p, users)) {
    const w = new Date(d.start); w.setHours(0, 0, 0, 0); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); const k = dayKey(w.getTime())
    const r = rows.get(k) || { week: k, Scheduled: 0, Completed: 0, Rejected: 0, Expired: 0 }; r[d.status] = (r[d.status] || 0) + 1; rows.set(k, r)
    ;(ids[`${k}|${d.status}`] ||= []).push(d.id)
  }
  return { rows: [...rows.values()].sort((a, b) => a.week.localeCompare(b.week)), ids }
}

/** What needs doing now (not tied to the period). */
export function attention(users) {
  const s = db(); const now = Date.now(); const today = startOfDay()
  const mine = (c) => c && c.stage === 'Investor' && shownInLists(c) && users.includes(c.assignedTo)
  const lastCall = (cid) => Math.max(0, ...s.calls.filter((x) => x.clientId === cid && x.direction === 'Outbound').map((x) => x.at))
  const dueDeals = s.deals.filter((d) => d.status === 'Scheduled' && d.start < now && users.includes(ownerOf(d)))
  const todayDeals = s.deals.filter((d) => d.status === 'Scheduled' && d.start >= today && d.start < today + DAY && users.includes(ownerOf(d)))
  const evs = s.events.filter((e) => !e.cancelled && ((e.attendees || []).some((a) => users.includes(a)) || users.includes(e.createdBy)))
  const overdue = evs.filter((e) => e.type === 'Call Follow-up' && e.start < now && e.start > now - 60 * DAY && e.clientId && lastCall(e.clientId) < e.start && mine(s.clientById(e.clientId)))
  const missed = s.calls.filter((x) => x.direction === 'Inbound' && x.status !== 'Connected' && x.at > now - 14 * DAY && mine(s.clientById(x.clientId)) && lastCall(x.clientId) < x.at)
  const reply = s.clients.filter((c) => mine(c) && c.replyWindowUntil > now)
  const tasks = s.tasks.filter((t) => users.includes(t.assignedTo) && t.due < now && !['Completed', 'Rejected'].includes(t.status) && t.due > now - 60 * DAY)
  const idle = s.clients.filter((c) => mine(c) && (!c.lastCallAt || c.lastCallAt < now - 60 * DAY))
  const approvals = myPendingApprovals()
  const unassigned = isAdmin() ? s.clients.filter((c) => c.stage === 'Unassigned' && shownInLists(c)) : []
  return [
    { key: 'dueDeals', icon: 'lucide-handshake', tone: 'red', label: 'Deals waiting for an outcome', hint: 'Their time has passed: mark Completed or Rejected', count: dueDeals.length, drill: drillDeals(dueDeals.map((d) => d.id), 'Deals waiting for an outcome') },
    { key: 'todayDeals', icon: 'lucide-calendar-clock', tone: 'blue', label: 'Deals today', hint: 'Investment meetings planned for today', count: todayDeals.length, drill: drillDeals(todayDeals.map((d) => d.id), 'Deals today') },
    { key: 'overdue', icon: 'lucide-phone-missed', tone: 'red', label: 'Followup calls overdue', hint: 'No call since the followup time', count: overdue.length, drill: drillEvents(overdue.map((e) => e.id), 'Followup calls overdue') },
    { key: 'missed', icon: 'lucide-phone-incoming', tone: 'red', label: 'Missed calls not called back', hint: 'They called in the last 14 days', count: missed.length, drill: drillCalls(missed.map((x) => x.id), 'Missed calls not called back') },
    { key: 'reply', icon: 'lucide-message-circle', tone: 'green', label: 'Investors who replied', hint: 'Replied in 24 hours: message them freely', count: reply.length, drill: drillClients(reply.map((c) => c.id), 'Investors who replied (24 hours)') },
    { key: 'tasks', icon: 'lucide-list-todo', tone: 'amber', label: 'Tasks overdue', hint: 'Past their due date and not completed', count: tasks.length, drill: drillTasks(tasks.map((t) => t.id), 'Tasks overdue') },
    { key: 'idle', icon: 'lucide-hourglass', tone: 'amber', label: 'Not called for 60+ days', hint: 'Investors going cold', count: idle.length, drill: drillClients(idle.map((c) => c.id), 'Not called for 60+ days') },
    ...(approvals.length ? [{ key: 'approvals', icon: 'lucide-badge-check', tone: 'violet', label: 'Approvals waiting for you', hint: 'Requests that need your decision', count: approvals.length, drill: drillClients(approvals.map((a) => a.clientId), 'Approvals waiting for you') }] : []),
    ...(isAdmin() ? [{ key: 'unassigned', icon: 'lucide-user-x', tone: 'amber', label: 'Unassigned investors', hint: 'Waiting for an IS', count: unassigned.length, drill: drillClients(unassigned.map((c) => c.id), 'Unassigned investors'), testid: 'dash-unassigned' }] : []),
  ]
}

/** Investors by days since the last call (30 / 60 / 90, as the business works). */
export const AGE_BUCKETS = [['0–30 days', 0, 30], ['31–60 days', 31, 60], ['61–90 days', 61, 90], ['Over 90 days', 91, Infinity], ['Never called', null, null]]
export function ageing(users) {
  const now = Date.now()
  return ['Active', 'Inactive', 'Prospect'].map((st) => {
    const list = myInvestors(users).filter((c) => c.invStatus === st)
    const buckets = AGE_BUCKETS.map(([label, a, b]) => {
      const ids = list.filter((c) => (a == null ? !c.lastCallAt : c.lastCallAt && Math.floor((now - c.lastCallAt) / DAY) >= a && Math.floor((now - c.lastCallAt) / DAY) <= b)).map((c) => c.id)
      return { label, ids, count: ids.length }
    })
    return { stage: st, label: st === 'Prospect' ? 'Not invested yet' : st, total: list.length, buckets }
  })
}

/** Calls per day, how they end, best time to call (as Prospect DMS). */
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
export function outcomes(p, users) {
  const by = {}
  for (const x of callsIn(p, users)) { const k = connected(x) ? x.subStatus || 'Connected' : 'Not connected'; (by[k] ||= []).push(x.id) }
  return Object.entries(by).map(([outcome, ids]) => ({ outcome, calls: ids.length, ids })).sort((a, b) => b.calls - a.calls)
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export function bestHours(users) {
  const now = Date.now(); const cells = {}
  const c = db().calls.filter((x) => x.direction === 'Outbound' && users.includes(x.madeBy) && x.at > now - 90 * DAY)
  for (const x of c) { const d = new Date(x.at); const h = d.getHours(); if (h < 9 || h > 20) continue; const k = `${WEEKDAYS[(d.getDay() + 6) % 7]}|${h}`; (cells[k] ||= { all: [], ok: [] }).all.push(x.id); if (connected(x)) cells[k].ok.push(x.id) }
  const rows = []; for (const day of WEEKDAYS) for (let h = 9; h <= 20; h++) { const v = cells[`${day}|${h}`]; rows.push({ day, hour: `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`, rate: v ? Math.round((v.ok.length / v.all.length) * 100) : null, calls: v ? v.all.length : 0, ids: v ? v.all : [] }) }
  return { rows, total: c.length, any: rows.some((r) => r.calls) }
}

/** Team leaders and above: one row per person with their book and their period. */
export function teamTable(p, users) {
  const s = db()
  return s.users.filter((u) => users.includes(u.id) && u.role !== 'Admin' && u.active !== false).map((u) => {
    const inv = myInvestors([u.id]); const dl = dealsIn(p, [u.id]); const won = dl.filter((d) => d.status === 'Completed'); const c = callsIn(p, [u.id])
    const a = attention([u.id])
    return { id: u.id, name: u.name, role: u.role, team: teamOf(u.id), investors: inv.length, aum: inv.reduce((t, x) => t + Number(x.aum || 0), 0), active: inv.filter((x) => x.invStatus === 'Active').length,
      invested: won.reduce((t, d) => t + invested(d), 0), won: won.length, decided: decided(dl).length, winrate: pct(won.length, decided(dl).length), calls: c.length, connected: c.filter(connected).length,
      overdue: a.find((x) => x.key === 'dueDeals').count + a.find((x) => x.key === 'overdue').count, dealIds: dl.map((d) => d.id), callIds: c.map((x) => x.id), investorIds: inv.map((x) => x.id) }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

/** Admin: families received from Prospect DMS in the period (each delivery once). */
export function received(p) {
  const list = db().inbox.filter((h) => inP(h.receivedAt, p))
  const acc = list.filter((h) => h.status === 'Accepted')
  return { accepted: acc.length, rejected: list.filter((h) => h.status === 'Rejected').length, people: acc.reduce((t, h) => t + h.members, 0) }
}

/** Messages and documents sent in the period, and replies. */
export function engagement(p, users) {
  const s = db(); const mineC = (cid) => users.includes(s.clientById(cid)?.assignedTo)
  const ch = (list) => {
    const sent = list.filter((m) => m.direction === 'Sent' && inP(m.at, p) && users.includes(m.sentBy))
    const got = list.filter((m) => m.direction === 'Received' && inP(m.at, p) && mineC(m.clientId))
    const messaged = new Set(sent.map((m) => m.clientId)); const replied = new Set(got.filter((m) => messaged.has(m.clientId)).map((m) => m.clientId))
    return { sent, got, rate: pct(replied.size, messaged.size) }
  }
  const wa = ch(s.wa); const em = ch(s.emails); const docs = {}
  for (const m of wa.sent) if (m.doc) (docs[m.doc.name] ||= { name: m.doc.name, n: 0 }).n++
  for (const m of em.sent) for (const d of m.docs || []) (docs[d.name] ||= { name: d.name, n: 0 }).n++
  return { wa, em, docs: Object.values(docs).sort((a, b) => b.n - a.n).slice(0, 5) }
}

// ---------------------------------------------------------------- Analyse
const langOf = (c) => c?.members?.[0]?.language || 'Not known'
const nameOf = (id) => db().userById(id)?.name || 'Unknown'
export const MEASURES = [
  { value: 'invested', label: 'Money invested (₹)', unit: '₹', kind: 'deals', money: true },
  { value: 'won', label: 'Deals completed', unit: 'deals', kind: 'deals' },
  { value: 'deals', label: 'All deals', unit: 'deals', kind: 'deals' },
  { value: 'calls', label: 'Calls made', unit: 'calls', kind: 'calls' },
  { value: 'connected', label: 'Connected calls', unit: 'calls', kind: 'calls' },
  { value: 'talk', label: 'Talk time (minutes)', unit: 'min', kind: 'calls' },
  { value: 'wa', label: 'WhatsApp messages sent', unit: 'messages', kind: 'wa' },
  { value: 'email', label: 'Emails sent', unit: 'emails', kind: 'email' },
]
export const FACTORS = [
  { value: 'date', label: 'Date' }, { value: 'team', label: 'Team' }, { value: 'advisor', label: 'IS' }, { value: 'product', label: 'Product' },
  { value: 'status', label: 'Deal outcome / call outcome' }, { value: 'invStatus', label: 'Investor status' }, { value: 'language', label: 'Language' },
]
export function facts(measure, p, users) {
  const s = db(); const C = (id) => s.clientById(id)
  const base = (uid, cid) => ({ uid, advisor: nameOf(uid), team: teamOf(uid), invStatus: C(cid)?.invStatus || 'Not known', language: langOf(C(cid)) })
  if (['invested', 'won', 'deals'].includes(measure)) {
    let list = dealsIn(p, users); if (measure !== 'deals') list = list.filter((d) => d.status === 'Completed')
    // one fact per product row, so "by product" splits a deal's money across its products
    return list.flatMap((d) => {
      const rows = d.rows?.length ? d.rows : [{ product: 'Other', amount: 1 }]; const planned = rows.reduce((t, r) => t + Number(r.amount || 0), 0) || 1
      return rows.map((r, i) => ({ id: d.id, at: d.start, value: measure === 'invested' ? Math.round((invested(d) * Number(r.amount || 0)) / planned) : i === 0 ? 1 : 0, product: r.product || 'Other', status: d.status, ...base(ownerOf(d), d.clientId) }))
    })
  }
  if (['calls', 'connected', 'talk'].includes(measure)) {
    let list = callsIn(p, users); if (measure !== 'calls') list = list.filter(connected)
    return list.map((x) => ({ id: x.id, at: x.at, value: measure === 'talk' ? (x.duration || 0) / 60 : 1, product: '—', status: connected(x) ? x.subStatus || 'Connected' : 'Not connected', ...base(x.madeBy, x.clientId) }))
  }
  const list = (measure === 'wa' ? s.wa : s.emails).filter((m) => m.direction === 'Sent' && inP(m.at, p) && users.includes(m.sentBy))
  return list.map((m) => ({ id: m.id, at: m.at, value: 1, product: '—', status: m.doc || m.docs?.length ? 'Document' : m.type || 'Message', ...base(m.sentBy, m.clientId) }))
}
export function drillFor(measure, ids, label) {
  const k = MEASURES.find((m) => m.value === measure)?.kind
  return k === 'deals' ? drillDeals([...new Set(ids)], label) : k === 'calls' ? drillCalls(ids, label) : drillMessages(k, ids, label)
}
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
