// Investor DMS dashboard, version 3 (product owner, 27 Nov 2026). Only this website's own data. The same frame as
// Prospect DMS (picker, compare, requests, period). What each reader asks:
//   IS                   - "how are my deals and calls going, what is planned, what do I do today"
//   TL / VP / President  - the same for their team, who to coach (effort vs results), every person, teams compared
//   Admin                - everyone, plus the Unassigned Investors queue
// Version 3 removed money invested and AUM headline cards, the Investments section, Top 10 by AUM, Sources and most
// Admin operations: investments are shown on the Transaction Platform. "Closed" = a deal marked Completed, with its
// final amount. Deals are plans: their amount is not certain until the investor invests, so planned amounts are
// always shown as "planned". "Lost" (moved to Unassigned) is shown to Admin only.
// Every number opens the list showing exactly its records (?ids=...&from=...) with the removable "From Dashboard" chip.
import { useDb } from '@/stores/db'
import { perRun, byPerson, plainStore } from '@mh/core-ui/dash/data.js'
import { visibleUserIds, isAdmin, isSupervisor, downline } from './access'
import { myPendingApprovals, approve, reject } from './approvals'
import { STAGE_ROUTE, LIMITS, CALL_OUTCOMES, AUM_BANDS } from '@/data/masters'
import { remDays, addMonths, clientName, fullName } from './lifecycle'
import { investmentSignals } from './investorSignals'
import { DEF } from '@/data/dashboardDefinitions'
import * as R from '@mh/core-ui/dash/rules.js'
import * as C from '@mh/core-ui/dash/cards.js'
import { teamOf } from '@mh/core-ui/dash/admin.js'
import { weekHeat } from '@mh/core-ui/dash/cards.js'
import { inrShort, fmtTalk } from '@mh/core-ui/format.js'
import { adminOperations } from './dashboardAdmin'

// While the dashboard is worked out it reads the plain data (fast with thousands of records); see core-ui dash/data.js
const { db, run } = plainStore(useDb)
export { db as dashDb }
const { DAY, inP, isConnected, fig, pct, change } = R
const ids = (l) => l.map((x) => x.id)
const uniq = (l) => [...new Set(l)]
const sum = (l, f) => l.reduce((t, x) => t + (Number(f(x)) || 0), 0)
const lakh = (v) => Math.round((v / 1e5) * 10) / 10
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`

// ---------------------------------------------------------------- scope (same picker as Prospect DMS)
// Everyone / My team, Me, the teams (Alpha, Beta ...) and the people in view; several teams, or several people, can be
// chosen to compare them. Values: '' · 'user:<id>' / 'users:<id>,<id>' · 'team:<name>' / 'teams:<name>,<name>'
const teamName = (id) => teamOf((x) => db().userById(x), id)
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu']
const byTeamOrder = (a, b) => ((GREEK.indexOf(a) + 1 || 99) - (GREEK.indexOf(b) + 1 || 99)) || a.localeCompare(b)
export function parseScope(sel) {
  const m = String(sel || '').match(/^(users?|teams?):(.+)$/)
  return m ? { kind: m[1].startsWith('user') ? 'users' : 'teams', list: m[2].split(',').filter(Boolean) } : { kind: 'all', list: [] }
}
function teamMembers(t) {
  const s = db()
  if (s.userById(t)) return [t, ...downline(t)]
  return s.users.filter((u) => u.active !== false && u.role !== 'Admin' && teamName(u.id) === t).map((u) => u.id)
}
export function scopeUsers(sel) {
  const vis = visibleUserIds(); const { kind, list } = parseScope(sel)
  if (kind === 'users') return list.filter((id) => vis.includes(id))
  if (kind === 'teams') return uniq(list.flatMap(teamMembers)).filter((id) => vis.includes(id))
  return vis
}
export function scopeOptions() {
  const s = db(); const vis = visibleUserIds(); const me = s.me
  const people = s.users.filter((u) => vis.includes(u.id) && u.role !== 'Admin' && u.active !== false && u.id !== me?.id).sort((a, b) => a.name.localeCompare(b.name))
  const teamNames = isAdmin() || ['VP', 'President'].includes(me?.role) ? uniq(people.map((u) => teamName(u.id))).filter((t) => t !== 'Management').sort(byTeamOrder) : []
  const teams = teamNames.map((t) => ({ kind: 'team', key: t, label: t, sub: `${people.filter((u) => u.role === 'IS' && teamName(u.id) === t).length} IS` }))
  const persons = people.map((u) => ({ kind: 'user', key: u.id, label: u.name, sub: u.mhf_id }))
  const top = isAdmin() ? [{ kind: 'all', key: '', label: 'Everyone' }] : [{ kind: 'all', key: '', label: 'My team (all)' }, { kind: 'user', key: me.id, label: 'Me', sub: me.mhf_id, me: true }]
  return [...top, ...teams, ...persons]
}
export const showScope = () => isAdmin() || isSupervisor()

// ---------------------------------------------------------------- drill-down
const dCalls = (l, t) => R.drill('/call-logs', 'Call Logs', l, t)
const dEvents = (l, t) => R.drill('/events', 'Events', l, t)
const dTasks = (l, t) => R.drill('/tasks', 'Tasks', l, t)
const dDeals = (l, t) => R.drill('/deals', 'Deals', l, t)
/** Investors can sit in Investors, Unassigned Investors or Junk (the last two Admin only): one link per list. */
export function dClients(list, l) {
  const by = {}; let hidden = 0; let elsewhere = 0; const vis = isAdmin() ? null : visibleUserIds()
  for (const id of new Set(list)) {
    const c = db().clientById(id); const st = c?.stage; if (!st || !STAGE_ROUTE[st]) continue
    if (st !== 'Investor' && vis) { hidden++; continue }
    if (vis && !vis.includes(c.assignedTo)) { elsewhere++; continue }
    ;(by[st] ||= []).push(id)
  }
  const order = ['Investor', 'Unassigned', 'Junk']
  const links = Object.entries(by).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([st, x]) => ({ label: st === 'Investor' ? 'Investors' : st === 'Unassigned' ? 'Unassigned Investors' : st, count: x.length, to: R.listTo(STAGE_ROUTE[st], x, l) }))
  if (hidden) links.push({ label: 'Now in Unassigned or Junk', count: hidden, to: null, hint: 'Only Admin can open the Unassigned Investors and Junk lists.' })
  if (elsewhere) links.push({ label: 'Now with someone outside your view', count: elsewhere, to: null, hint: 'These investors now belong to someone you do not supervise.' })
  return links
}

// ---------------------------------------------------------------- facts (lookups built once per run)
const callsBy = perRun(() => byPerson(db().calls, (x) => x.madeBy))
const clientsBy = perRun(() => byPerson(db().clients, (x) => x.assignedTo))
const dealsBy = perRun(() => byPerson(db().deals, (d) => db().clientById(d.clientId)?.assignedTo))
const lastCallOf = perRun(() => { const m = new Map(); for (const x of db().calls) if (!(m.get(x.clientId) >= x.at)) m.set(x.clientId, x.at); return m })
const lastOutboundTo = perRun(() => { const m = new Map(); for (const x of db().calls) if (x.direction === 'Outbound' && !(m.get(x.mobile) >= x.at)) m.set(x.mobile, x.at); return m })
const fuBy = perRun(() => byPerson(db().events.filter((e) => !e.cancelled && e.type === 'Call Follow-up' && e.clientId), (e) => [e.createdBy, ...(e.attendees || []), db().clientById(e.clientId)?.assignedTo]))
const callsIn = (p, users) => callsBy()(users).filter((c) => inP(c.at, p))
const bookOf = (users) => clientsBy()(users).filter((c) => c.stage === 'Investor')
const dealsOf = (users) => dealsBy()(users)
const calledSince = (clientId, t) => (lastCallOf().get(clientId) ?? -Infinity) >= t
const openTask = (t) => !['Completed', 'Rejected', 'Expired'].includes(t.status)
const DECIDED = ['Completed', 'Rejected', 'Expired']
const won = (l) => l.filter((d) => d.status === 'Completed')
const decided = (l) => l.filter((d) => DECIDED.includes(d.status))
const closedAmount = (l) => sum(won(l), (d) => d.finalAmount)
const plannedAmount = (l) => sum(l, (d) => d.total)

/** Moves to Unassigned: the date from the record history; the reason from the investor's status (worked out once
 *  per run and period - the team table asks for it per person). */
const unassignedMemo = perRun(() => new Map())
function toUnassigned(p) {
  const key = `${p.from}|${p.to}`; const memo = unassignedMemo()
  if (!memo.has(key)) memo.set(key, toUnassignedOf(p))
  return memo.get(key)
}
function toUnassignedOf(p) {
  const s = db()
  return s.activities.filter((a) => a.type === 'stage' && inP(a.at, p) && /^Moved to Unassigned Investors/.test(a.text)).map((a) => {
    const c = s.clientById(a.clientId)
    return { clientId: a.clientId, at: a.at, owner: c?.prevOwner || null, reason: c?.invStatus === 'Prospect' ? '90' : c?.reassignedUntil ? '12m' : '18m' }
  })
}
/** The days (or, for one day, the hours) of the period up to now: the x-axis of the trends. */
function buckets(p) {
  if (p.to - p.from <= DAY) { const out = []; for (let h = 0; h < 24; h++) out.push({ from: p.from + h * 3600000, to: p.from + (h + 1) * 3600000, label: hourLabel(h) }); return out.filter((b) => b.from <= Date.now()) }
  const out = []
  for (let t = p.from; t < Math.min(p.to, R.startOfDay() + DAY); t += DAY) {
    const d = new Date(t); const full = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`
    out.push({ from: t, to: t + DAY, label: !out.length || d.getDate() === 1 ? full : String(d.getDate()), title: full })
  }
  return out
}
const inB = (b, t) => t >= b.from && t < b.to

// ---------------------------------------------------------------- requests (top bar; same as Prospect DMS)
const person = (u) => (u ? { name: u.name, code: u.mhf_id || '' } : { name: '—', code: '' })
const dayLabel = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
function whatChanges(x, c) {
  if (x.category === 'Group Member' && x.payload?.op === 'add') return [`Add ${fullName(x.payload.member)}${x.payload.member?.relationship ? ` as ${x.payload.member.relationship}` : ''}`]
  if (x.category === 'Group Member') return [`Remove ${(x.payload?.memberKeys || []).map((k) => fullName(c?.members.find((m) => m.key === k) || {})).filter(Boolean).join(', ') || 'members'} from the group`]
  return (x.changes || []).map((ch) => {
    const who = ch.memberName && c && ch.memberName !== clientName(c) ? `${ch.memberName} · ` : ''
    if (ch.kind === 'add') return `${who}${ch.label}: add ${ch.new}`
    if (ch.kind === 'delete') return `${who}${ch.label}: remove ${ch.old}`
    return `${who}${ch.label}: ${ch.old || '(empty)'} → ${ch.new || '(empty)'}`
  })
}
function requests() {
  const s = db(); const now = Date.now()
  if (!(isSupervisor() || isAdmin())) return null
  const byId = new Map()
  const row = (x) => {
    byId.set(x.id, x)
    const c = x.clientId && s.clientById(x.clientId)
    return {
      id: x.id, label: c ? clientName(c) : x.category, type: (x.categories || [x.category]).join(', '), lines: whatChanges(x, c),
      by: { ...person(s.userById(x.requestedBy)), on: dayLabel(x.requestedOn) },
      approved: (x.chain || []).filter((st) => st.state === 'Approved' || st.state === 'Skipped').map((st) => ({ ...person(s.userById(st.userId)), on: dayLabel(st.at), skipped: st.state === 'Skipped', edited: !!st.edited })),
      days: Math.floor((now - R.reachedCurrentLevelAt(x)) / DAY), tone: R.approvalTone(x),
      to: { path: `/record/${x.clientId}`, query: { tab: 'data', approval: x.id } },
    }
  }
  const waiting = myPendingApprovals().map(row).sort((a, b) => b.days - a.days)
  function decide(id, action) {
    const x = byId.get(id)
    try {
      if (action === 'approve') { approve(x); return { ok: true, message: x.status === 'Approved' ? 'Approved – change applied' : 'Approved – sent to the next level' } }
      reject(x); return { ok: true, message: 'Rejected – the requester is told' }
    } catch (e) { return { ok: false, message: e.message } }
  }
  return { waiting, decide }
}

// ---------------------------------------------------------------- overview: headline cards + trend + to-do
// Product owner, 27 Nov 2026: money invested and AUM are shown on the Transaction Platform, not here. The headline
// cards are the work done in this website: deals (closed = marked Completed, with their final amount), the pipeline
// and calling.
function overview(p, prev, users) {
  const now = Date.now(); const bs = buckets(p); const per = p.to - p.from <= DAY ? 'by hour' : 'per day'
  const deals = dealsOf(users); const dp = deals.filter((d) => inP(d.start, p)); const dpp = deals.filter((d) => inP(d.start, prev))
  const ahead = deals.filter((d) => d.status === 'Scheduled' && (d.end || d.start) >= now)
  const c = callsIn(p, users); const cp = callsIn(prev, users); const conn = c.filter(isConnected)
  const cr = pct(conn.length, c.length); const crP = pct(cp.filter(isConnected).length, cp.length)
  const talk = R.talkTime(c); const talkP = R.talkTime(cp)
  const personDays = new Set(c.map((x) => `${x.madeBy}|${R.startOfDay(x.at)}`)).size
  const talkSub = !personDays ? 'No call yet' : users.length > 1 ? `${fmtTalk(talk / personDays)} per IS a day` : `${fmtTalk(talk / personDays)} a day`
  const dayCalls = (b) => c.filter((x) => inB(b, x.at))
  const rate = (l) => pct(won(l).length, decided(l).length)
  const col = (b, i, segs) => ({ key: i, label: b.label, title: b.title || b.label, partial: inB(b, now), segments: segs })
  // the next 30 days, for the pipeline
  const days30 = Array.from({ length: 30 }, (_, i) => { const t = R.startOfDay() + i * DAY; const d = new Date(t); const full = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`; return { from: t, to: t + DAY, label: !i || d.getDate() === 1 ? full : String(d.getDate()), title: full } })
  const trend = {
    won: { title: `Deals closed ${per} (₹ lakh)`, unit: ' L', columns: bs.map((b, i) => { const l = won(dp).filter((d) => inB(b, d.start))
      return col(b, i, [{ key: 'v', tone: 'blue', ...fig('Closed', ids(l), dDeals, { value: lakh(closedAmount(l)), listCount: l.length, drillLabel: `${b.title || b.label}: deals closed` }) }]) }) },
    winRate: { title: `Deal win rate ${per}`, unit: '%', columns: bs.map((b, i) => { const l = decided(dp).filter((d) => inB(b, d.start))
      return col(b, i, [{ key: 'v', tone: 'blue', ...fig('Win rate', ids(l), dDeals, { value: rate(l) || 0, listCount: l.length, drillLabel: `${b.title || b.label}: deals decided` }) }]) }) },
    pipeline: { title: 'Pipeline: deals planned for the next 30 days (₹ lakh)', unit: ' L', columns: days30.map((b, i) => { const l = ahead.filter((d) => inB(b, d.start))
      return { key: i, label: b.label, title: b.title, segments: [{ key: 'v', tone: 'faint', ...fig('Planned', ids(l), dDeals, { value: lakh(plannedAmount(l)), listCount: l.length, drillLabel: `${b.title}: deals planned` }) }] } }) },
    calls: { title: `Calls ${per}`, legend: [{ label: 'Connected', tone: 'dark' }, { label: 'Not connected', tone: 'light' }], columns: bs.map((b, i) => { const l = c.filter((x) => inB(b, x.at)); return col(b, i, [
      { key: 'c', tone: 'dark', ...fig('Connected', ids(l.filter(isConnected)), dCalls, { drillLabel: `${b.title || b.label}: connected calls` }) },
      { key: 'n', tone: 'light', ...fig('Not connected', ids(l.filter((x) => !isConnected(x))), dCalls, { drillLabel: `${b.title || b.label}: calls not connected` }) }]) }) },
    rate: { title: `Connect rate ${per}`, unit: '%', columns: bs.map((b, i) => { const l = dayCalls(b); const r = pct(l.filter(isConnected).length, l.length)
      return col(b, i, [{ key: 'r', label: 'Connect rate', tone: 'blue', value: r || 0, listCount: l.length, drill: dCalls(ids(l), `${b.title || b.label}: all calls`) }]) }) },
    talk: { title: `Talk time ${per} (minutes)`, columns: bs.map((b, i) => { const l = dayCalls(b)
      return col(b, i, [{ key: 't', label: 'Minutes', tone: 'blue', value: Math.round(R.talkTime(l) / 60), listCount: l.length, drill: dCalls(ids(l), `${b.title || b.label}: all calls`) }]) }) },
  }
  const items = [
    { key: 'won', icon: 'lucide-badge-indian-rupee', label: 'Deals closed', value: closedAmount(dp), fmt: 'money', delta: change(closedAmount(dp), closedAmount(dpp)),
      sub: won(dp).length ? `${won(dp).length} deals · ${pct(closedAmount(dp), plannedAmount(won(dp))) ?? 0}% of planned` : 'No deal closed yet',
      spark: bs.map((b) => closedAmount(dp.filter((d) => inB(b, d.start)))), listCount: won(dp).length, drill: dDeals(ids(won(dp)), 'Deals closed') },
    { key: 'winRate', icon: 'lucide-target', label: 'Deal win rate', value: rate(dp), fmt: 'pct', delta: change(rate(dp), rate(dpp)), sub: `${won(dp).length} of ${decided(dp).length} decided`,
      spark: bs.map((b) => rate(dp.filter((d) => inB(b, d.start)))), drill: dDeals(ids(decided(dp)), 'Deals decided') },
    { key: 'pipeline', icon: 'lucide-calendar-clock', label: 'Pipeline (planned)', value: plannedAmount(ahead), fmt: 'money', sub: `${ahead.length} deal${ahead.length === 1 ? '' : 's'} ahead · not certain`,
      spark: days30.map((b) => plannedAmount(ahead.filter((d) => inB(b, d.start)))), listCount: ahead.length, drill: dDeals(ids(ahead), 'Deals ahead') },
    { key: 'calls', icon: 'lucide-phone', label: 'Calls', value: c.length, delta: change(c.length, cp.length), sub: `${conn.length} connected`, spark: bs.map((b) => dayCalls(b).length), listCount: c.length, drill: dCalls(ids(c), 'Calls') },
    { key: 'rate', icon: 'lucide-signal', label: 'Connect rate', value: cr, fmt: 'pct', tone: R.connectTone(cr), delta: change(cr, crP), sub: `${conn.length} of ${c.length} calls`, spark: bs.map((b) => { const d = dayCalls(b); return d.length ? Math.round((d.filter(isConnected).length / d.length) * 100) : null }), drill: dCalls(ids(c), 'All calls') },
    { key: 'talk', icon: 'lucide-timer', label: 'Talk time', value: talk, fmt: 'time', delta: change(talk, talkP), sub: talkSub, spark: bs.map((b) => R.talkTime(dayCalls(b)) / 60), drill: dCalls(ids(conn), 'Connected calls (talk time)') },
  ].map((it) => ({ ...it, trend: { ...trend[it.key], info: DEF.trend, per: p.to - p.from <= DAY ? 'hour' : 'day' } }))
  return { key: 'overview', kind: 'overview', items, side: todo(users) }
}

/** Today's to-do list (live; not tied to the period). */
function todo(users) {
  const s = db(); const now = Date.now(); const d0 = R.startOfDay()
  const book = bookOf(users); const deals = dealsOf(users)
  const fu = fuBy()(users)
  const notBack = s.calls.filter((x) => x.direction === 'Inbound' && !isConnected(x) && users.includes(x.madeBy) && x.at > now - 14 * DAY && !((lastOutboundTo().get(x.mobile) ?? -Infinity) > x.at))
  const tasks = s.tasks.filter((t) => users.includes(t.assignedTo) && openTask(t))
  const pending = s.pendingLog && s.pendingLog.madeBy === s.sessionUserId && users.includes(s.sessionUserId) ? s.pendingLog : null
  const running = book.filter((c) => c.invStatus === 'Prospect' && remDays(c) <= R.TIMER_AMBER_DAYS)
  const near = book.filter((c) => c.invStatus === 'Inactive' && remDays(c) <= R.TIMER_AMBER_DAYS)
  const toUpdate = deals.filter((d) => d.status === 'Scheduled' && (d.end || d.start) < now)
  const a = (key, icon, label, hint, list, open, extra = {}) => ({ key, icon, hint, ...fig(label, list, open, extra) })
  const items = [
    a('dealsToday', 'lucide-handshake', 'Deals today', 'Investment meetings planned for today', ids(deals.filter((d) => d.status === 'Scheduled' && d.start >= d0 && d.start < d0 + DAY)), dDeals),
    a('fuToday', 'lucide-calendar-clock', 'Follow-ups due today', 'Calls promised for today', ids(fu.filter((e) => e.start >= d0 && e.start < d0 + DAY)), dEvents),
    a('fuOverdue', 'lucide-phone-missed', 'Follow-ups overdue', 'Time passed, no call since', ids(fu.filter((e) => e.start < now && e.start > now - 60 * DAY && !calledSince(e.clientId, e.start))), dEvents),
    a('running', 'lucide-hourglass', 'Prospect Investors running out', '7 days or less left to invest', ids(running), dClients, { tone: running.length ? 'amber' : null }),
    a('near', 'lucide-user-x', 'About to go to Unassigned', 'Inactive, 7 days or less left', ids(near), dClients, { tone: near.length ? 'amber' : null }),
    a('missed', 'lucide-phone-incoming', 'Missed calls to return', 'They called in the last 14 days', ids(notBack), dCalls),
    a('tasks', 'lucide-list-todo', 'Tasks due or overdue', 'Due today, or past due (last 60 days)', ids(tasks.filter((t) => t.due && t.due < d0 + DAY && t.due > now - 60 * DAY)), dTasks),
  ]
  if (pending) items.unshift({ key: 'unsaved', icon: 'lucide-file-warning', label: 'Call log not saved', hint: 'Save the log of your last call', value: 1, drill: pending.clientId ? [{ label: 'Record', count: 1, to: { path: `/record/${pending.clientId}` } }] : null })
  const n = items.filter((x) => x.value).length
  return { key: 'actions', title: 'Focus today', icon: 'lucide-list-checks', sub: n ? `${n} thing${n === 1 ? '' : 's'} to act on` : 'Nothing waiting', kind: 'actions', info: DEF.today, items }
}

// ---------------------------------------------------------------- Deals (period, by meeting date) and the pipeline
function dealsSection(p, users) {
  const now = Date.now(); const all = dealsOf(users); const d = all.filter((x) => inP(x.start, p))
  const ahead = all.filter((x) => x.status === 'Scheduled' && (x.end || x.start) >= now)
  const w = won(d); const planned = plannedAmount(w); const closed = closedAmount(d)
  const outcome = [['Closed', w, 'Closed', 'good'], ['Rejected', d.filter((x) => x.status === 'Rejected'), 'Not interested (rejected)', 'crit'], ['Expired', d.filter((x) => x.status === 'Expired'), 'Passed without update (expired)', 'warn'], ['Scheduled', d.filter((x) => x.status === 'Scheduled'), 'Scheduled', 'gray']]
  const dec = decided(d)
  // the pipeline by when the meeting is
  const d0 = R.startOfDay(); const wk = new Date(d0).getDay(); const weekEnd = d0 + ((7 - wk) % 7 || 7) * DAY
  const slots = [['This week', (x) => x.start < weekEnd], ['Next week', (x) => x.start >= weekEnd && x.start < weekEnd + 7 * DAY], ['Within 30 days', (x) => x.start >= weekEnd + 7 * DAY && x.start < d0 + 30 * DAY], ['Later', (x) => x.start >= d0 + 30 * DAY]]
  const money = (l) => plannedAmount(l)
  const byProduct = {}
  for (const x of d) for (const r of x.rows || []) { const k = r.product || 'Other'; (byProduct[k] ||= { ids: new Set(), amount: 0 }); byProduct[k].ids.add(x.id); byProduct[k].amount += Number(r.amount) || 0 }
  const productTotal = Object.values(byProduct).reduce((t, x) => t + x.amount, 0)
  return { key: 'deals', title: 'Deals', icon: 'lucide-handshake', sub: 'Plans to invest: the amount is certain only once the investor invests', cards: [
    { key: 'dealPath', title: 'From meeting to closed deal', icon: 'lucide-route', sub: 'Deals whose meeting fell in this period · click a step to open its deals', kind: 'steps', ratios: false, wide: true, info: DEF.dealOutcomes, items: [
      { key: 'all', label: 'Deals in the period', unit: 'deals', value: d.length, listCount: d.length, drill: dDeals(ids(d), 'Deals in the period'), sub: `${inrShort(plannedAmount(d))} planned` },
      { key: 'decided', label: 'Decided', unit: 'deals', value: dec.length, listCount: dec.length, drill: dDeals(ids(dec), 'Deals decided'), sub: 'closed, rejected or expired' },
      { key: 'closed', label: 'Closed', unit: 'deals', value: w.length, listCount: w.length, drill: dDeals(ids(w), 'Deals closed'), sub: 'marked Completed' },
      { key: 'amount', label: 'Closed amount', value: closed, fmt: 'money', listCount: w.length, drill: dDeals(ids(w), 'Deals closed'), sub: `${pct(closed, planned) ?? 0}% of what was planned` },
      { key: 'avg', label: 'Average deal closed', value: w.length ? Math.round(closed / w.length) : null, fmt: 'money', listCount: w.length, drill: dDeals(ids(w), 'Deals closed'), sub: `${w.length} deal${w.length === 1 ? '' : 's'}` },
    ] },
    { key: 'dealOutcomes', title: 'How deals ended', kind: 'donut', caption: 'deals', info: DEF.dealOutcomes, empty: 'No deal in this period.', items: outcome.filter(([, l]) => l.length).map(([label, l, full, tone]) => ({ ...fig(label, ids(l), dDeals, { drillLabel: `Deals: ${full}` }), key: full, tone })) },
    { key: 'pipelineAhead', title: 'Pipeline ahead', badge: 'Now', kind: 'bars', info: DEF.pipelineAhead, empty: 'No deal planned.', items: slots.map(([label, f], i) => { const l = ahead.filter(f)
      return { key: i, ...fig(label, ids(l), dDeals, { value: money(l), fmt: 'money', listCount: l.length, drillLabel: `Deals ahead: ${label}` }), note: `${l.length} deal${l.length === 1 ? '' : 's'}` } }) },
    { key: 'dealProducts', title: 'Deals by product', sub: 'Planned amount in the period', kind: 'bars', scroll: true, info: DEF.dealProducts, empty: 'No deal in this period.',
      items: Object.entries(byProduct).sort((a, b) => b[1].amount - a[1].amount).map(([k, x]) => ({ key: k, ...fig(k, [...x.ids], dDeals, { value: x.amount, fmt: 'money', listCount: x.ids.size, drillLabel: `Deals: ${k}` }), note: `${Math.round((x.amount / (productTotal || 1)) * 100)}%` })) },
  ] }
}

// ---------------------------------------------------------------- Book (now)
function bookSection(users) {
  const now = Date.now(); const book = bookOf(users).map((c) => ({ c, sig: investmentSignals(c) }))
  const status = [['Active', 'Active'], ['Inactive', 'Inactive'], ['Prospect', 'Prospect Investor']].map(([k, label]) => [label, book.filter((x) => x.c.invStatus === k).map((x) => x.c.id)])
  const soonInactive = book.filter((x) => x.c.invStatus === 'Active' && x.c.lastInvDate && addMonths(x.c.lastInvDate, LIMITS.ACTIVE_MONTHS) - now <= 30 * DAY).map((x) => x.c.id)
  const prospectEnding = book.filter((x) => x.c.invStatus === 'Prospect' && remDays(x.c) <= 30).map((x) => x.c.id)
  const notCalled = book.filter((x) => !x.c.lastCallAt || now - x.c.lastCallAt > 60 * DAY).map((x) => x.c.id)
  return { key: 'book', title: 'Book of investors', icon: 'lucide-briefcase', badge: 'Now', cards: [
    { key: 'status', title: 'Investors by status', kind: 'donut', caption: 'investors', info: DEF.status, empty: 'No investor.', items: status.filter(([, l]) => l.length).map(([label, l], i) => ({ key: i, tone: { Active: 'dark', 'Prospect Investor': 'mid', Inactive: 'gray' }[label], ...fig(label, l, dClients, { drillLabel: `Investors: ${label}` }) })) },
    { key: 'bands', title: 'AUM bands', kind: 'bars', info: DEF.bands, items: AUM_BANDS.map(([label, a, z], i) => { const l = book.filter((x) => x.sig.aum > 0 && x.sig.aum >= a && x.sig.aum < z)
      return { key: i, ...fig(label, l.map((x) => x.c.id), dClients, { drillLabel: `AUM ${label}` }), note: l.length ? inrShort(sum(l, (x) => x.sig.aum)) : '' } }) },
    { key: 'atRisk', title: 'Needs a call soon', kind: 'figures', cols: 1, info: DEF.atRisk, items: [
      fig('Turning Inactive within 30 days', soonInactive, dClients, { key: 'inactive', icon: 'lucide-trending-down', tone: soonInactive.length ? 'amber' : null, drillLabel: 'Turning Inactive within 30 days' }),
      fig('Prospect Investors: 30 days or less left', prospectEnding, dClients, { key: 'prospect', icon: 'lucide-timer', tone: prospectEnding.length ? 'amber' : null, drillLabel: 'Prospect Investors running out' }),
      fig('Not called in 60 days', notCalled, dClients, { key: 'notCalled', icon: 'lucide-phone-off', drillLabel: 'Not called in 60 days' }),
    ] },
  ] }
}

// ---------------------------------------------------------------- Calling (period)
// Design review 27 Nov 2026: when investors pick up (weekday × hour), the connect rate against its 75% target, calls by
// hour of the day, and how calls ended as ranked bars.
const heatMemo = perRun(() => new Map())
function heatOf(p, users) {
  const key = `${p.from}|${p.to}|${users.join(',')}`; const memo = heatMemo()
  if (!memo.has(key)) memo.set(key, weekHeat(callsIn(p, users), { isConnected, label: hourLabel, open: (l, t) => dCalls(ids(l), `${t}: calls`) }))
  return memo.get(key)
}
function calling(p, users) {
  const c = callsIn(p, users); const conn = c.filter(isConnected)
  const ended = [...CALL_OUTCOMES.Investor.map((o) => [o, ids(conn.filter((x) => x.subStatus === o))]), ['Not connected', ids(c.filter((x) => !isConnected(x)))]].filter(([, l]) => l.length).sort((a, b) => b[1].length - a[1].length)
  const heat = heatOf(p, users)
  const byHour = Array.from({ length: 24 }, () => []); for (const x of c) byHour[new Date(x.at).getHours()].push(x)
  const hours = heat.cols.map(({ h, label }) => { const l = byHour[h]; return { key: h, label, title: label, segments: [
    { key: 'c', tone: 'dark', ...fig('Connected', ids(l.filter(isConnected)), dCalls, { drillLabel: `${label}: connected calls` }) },
    { key: 'n', tone: 'light', ...fig('Not connected', ids(l.filter((x) => !isConnected(x))), dCalls, { drillLabel: `${label}: calls not connected` }) },
  ] } })
  return { key: 'calling', title: 'Calling', icon: 'lucide-phone', cards: [
    { key: 'heat', title: 'When investors pick up', sub: 'Each weekday and hour of the period', kind: 'heatmap', span2: true, info: DEF.heat, ...heat },
    { key: 'connectGauge', title: 'Connect rate', kind: 'gauge', info: DEF.gauge, value: pct(conn.length, c.length), target: R.CONNECT_GREEN_AT, label: `${conn.length.toLocaleString('en-IN')} of ${c.length.toLocaleString('en-IN')} calls connected`, listCount: c.length, drill: dCalls(ids(c), 'All calls') },
    { key: 'byHour', title: 'Calls by hour of the day', kind: 'columns', span2: true, info: DEF.byHour, legend: [{ label: 'Connected', tone: 'dark' }, { label: 'Not connected', tone: 'light' }], columns: hours, height: 200 },
    { key: 'outcomes', title: 'How calls ended', kind: 'bars', info: DEF.outcomes, empty: 'No calls in this period.', items: ended.map(([label, l], i) => ({ key: i, ...fig(label, l, dCalls, { drillLabel: `Calls: ${label}` }), note: `${Math.round((l.length / Math.max(1, c.length)) * 100)}%` })) },
  ] }
}

// ---------------------------------------------------------------- Highlights: what the numbers say, in a sentence each
function highlights(p, prev, users) {
  const out = []; const now = Date.now()
  const fu = fuBy()(users).filter((e) => e.start < now && e.start > now - 60 * DAY && !calledSince(e.clientId, e.start))
  if (fu.length) out.push({ key: 'overdue', icon: 'lucide-phone-missed', tone: 'warn', title: `${fu.length} follow-up${fu.length === 1 ? '' : 's'} overdue`, text: 'Promised calls to investors not made yet', drill: dEvents(ids(fu), 'Follow-ups overdue') })
  const upd = dealsOf(users).filter((d) => d.status === 'Scheduled' && (d.end || d.start) < now)
  if (upd.length) out.push({ key: 'dealsUpdate', icon: 'lucide-file-clock', tone: 'warn', title: `${upd.length} deal${upd.length === 1 ? '' : 's'} to update`, text: 'The meeting has passed: mark each closed or not', drill: dDeals(ids(upd), 'Deals to update') })
  const d = dealsOf(users).filter((x) => inP(x.start, p)); const w = won(d)
  if (w.length) out.push({ key: 'won', icon: 'lucide-badge-indian-rupee', tone: 'good', title: `${inrShort(closedAmount(d))} closed`, text: `${w.length} deal${w.length === 1 ? '' : 's'} marked Completed · win rate ${pct(w.length, decided(d).length) ?? 0}%`, drill: dDeals(ids(w), 'Deals closed') })
  const best = heatOf(p, users).best
  if (best) out.push({ key: 'bestTime', icon: 'lucide-clock-3', tone: 'info', title: `Best time to call: ${best.day} ${best.hour}`, text: `${best.rate}% of ${best.calls.toLocaleString('en-IN')} calls picked up then`, drill: best.drill })
  const c = callsIn(p, users); const cp = callsIn(prev, users); const ch = change(c.length, cp.length)
  if (c.length && out.length < 4) out.push({ key: 'calls', icon: ch == null || ch >= 0 ? 'lucide-trending-up' : 'lucide-trending-down', tone: ch == null ? 'info' : ch >= 0 ? 'good' : 'bad', title: ch == null ? `${c.length.toLocaleString('en-IN')} calls made` : `Calls ${ch >= 0 ? 'up' : 'down'} ${Math.abs(ch) > 999 ? '999+' : Math.abs(ch)}%`, text: `${c.length.toLocaleString('en-IN')} calls, ${pct(c.filter(isConnected).length, c.length)}% connected · ${prev.caption}`, drill: dCalls(ids(c), 'Calls') })
  return out.slice(0, 4)
}

// ---------------------------------------------------------------- Team (TL+): who to coach, and every person
function stats(p, who) {
  const now = Date.now(); const c = callsIn(p, who); const conn = c.filter(isConnected)
  const book = bookOf(who); const deals = dealsOf(who); const d = deals.filter((x) => inP(x.start, p))
  const ahead = deals.filter((x) => x.status === 'Scheduled' && (x.end || x.start) >= now)
  const set = new Set(who)
  const cell = (l, open, label, extra = {}) => fig('', l, open, { drillLabel: label, ...extra })
  const r = pct(won(d).length, decided(d).length); const cr = pct(conn.length, c.length)
  return {
    investors: cell(ids(book), dClients, 'Investors'),
    aum: { value: sum(book, (x) => x.aum), drill: dClients(ids(book), 'Investors (AUM)') },
    calls: cell(ids(c), dCalls, 'Calls'), rate: { value: cr, tone: R.connectTone(cr), drill: dCalls(ids(conn), 'Connected calls') },
    closed: cell(ids(won(d)), dDeals, 'Deals closed'), closedAmt: { value: closedAmount(d), drill: dDeals(ids(won(d)), 'Deals closed') },
    win: { value: r, drill: dDeals(ids(decided(d)), 'Deals decided') },
    pipeline: { value: plannedAmount(ahead), drill: dDeals(ids(ahead), 'Deals ahead') },
    unassigned: cell(toUnassigned(p).filter((m) => set.has(m.owner)).map((m) => m.clientId), dClients, 'Moved to Unassigned'),
  }
}
function effortCard(p, people) {
  const points = []; let idle = 0
  for (const u of people) {
    if (u.role !== 'IS') continue
    const c = callsIn(p, [u.id])
    if (!c.length) { idle++; continue }
    const days = new Set(c.map((x) => R.startOfDay(x.at))).size
    const conn = c.filter(isConnected).length
    const d = dealsOf([u.id]).filter((x) => inP(x.start, p)); const closedAmt = closedAmount(d)
    // raw counts too, so a team's figures are pooled (its deals ÷ its working days ...), not an average of averages
    points.push({ id: u.id, name: u.name, code: u.mhf_id, team: teamName(u.id), raw: { calls: c.length, days, conn, closedAmt, won: won(d).length, decided: decided(d).length },
      x: Math.round((c.length / days) * 10) / 10,
      y: { closedAmt: Math.round(closedAmt / days), win: pct(won(d).length, decided(d).length), rate: pct(conn, c.length) } })
  }
  return { key: 'effort', title: 'Effort vs results', sub: 'Each dot is an IS', kind: 'effort', wide: true, info: DEF.effort, points, idle, teams: uniq(points.map((x) => x.team)).sort(byTeamOrder),
    x: { label: 'Calls a day' },
    ys: [{ key: 'win', label: 'Deal win rate', fmt: 'pct', num: 'won', den: 'decided' }, { key: 'rate', label: 'Connect rate', fmt: 'pct', num: 'conn', den: 'calls' }, { key: 'closedAmt', label: 'Closed amount a day', fmt: 'money', num: 'closedAmt', den: 'days' }] }
}
function team(p, users) {
  const s = db()
  const people = s.users.filter((u) => users.includes(u.id) && u.role !== 'Admin' && u.active !== false).sort((a, b) => a.name.localeCompare(b.name))
  // product owner 27 Nov 2026: no money invested; "Lost" (moved to Unassigned) for Admin only
  const G = { b: 'Book now', a: 'Calling', d: 'Deals', l: 'Lost' }
  const columns = [['investors', 'Investors', 'b'], ['aum', 'AUM', 'b', 'money'], ['calls', 'Calls', 'a'], ['rate', 'Connect rate', 'a', 'pct'], ['closed', 'Closed', 'd'], ['closedAmt', 'Closed amount', 'd', 'money'],
    ['win', 'Win rate', 'd', 'pct'], ['pipeline', 'Pipeline', 'd', 'money'], ...(isAdmin() ? [['unassigned', 'To Unassigned', 'l']] : [])]
    .map(([key, label, g, fmt]) => ({ key, label, group: G[g], fmt }))
  const open = (k) => (k === 'calls' ? dCalls : k === 'closed' ? dDeals : dClients)
  const rows = people.map((u) => ({ id: u.id, name: u.name, code: u.mhf_id, group: teamName(u.id), cells: stats(p, [u.id]) }))
  const money = ['aum', 'rate', 'win', 'pipeline', 'closedAmt']
  const total = C.totalsRow(rows.map((r) => r.cells), columns.filter((c) => !c.fmt), open)
  const all = stats(p, ids(people)); for (const k of money) total[k] = all[k]
  const teams = uniq(rows.map((r) => r.group)).sort((a, b) => (a === 'Management') - (b === 'Management') || byTeamOrder(a, b))
  const grouped = teams.length > 1
  const groupTotals = grouped ? Object.fromEntries(teams.map((t) => {
    const l = rows.filter((r) => r.group === t); const tot = C.totalsRow(l.map((r) => r.cells), columns.filter((c) => !c.fmt), open)
    const st = stats(p, l.map((r) => r.id)); for (const k of money) tot[k] = st[k]
    return [t, tot]
  })) : null
  const orderedRows = grouped ? teams.flatMap((t) => rows.filter((r) => r.group === t)) : rows
  return { key: 'team', title: 'Team', icon: 'lucide-users', badge: 'TL+', sub: 'Click a person to see their dashboard.', cards: [
    effortCard(p, people),
    { key: 'people', title: 'People', kind: 'table', wide: true, searchable: true, grouped, groupTotals, info: DEF.people, columns, rows: orderedRows, total },
  ] }
}

// ---------------------------------------------------------------- Compare (several teams, or several people)
const CMP_ALL = [
  { key: 'closedAmt', label: 'Deals closed', fmt: 'money', line: true, hint: 'final amount' },
  { key: 'closed', label: 'Deals closed (number)', fmt: 'n', line: true },
  { key: 'win', label: 'Deal win rate', fmt: 'pct', rate: true },
  { key: 'pipeline', label: 'Pipeline (planned)', fmt: 'money', hint: 'deals ahead, now' },
  { key: 'calls', label: 'Calls', fmt: 'n', line: true },
  { key: 'rate', label: 'Connect rate', fmt: 'pct', line: true, rate: true },
  { key: 'talk', label: 'Talk time', fmt: 'time', line: true, lineUnit: 'min' },
  { key: 'unassigned', label: 'Moved to Unassigned', fmt: 'n', lowerBetter: true, admin: true },
]
const cmp = () => CMP_ALL.filter((m) => !m.admin || isAdmin())
function numbersOf(p, bs, who) {
  const now = Date.now(); const c = callsIn(p, who); const conn = c.filter(isConnected); const set = new Set(who)
  const deals = dealsOf(who); const d = deals.filter((x) => inP(x.start, p))
  const total = {
    closedAmt: closedAmount(d), closed: won(d).length, win: pct(won(d).length, decided(d).length),
    pipeline: plannedAmount(deals.filter((x) => x.status === 'Scheduled' && (x.end || x.start) >= now)), calls: c.length, rate: pct(conn.length, c.length), talk: R.talkTime(c),
    unassigned: toUnassigned(p).filter((m) => set.has(m.owner)).length,
  }
  const at = (l, b, f = (x) => x.at) => l.filter((x) => inB(b, f(x)))
  const line = {
    closedAmt: bs.map((b) => closedAmount(at(d, b, (x) => x.start))), closed: bs.map((b) => won(at(d, b, (x) => x.start)).length),
    calls: bs.map((b) => at(c, b).length), rate: bs.map((b) => { const l = at(c, b); return l.length ? pct(l.filter(isConnected).length, l.length) : null }), talk: bs.map((b) => Math.round(R.talkTime(at(c, b)) / 60)),
  }
  return { total, line }
}
/** An average of a group: its counts and amounts divided by how many (IS, or teams); rates stay as they are. */
function averageOf(n, size) {
  const d = (v) => (v == null ? null : Math.round((v / Math.max(1, size)) * 10) / 10)
  const total = {}; const line = {}
  for (const m of cmp()) total[m.key] = m.rate ? n.total[m.key] : d(n.total[m.key])
  for (const [k, l] of Object.entries(n.line)) line[k] = CMP_ALL.find((m) => m.key === k)?.rate ? l : l.map(d)
  return { total, line }
}
function compareSection(p, sel) {
  const s = db(); const vis = visibleUserIds(); const bs = buckets(p)
  const isIS = (id) => s.userById(id)?.role === 'IS'
  const entities = sel.list.map((key) => {
    if (sel.kind === 'teams') {
      const who = teamMembers(key).filter((id) => vis.includes(id)); const size = who.filter(isIS).length || who.length
      const n = numbersOf(p, bs, who)
      return { key, label: key, sub: `${size} IS`, size, total: n.total, line: n.line }
    }
    const u = s.userById(key); if (!u || !vis.includes(key)) return null
    const n = numbersOf(p, bs, [key])
    return { key, label: u.name, sub: u.mhf_id, team: teamName(key), size: 1, total: n.total, line: n.line }
  }).filter(Boolean)
  // the Money Honey average: for teams the average team, for people the average IS; people also against their team
  const allIS = s.users.filter((u) => u.role === 'IS' && u.active !== false).map((u) => u.id)
  const company = numbersOf(p, bs, allIS)
  const teamCount = uniq(allIS.map(teamName)).filter((t) => t !== 'Management').length || 1
  const mh = sel.kind === 'teams' ? averageOf(company, teamCount) : averageOf(company, allIS.length)
  const teamAvg = {}
  if (sel.kind === 'users') for (const t of uniq(entities.map((e) => e.team))) { const who = teamMembers(t).filter(isIS); teamAvg[t] = averageOf(numbersOf(p, bs, who), who.length).total }
  return { key: 'compare', kind: 'compare', title: `Comparing ${entities.length} ${sel.kind === 'teams' ? 'teams' : 'people'}`, icon: 'lucide-git-compare', info: DEF.compare,
    mode: sel.kind, metrics: cmp(), labels: bs.map((b) => b.label), titles: bs.map((b) => b.title || b.label), entities, mh, teamAvg }
}

// ---------------------------------------------------------------- links from the Prospect DMS dashboard
/** What a Prospect DMS link may ask for that has no card here (its combined dashboard shows messages, the investors
 *  held, deals planned and moves to Unassigned): the same drill-down as a card would give. Null when unknown. */
export function extraDrill(key, f) {
  return run(() => {
    const s = db(); const p = R.periodOf(f); const users = scopeUsers(f.scope); const set = new Set(users)
    const sent = (l) => ids(l.filter((m) => m.direction === 'Sent' && set.has(m.sentBy) && inP(m.at, p)))
    switch (key) {
      case 'wa': return R.drill('/whatsapp-logs', 'WhatsApp Logs', sent(s.wa || []), 'WhatsApp sent')
      case 'email': return R.drill('/email-logs', 'Email Logs', sent(s.emails || []), 'Emails sent')
      case 'investors': return dClients(ids(bookOf(users)), 'Investors')
      case 'planned': return dDeals(ids(dealsOf(users).filter((d) => d.status === 'Scheduled' && inP(d.start, p))), 'Deals still planned')
      case 'lost': return isAdmin() ? dClients(toUnassigned(p).filter((m) => set.has(m.owner)).map((m) => m.clientId), 'Moved to Unassigned') : null
      default: return null
    }
  })
}

// ---------------------------------------------------------------- the page
export function buildDashboard(f) { return run(() => build(f)) }
function build(f) {
  const p = R.periodOf(f); const prev = R.previousOf(p, f.range)
  const users = scopeUsers(f.scope)
  const tl = isSupervisor() || isAdmin()
  const sections = [overview(p, prev, users), dealsSection(p, users), bookSection(users), calling(p, users)]
  if (tl) sections.push(team(p, users))
  if (isAdmin()) sections.push(adminOperations())
  // two or more teams (or people) chosen: their comparison at the bottom (the page scrolls to it)
  const sel = parseScope(f.scope)
  if (sel.list.length > 1 && tl) sections.push(compareSection(p, sel))
  return { sections, caption: prev.caption, period: p, requests: requests(), insights: highlights(p, prev, users) }
}
