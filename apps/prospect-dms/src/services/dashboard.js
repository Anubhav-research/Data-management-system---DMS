// Prospect DMS dashboard, version 6 (product owner, 27 Nov 2026): ONE dashboard for both websites.
// Every figure adds this website's records and Investor DMS's numbers for the same people and period (flow F5, numbers
// only: dashboardInvestor.js). A click opens the records; when both websites have some, the menu asks which:
// "Prospect DMS · …" opens the list here, "Investor DMS · …" opens Investor DMS in a new tab. Investor DMS keeps its
// own dashboard with its own data only.
// Readers: IS - "how am I doing, what do I do today", in both websites; TL / VP / President - the same for their team,
// who to coach, every person, teams compared; Admin - everyone, plus Sources and what was lost.
// Layout: Requests (top bar) · headline cards (a click shows that number's trend) with Today's to-do · Pipeline (first
// call to deal) · Clients now · Calling · Messaging · Team (TL+) · Sources (Admin) · Compare (2+ ticked).
// Not shown (product owner): money invested and AUM - they belong to the Transaction Platform.
import { useDb } from '@/stores/db'
import { perRun, byPerson, plainStore } from '@mh/core-ui/dash/data.js'
import { visibleUserIds, isAdmin, isSupervisor, downline } from './access'
import { myPendingApprovals, approve, reject } from './approvals'
import { STAGE_ROUTE, LIMITS, PRODUCT_INTEREST, CALL_OUTCOMES } from '@/data/masters'
import { clientName, fullName } from './lifecycle'
import { windowOpen, replyOpen } from './calls'
import { DEF } from '@/data/dashboardDefinitions'
import * as R from '@mh/core-ui/dash/rules.js'
import { fmtTalk, inrShort } from '@mh/core-ui/format.js'
import { teamOf } from '@mh/core-ui/dash/admin.js'
import { investorFacts } from './dashboardInvestor'
import { weekHeat } from '@mh/core-ui/dash/cards.js'

// While the dashboard is worked out it reads the plain data (fast with thousands of records); see core-ui dash/data.js
const { db, run } = plainStore(useDb)
const { DAY, inP, isConnected, fig, pct, change } = R
const daysSince = (t) => (t ? Math.floor((Date.now() - t) / DAY) : Infinity)
const ids = (l) => l.map((x) => x.id)
const uniq = (l) => [...new Set(l)]
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`

// ---------------------------------------------------------------- scope
// The picker (top right): Everyone / My team, Me, the teams (Alpha, Beta ...) and the people in view. Several teams,
// or several people, can be ticked to compare them - never teams with people. Values:
//   ''  everyone in view · 'user:<id>' / 'users:<id>,<id>' people · 'team:<name>' / 'teams:<name>,<name>' teams
const teamName = (id) => teamOf((x) => db().userById(x), id)
// named teams in Greek-letter order (Alpha, Beta, Gamma ...), any other name after them A–Z
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu']
const byTeamOrder = (a, b) => ((GREEK.indexOf(a) + 1 || 99) - (GREEK.indexOf(b) + 1 || 99)) || a.localeCompare(b)
export function parseScope(sel) {
  const m = String(sel || '').match(/^(users?|teams?):(.+)$/)
  return m ? { kind: m[1].startsWith('user') ? 'users' : 'teams', list: m[2].split(',').filter(Boolean) } : { kind: 'all', list: [] }
}
/** Everyone in a team, by its name (an older saved choice may still name the team leader instead). */
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
/** The picker's choices: { kind: 'all' | 'user' | 'team', key, label, sub }. */
export function scopeOptions() {
  const s = db(); const vis = visibleUserIds(); const me = s.me
  const people = s.users.filter((u) => vis.includes(u.id) && u.role !== 'Admin' && u.active !== false && u.id !== me?.id).sort((a, b) => a.name.localeCompare(b.name))
  // teams are offered to those who see more than one (VP, President, Admin)
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
const dWa = (l, t) => R.drill('/whatsapp-logs', 'WhatsApp Logs', l, t)
const dEm = (l, t) => R.drill('/email-logs', 'Email Logs', l, t)
/** WhatsApp and email messages together: one link per log. */
const dMsgs = (wa, em, t) => [...(wa.length ? dWa(wa, t) : []), ...(em.length ? dEm(em, t) : [])]
/** Records can sit in different lists (Prospects, Leads ...): one link per list. Pool and Junk lists are Admin only;
 *  records a person may not open are named in the menu, so the total always adds up. */
export function dClients(list, l) {
  const by = {}; let hidden = 0; let elsewhere = 0; const vis = isAdmin() ? null : visibleUserIds()
  for (const id of new Set(list)) {
    const c = db().clientById(id); const st = c?.stage; if (!st || !STAGE_ROUTE[st]) continue
    if (['Pool', 'Junk'].includes(st) && vis) { hidden++; continue }
    if (vis && !vis.includes(c.assignedTo)) { elsewhere++; continue }
    ;(by[st] ||= []).push(id)
  }
  const order = ['Pool', 'Prospect', 'Lead', 'Investor Family', 'Junk']
  const links = Object.entries(by).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([st, x]) => ({ label: st === 'Prospect' ? 'Prospects' : st === 'Lead' ? 'Leads' : st, count: x.length, to: R.listTo(STAGE_ROUTE[st], x, l) }))
  if (hidden) links.push({ label: 'Now in the Pool or Junk', count: hidden, to: null, hint: 'Only Admin can open the Pool and Junk lists.' })
  if (elsewhere) links.push({ label: 'Now with someone outside your view', count: elsewhere, to: null, hint: 'These records now belong to someone you do not supervise.' })
  return links
}

// ---------------------------------------------------------------- facts
// Lookups built once per run (the team table asks for every person's figures; with real volumes - 200 people,
// thousands of calls a day - scanning every list again for each person was far too slow). Kept only for the current
// run, so they never go stale across changes; the answers are the same as the plain filters they replace.
const callsBy = perRun(() => byPerson(db().calls, (x) => x.madeBy))
const waBy = perRun(() => byPerson(db().wa, (x) => x.sentBy))
const emBy = perRun(() => byPerson(db().emails, (x) => x.sentBy))
const clientsBy = perRun(() => byPerson(db().clients, (x) => x.assignedTo))
const callsIn = (p, users) => callsBy()(users).filter((c) => inP(c.at, p))
const sentIn = (list, p, users) => (list === db().wa ? waBy()(users) : list === db().emails ? emBy()(users) : list.filter((m) => users.includes(m.sentBy))).filter((m) => m.direction === 'Sent' && inP(m.at, p))
const mineC = (users) => (c) => c && users.includes(c.assignedTo)
/** Stage moves from the record history ("moved it from Pool to Prospect", "Admin converted to Lead for ..."). */
const movesMemo = perRun(() => new Map())
export function moves(p, users = null) {
  const key = `${p.from}|${p.to}`; const memo = movesMemo()
  if (!memo.has(key)) memo.set(key, movesOf(p))
  const all = memo.get(key)
  if (!users) return all
  const who = new Set(users); return all.filter((m) => who.has(m.actor))
}
function movesOf(p) {
  return db().activities.filter((a) => a.type === 'stage' && inP(a.at, p)).map((a) => {
    const t = String(a.text)
    let m = t.match(/from (Pool|Prospect|Lead) to (Prospect|Lead)$/)
    if (m) return { clientId: a.clientId, at: a.at, actor: a.actor, from: m[1], to: m[2] }
    m = t.match(/^Admin converted to (Prospect|Lead) for (.+)$/)
    if (m) { const u = db().users.find((x) => x.name === m[2]); return { clientId: a.clientId, at: a.at, actor: u?.id || a.actor, from: 'Pool', to: m[1] } }
    return null
  }).filter(Boolean)
}
/** Back to the Pool: released by the IS, by Admin, or by a timer (730 days when the record had been out of the Pool
 *  that long, otherwise 90 days - read from the record history). */
const backMemo = perRun(() => new Map())
export function backToPool(p) {
  const key = `${p.from}|${p.to}`; const memo = backMemo()
  if (!memo.has(key)) memo.set(key, backToPoolOf(p))
  return memo.get(key)
}
function backToPoolOf(p) {
  const s = db(); const out = []
  // client id -> times it was taken out of the Pool (to tell the 730-day timer from the 90-day one)
  const takes = new Map()
  for (const x of s.activities) if (x.type === 'stage' && /from Pool to (Prospect|Lead)$|^Admin converted to/.test(x.text)) (takes.get(x.clientId) || takes.set(x.clientId, []).get(x.clientId)).push(x.at)
  for (const a of s.activities) {
    if (a.type !== 'stage' || !inP(a.at, p)) continue
    const m = String(a.text).match(/^(Release to Pool|Timer expiry|Admin release) from (Prospect|Lead|Investor Family)/)
    if (!m) continue
    let kind = m[1] === 'Release to Pool' ? 'is' : m[1] === 'Admin release' ? 'admin' : '90'
    if (kind === '90') {
      const taken = (takes.get(a.clientId) || []).filter((t) => t < a.at).reduce((t, x) => Math.max(t, x), 0)
      if (taken && a.at - taken >= LIMITS.PL_CAP_DAYS * DAY) kind = '730'
    }
    out.push({ clientId: a.clientId, at: a.at, kind, owner: kind === 'is' ? a.actor : s.clientById(a.clientId)?.prevOwner || a.actor })
  }
  return out
}
/** Individuals converted (accepted by Investor DMS) in the period, by their converting IS. */
const accepted = (p, users) => db().handovers.filter((h) => h.status === 'Delivered' && inP(h.ackAt, p) && users.includes(h.advisorId))
const fuBy = perRun(() => byPerson(db().events.filter((e) => !e.cancelled && e.type === 'Call Follow-up' && e.clientId), (e) => [e.createdBy, ...(e.attendees || []), db().clientById(e.clientId)?.assignedTo]))
const followupEvents = (users) => fuBy()(users)
/** client id -> time of its latest call */
const lastCallOf = perRun(() => { const m = new Map(); for (const x of db().calls) if (!(m.get(x.clientId) >= x.at)) m.set(x.clientId, x.at); return m })
/** mobile -> time of the latest outbound call to it */
const lastOutboundTo = perRun(() => { const m = new Map(); for (const x of db().calls) if (x.direction === 'Outbound' && !(m.get(x.mobile) >= x.at)) m.set(x.mobile, x.at); return m })
const calledSince = (clientId, t) => (lastCallOf().get(clientId) ?? -Infinity) >= t
function overdueFollowups(users) {
  const now = Date.now(); const s = db()
  return followupEvents(users).filter((e) => e.start < now && e.start > now - 60 * DAY && ['Prospect', 'Lead', 'Investor Family'].includes(s.clientById(e.clientId)?.stage) && !calledSince(e.clientId, e.start))
}
const openTask = (t) => !['Completed', 'Rejected'].includes(t.status)
/** The days (or, for one day, the hours) of the period up to now: the x-axis of the trends. */
/** (once per run and period: the labels are slow to make, and every person asks for them) */
const bucketsMemo = perRun(() => new Map())
function buckets(p) {
  const key = `${p.from}|${p.to}`; const memo = bucketsMemo()
  if (!memo.has(key)) memo.set(key, bucketsOf(p))
  return memo.get(key)
}
function bucketsOf(p) {
  if (p.to - p.from <= DAY) { const out = []; for (let h = 0; h < 24; h++) out.push({ from: p.from + h * 3600000, to: p.from + (h + 1) * 3600000, label: hourLabel(h) }); return out.filter((b) => b.from <= Date.now()) }
  const out = []
  for (let t = p.from; t < Math.min(p.to, R.startOfDay() + DAY); t += DAY) {
    const d = new Date(t); const full = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`
    out.push({ from: t, to: t + DAY, label: !out.length || d.getDate() === 1 ? full : String(d.getDate()), title: full })
  }
  return out
}
const series = (bs, list, at, val = () => 1) => bs.map((b) => list.filter((x) => at(x) >= b.from && at(x) < b.to).reduce((t, x) => t + val(x), 0))
const inB = (b, t) => t >= b.from && t < b.to
/** The records of each bucket (day or hour) of the period, sorted in one pass (charts ask for every bucket many times). */
function byBucket(bs, list, at = (x) => x.at) {
  const out = new Map(bs.map((b) => [b, []]))
  for (const x of list) { const t = at(x); const b = bs.find((y) => t >= y.from && t < y.to); if (b) out.get(b).push(x) }
  return (b) => out.get(b) || []
}

// ---------------------------------------------------------------- requests (top bar)
// Approval is step by step (IS -> TL -> VP -> P -> Admin): a request reaches a person only after everyone below them
// in the chain approved it, so the pop-up lists only what is waiting for this person, with who raised it, what it
// changes and who already approved it. They can approve or reject each one there, or approve them all at once.
const person = (u) => (u ? { name: u.name, code: u.mhf_id || '' } : { name: '—', code: '' })
const dayLabel = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
function whatChanges(x, c) {
  if (x.category === 'New Prospect') {
    const m = x.payload?.client?.members?.[0] || {}
    return [`Add ${fullName(m) || 'a new Prospect'}${m.contacts?.[0]?.mobile ? ` · ${m.contacts[0].mobile}` : ''}`]
  }
  if (x.category === 'Group Member' && x.payload?.op === 'add') return [`Add ${fullName(x.payload.member)}${x.payload.member?.relationship ? ` as ${x.payload.member.relationship}` : ''}`]
  if (x.category === 'Group Member') {
    const names = (x.payload?.memberKeys || []).map((k) => fullName(c?.members.find((m) => m.key === k) || {})).filter(Boolean)
    return [`Remove ${names.join(', ') || `${x.payload?.memberKeys?.length || 0} member(s)`} from the group`]
  }
  return (x.changes || []).map((ch) => {
    const who = ch.memberName && c && ch.memberName !== clientName(c) ? `${ch.memberName} · ` : ''
    if (ch.kind === 'add') return `${who}${ch.label}: add ${ch.new}`
    if (ch.kind === 'delete') return `${who}${ch.label}: remove ${ch.old}`
    return `${who}${ch.label}: ${ch.old || '(empty)'} → ${ch.new || '(empty)'}`
  })
}
function requests() {
  const s = db(); const now = Date.now()
  const canDecide = isSupervisor() || isAdmin()
  if (!canDecide) return null
  const byId = new Map()
  const row = (x) => {
    byId.set(x.id, x)
    const c = x.clientId && s.clientById(x.clientId)
    const label = c ? clientName(c) : x.payload?.client?.members?.[0] ? fullName(x.payload.client.members[0]) : 'New Prospect'
    return {
      id: x.id, label, type: (x.categories || [x.category]).join(', '), lines: whatChanges(x, c),
      by: { ...person(s.userById(x.requestedBy)), on: dayLabel(x.requestedOn) },
      approved: x.chain.filter((st) => st.state === 'Approved' || st.state === 'Skipped')
        .map((st) => ({ ...person(s.userById(st.userId)), on: dayLabel(st.at), skipped: st.state === 'Skipped', edited: !!st.edited })),
      days: Math.floor((now - R.reachedCurrentLevelAt(x)) / DAY), tone: R.approvalTone(x),
      to: x.category === 'New Prospect' ? { path: '/prospects', query: { review: x.id } } : { path: `/record/${x.clientId}`, query: { tab: 'data', approval: x.id } },
    }
  }
  const waiting = myPendingApprovals().map(row).sort((a, b) => b.days - a.days)
  /** Approve or reject one request here; returns { ok, message } (a rule such as the 1500 limit can stop it). */
  function decide(id, action) {
    const x = byId.get(id)
    try {
      if (action === 'approve') { approve(x); return { ok: true, message: x.status === 'Approved' ? 'Approved – change applied' : 'Approved – sent to the next level' } }
      reject(x); return { ok: true, message: 'Rejected – the requester is told' }
    } catch (e) { return { ok: false, message: e.message } }
  }
  return { waiting, decide }
}

// ---------------------------------------------------------------- the two websites together
// Product owner, 27 Nov 2026: ONE dashboard for both websites. A figure is the sum of Prospect DMS's own records (P)
// and Investor DMS's numbers (I, flow F5 - see dashboardInvestor.js). A click on it opens the records: when both
// websites have some, the "Open in" menu asks which - "Prospect DMS · Call Logs" opens the list here, "Investor DMS ·
// Call Logs" opens Investor DMS in a new tab. Colours: Prospect DMS blue, Investor DMS green.
const SITE_LEGEND = [{ label: 'Prospect DMS', tone: 'dark' }, { label: 'Investor DMS', tone: 'green' }]
const SITE_LEGEND_PI = [{ label: 'Prospect DMS', tone: 'p' }, { label: 'Investor DMS', tone: 'i' }]
/** Prospect DMS's links, named as such in the menu. */
const here = (links) => (links || []).map((l) => ({ ...l, label: `Prospect DMS · ${l.label}` }))
/** A figure's split between the websites, shown under it ("Prospect 12 · Investor 5"). */
const parts = (pv, iv, X) => (X.ok ? [{ label: 'Prospect', value: pv, tone: 'blue' }, { label: 'Investor', value: iv, tone: 'green' }] : null)
const lakh = (v) => Math.round((v / 1e5) * 10) / 10
/** Working days of a person in the period: the days they called in either website. */
function workDays(p, uid, X) {
  const bs = buckets(p); const day = p.to - p.from > DAY
  const P = new Set(callsIn(p, [uid]).map((x) => R.startOfDay(x.at)))
  const I = X.of([uid])
  if (!day) return P.size || I.t('calls') ? 1 : 0
  return bs.filter((b, i) => P.has(b.from) || I.at('calls', i)).length
}

// ---------------------------------------------------------------- overview: headline cards + trend + to-do
function overview(p, prev, users, X) {
  const now = Date.now(); const bs = buckets(p); const hourly = p.to - p.from <= DAY; const per = hourly ? 'by hour' : 'per day'
  const I = X.of(users)
  const c = callsIn(p, users); const cp = callsIn(prev, users); const conn = c.filter(isConnected)
  const calls = c.length + I.t('calls'); const callsPrev = cp.length + I.pv('calls')
  const connN = conn.length + I.t('conn'); const connPrev = cp.filter(isConnected).length + I.pv('conn')
  const rate = pct(connN, calls); const ratePrev = pct(connPrev, callsPrev)
  const talk = R.talkTime(c) + I.t('talk'); const talkPrev = R.talkTime(cp) + I.pv('talk')
  const personDays = users.reduce((t, u) => t + workDays(p, u, X), 0)
  const talkSub = !personDays ? 'No call yet' : users.length > 1 ? `${fmtTalk(talk / personDays)} per IS a day` : `${fmtTalk(talk / personDays)} a day`
  const acc = accepted(p, users); const accP = accepted(prev, users)
  const indiv = (l) => l.reduce((t, h) => t + h.memberCount, 0)
  const won = I.t('won'); const wonAmt = I.t('wonAmt')
  const col = (b, i, segs) => ({ key: i, label: b.label, title: b.title || b.label, partial: inB(b, now), segments: segs })
  const dayCalls = byBucket(bs, c)
  const day = (b) => (hourly ? undefined : X.dayOf(b)) // Investor DMS opens a day, not an hour
  const callLinks = (pIds, iN, label, b) => [...here(dCalls(pIds, label)), ...X.drill(iN, 'calls', 'Call Logs', undefined, b ? day(b) : undefined)]
  // the pipeline, by when the meeting is (the same slots as on the Investor DMS dashboard)
  const SLOTS = [['This week', 'wk'], ['Next week', 'nextWk'], ['Within 30 days', 'in30'], ['Later', 'later']]
  const trend = {
    calls: { title: `Calls ${per}`, legend: SITE_LEGEND, columns: bs.map((b, i) => { const l = dayCalls(b); return col(b, i, [
      { key: 'p', tone: 'dark', label: 'Prospect DMS', value: l.length, listCount: l.length, drill: here(dCalls(ids(l), `${b.title || b.label}: calls`)) },
      { key: 'i', tone: 'green', label: 'Investor DMS', value: I.at('calls', i), listCount: I.at('calls', i), drill: X.drill(I.at('calls', i), 'calls', 'Call Logs', undefined, day(b)) }]) }) },
    rate: { title: `Connect rate ${per}`, unit: '%', columns: bs.map((b, i) => { const l = dayCalls(b); const n = l.length + I.at('calls', i)
      return col(b, i, [{ key: 'r', label: 'Connect rate', tone: 'blue', value: pct(l.filter(isConnected).length + I.at('conn', i), n) || 0, listCount: n, drill: callLinks(ids(l), I.at('calls', i), `${b.title || b.label}: all calls`, b) }]) }) },
    talk: { title: `Talk time ${per} (minutes)`, legend: SITE_LEGEND, columns: bs.map((b, i) => { const l = dayCalls(b); return col(b, i, [
      { key: 'p', tone: 'dark', label: 'Prospect DMS', value: Math.round(R.talkTime(l) / 60), listCount: l.length, drill: here(dCalls(ids(l.filter(isConnected)), `${b.title || b.label}: connected calls`)) },
      { key: 'i', tone: 'green', label: 'Investor DMS', value: Math.round(I.at('talk', i) / 60), listCount: I.at('conn', i), drill: X.drill(I.at('conn', i), 'calls', 'Call Logs', undefined, day(b)) }]) }) },
    converted: { title: `Converted to Investor ${per} (individuals)`, columns: bs.map((b, i) => { const l = acc.filter((h) => inB(b, h.ackAt))
      return col(b, i, [{ key: 'v', tone: 'blue', ...fig('Individuals', l.map((h) => h.clientId), (x, t) => here(dClients(x, t)), { value: indiv(l), drillLabel: `${b.title || b.label}: converted` }) }]) }) },
    won: { title: `Deals closed ${per} (₹ lakh)`, unit: ' L', columns: bs.map((b, i) => col(b, i, [
      { key: 'v', tone: 'green', label: 'Closed', value: lakh(I.at('wonAmt', i)), listCount: I.at('won', i), drill: X.drill(I.at('won', i), 'won', 'Deals', undefined, day(b)) }])) },
    pipeline: { title: 'Pipeline: deals planned ahead (₹ lakh)', unit: ' L', columns: SLOTS.map(([label, k], i) => ({ key: i, label, title: label, segments: [
      { key: 'v', tone: 'green', label: 'Planned', value: lakh(I.n(`${k}Amt`)), listCount: I.n(k), drill: X.drill(I.n(k), `pipelineAhead.${label}`, 'Deals') }] })) },
  }
  const items = [
    { key: 'calls', icon: 'lucide-phone', label: 'Calls', value: calls, delta: change(calls, callsPrev), sub: `${connN.toLocaleString('en-IN')} connected`, parts: parts(c.length, I.t('calls'), X),
      spark: bs.map((b, i) => dayCalls(b).length + I.at('calls', i)), listCount: calls, drill: callLinks(ids(c), I.t('calls'), 'Calls') },
    { key: 'rate', icon: 'lucide-signal', label: 'Connect rate', value: rate, fmt: 'pct', tone: R.connectTone(rate), delta: change(rate, ratePrev), sub: `${connN.toLocaleString('en-IN')} of ${calls.toLocaleString('en-IN')} calls`,
      spark: bs.map((b, i) => { const n = dayCalls(b).length + I.at('calls', i); return n ? ((dayCalls(b).filter(isConnected).length + I.at('conn', i)) / n) * 100 : null }), drill: callLinks(ids(c), I.t('calls'), 'All calls') },
    { key: 'talk', icon: 'lucide-timer', label: 'Talk time', value: talk, fmt: 'time', delta: change(talk, talkPrev), sub: talkSub, spark: bs.map((b, i) => (R.talkTime(dayCalls(b)) + I.at('talk', i)) / 60),
      drill: [...here(dCalls(ids(conn), 'Connected calls (talk time)')), ...X.drill(I.t('conn'), 'talk', 'Call Logs')] },
    { key: 'converted', icon: 'lucide-user-check', label: 'Converted', value: indiv(acc), delta: change(indiv(acc), indiv(accP)), sub: `individuals · ${new Set(acc.map((h) => h.familyId)).size} groups`,
      spark: series(bs, acc, (x) => x.ackAt, (x) => x.memberCount), listCount: new Set(acc.map((h) => h.clientId)).size, drill: here(dClients(acc.map((h) => h.clientId), 'Converted to Investor')) },
    { key: 'won', icon: 'lucide-badge-indian-rupee', label: 'Deals closed', value: X.ok ? wonAmt : null, fmt: 'money', delta: X.ok ? change(wonAmt, I.pv('wonAmt')) : null, sub: X.ok ? `${won} deal${won === 1 ? '' : 's'} · win rate ${pct(won, I.t('decided')) ?? 0}%` : 'From Investor DMS',
      spark: bs.map((b, i) => I.at('wonAmt', i)), listCount: won, drill: X.drill(won, 'won', 'Deals closed') },
    { key: 'pipeline', icon: 'lucide-calendar-clock', label: 'Pipeline (planned)', value: X.ok ? I.n('pipelineAmt') : null, fmt: 'money', sub: X.ok ? `${I.n('pipelineN')} deals ahead · not certain` : 'From Investor DMS',
      spark: SLOTS.map(([, k]) => I.n(`${k}Amt`)), listCount: I.n('pipelineN'), drill: X.drill(I.n('pipelineN'), 'pipeline', 'Deals ahead') },
  ].map((it) => ({ ...it, trend: { ...trend[it.key], info: DEF.trend, per: hourly ? 'hour' : 'day' } }))
  return { key: 'overview', kind: 'overview', items, side: todo(users, X) }
}

/** Today's to-do list, both websites (live; not tied to the period). */
function todo(users, X) {
  const s = db(); const now = Date.now(); const d0 = R.startOfDay(); const mine = mineC(users); const I = X.of(users)
  const fu = followupEvents(users)
  const pl = s.clients.filter((c) => ['Prospect', 'Lead'].includes(c.stage) && mine(c))
  const back = ids(pl.filter((c) => LIMITS.PL_INACTIVITY_DAYS - daysSince(c.lastCallAt || c.takeoverDate) <= R.TIMER_AMBER_DAYS || LIMITS.PL_CAP_DAYS - daysSince(c.takeoverDate) <= R.TIMER_AMBER_DAYS))
  const notBack = s.calls.filter((x) => x.direction === 'Inbound' && !isConnected(x) && users.includes(x.madeBy) && x.at > now - 14 * DAY && !((lastOutboundTo().get(x.mobile) ?? -Infinity) > x.at))
  const tasks = s.tasks.filter((t) => users.includes(t.assignedTo) && openTask(t))
  const pending = s.pendingLog && s.pendingLog.madeBy === s.sessionUserId && users.includes(s.sessionUserId) ? s.pendingLog : null
  // the Investor DMS list each row opens (named like Prospect DMS's own lists in the menu)
  const I_LIST = { fuToday: 'Events', fuOverdue: 'Events', missed: 'Call Logs', tasks: 'Tasks', dealsToday: 'Deals', dealsUpdate: 'Deals', running: 'Investors', near: 'Investors' }
  /** a row: Prospect DMS records (pList, opened with pOpen; null = an Investor DMS row) and Investor DMS's count (iN,
   *  its to-do key; null = a Prospect DMS row) */
  const a = (key, icon, label, hint, pList, pOpen, iN, tone) => {
    const pn = new Set(pList).size; const iv = iN ?? 0; const value = pn + iv; const site = !pOpen ? 'I' : iN == null ? 'P' : null
    return { key, icon, label, hint, value, listCount: value, tone: value && tone ? tone : null, site, parts: !site ? parts(pn, iv, X) : null,
      drill: [...here(pn ? pOpen(pList, label) : []), ...X.drill(iv, key, I_LIST[key] || label)] }
  }
  const items = [
    a('fuToday', 'lucide-calendar-clock', 'Follow-ups due today', 'Calls promised for today', ids(fu.filter((e) => e.start >= d0 && e.start < d0 + DAY)), dEvents, I.n('fuToday')),
    a('fuOverdue', 'lucide-phone-missed', 'Follow-ups overdue', 'Time passed, no call since', ids(overdueFollowups(users)), dEvents, I.n('fuOverdue')),
    a('missed', 'lucide-phone-incoming', 'Missed calls to return', 'They called in the last 14 days', ids(notBack), dCalls, I.n('missed')),
    a('tasks', 'lucide-list-todo', 'Tasks due or overdue', 'Due today, or past due (last 60 days)', ids(tasks.filter((t) => t.due && t.due < d0 + DAY && t.due > now - 60 * DAY)), dTasks, I.n('tasksDue')),
    a('dealsToday', 'lucide-handshake', 'Deals today', 'Investment meetings planned for today', [], null, I.n('dealsToday')),
    a('backToPool', 'lucide-hourglass', 'About to go back to Pool', 'Prospects and Leads: 7 days or less on a timer', back, dClients, null, 'amber'),
    a('running', 'lucide-timer', 'Prospect Investors running out', '7 days or less left to invest', [], null, I.n('runningOut'), 'amber'),
    a('near', 'lucide-user-x', 'About to go to Unassigned', 'Inactive investors, 7 days or less left', [], null, I.n('nearUnassigned'), 'amber'),
    a('window', 'lucide-message-circle', 'Can message now', 'After a Followup call, or they replied', ids(s.clients.filter((c) => mine(c) && (windowOpen(c) || replyOpen(c)))), dClients, null),
  ].filter((x) => x.site !== 'I' || X.ok)
  if (pending) items.unshift({ key: 'unsaved', icon: 'lucide-file-warning', label: 'Call log not saved', hint: 'Save the log of your last call', value: 1, drill: pending.clientId ? [{ label: 'Record', count: 1, to: { path: `/record/${pending.clientId}` } }] : null })
  const n = items.filter((x) => x.value).length
  return { key: 'actions', title: 'Focus today', icon: 'lucide-list-checks', sub: n ? `${n} thing${n === 1 ? '' : 's'} to act on${X.ok ? ' · both websites' : ''}` : 'Nothing waiting', kind: 'actions', info: DEF.today, items }
}

// ---------------------------------------------------------------- Pipeline: from the first call to the deal
function pipeline(p, users, tl, X) {
  const s = db(); const I = X.of(users)
  const c = callsIn(p, users); const called = uniq(c.filter((x) => x.stageAtCall === 'Pool').map((x) => x.clientId))
  const taken = uniq(moves(p, users).filter((m) => m.from === 'Pool').map((m) => m.clientId))
  const acc = accepted(p, users); const indiv = acc.reduce((t, h) => t + h.memberCount, 0)
  const dealsIn = I.t('won') + I.t('rej') + I.t('exp') + I.t('sched')
  const steps = [
    { key: 'called', label: 'Called in Pool', site: 'P', unit: 'records', value: called.length, listCount: called.length, drill: here(dClients(called, 'Called in the Pool')), sub: 'records called while in the Pool' },
    { key: 'taken', label: 'Taken from Pool', site: 'P', unit: 'records', value: taken.length, listCount: taken.length, drill: here(dClients(taken, 'Taken from the Pool')), sub: 'to Prospect or Lead' },
    { key: 'converted', label: 'Converted', site: 'P', unit: 'people', value: indiv, listCount: new Set(acc.map((h) => h.clientId)).size, drill: here(dClients(acc.map((h) => h.clientId), 'Converted to Investor')), sub: 'individuals → Investor DMS' },
    { key: 'deals', label: 'Deals planned', site: 'I', unit: 'deals', value: X.ok ? dealsIn : null, listCount: dealsIn, drill: X.drill(dealsIn, '#deals', 'Deals'), sub: 'meetings in the period' },
    { key: 'won', label: 'Deals closed', site: 'I', unit: 'deals', value: X.ok ? I.t('won') : null, listCount: I.t('won'), drill: X.drill(I.t('won'), 'won', 'Deals closed'), sub: X.ok ? inrShort(I.t('wonAmt')) : 'Investor DMS' },
  ]
  // how the period's deals ended: the same groups (and names) as on the Investor DMS dashboard, so a click opens them
  const ended = [['Closed', 'won', 'Closed', 'good'], ['Rejected', 'rej', 'Not interested (rejected)', 'crit'], ['Expired', 'exp', 'Passed without update (expired)', 'warn'], ['Scheduled', 'sched', 'Scheduled', 'gray']]
  const SLOTS = [['This week', 'wk'], ['Next week', 'nextWk'], ['Within 30 days', 'in30'], ['Later', 'later']]
  // lost from the pipeline: back to the Pool (and, for TL+, Junk and IS Mapping) here; moved to Unassigned (Admin) there
  const back = backToPool(p).filter((b) => isAdmin() || users.includes(b.owner))
  const k = (kind) => back.filter((x) => x.kind === kind).map((x) => x.clientId)
  const lost = [['Released by IS', k('is')], ['90-day timer', k('90')], ['730-day timer', k('730')], ['Released by Admin', k('admin')]]
  if (tl) {
    const owner = (cl) => cl.familyAdvisor || cl.prevOwner
    const j = s.clients.filter((cl) => cl.stage === 'Junk' && inP(cl.movedOn, p) && (isAdmin() || users.includes(owner(cl))))
    lost.push(['Junk (by the system)', ids(j.filter((cl) => cl.movedBy === 'System'))], ['Junk (by Admin)', ids(j.filter((cl) => cl.movedBy === 'Admin'))])
    const names = new Set(s.users.filter((u) => users.includes(u.id)).map((u) => u.name))
    lost.push(['Given away (IS Mapping)', s.activities.filter((x) => x.type === 'owner' && inP(x.at, p) && /^Transferred via IS Mapping to /.test(x.text) && !names.has(x.text.replace('Transferred via IS Mapping to ', '')) && users.includes(s.transfers.find((t) => Math.abs(t.at - x.at) < 5000)?.from)).map((x) => x.clientId)])
  }
  const lostItems = lost.filter(([, l]) => l.length).map(([name, l], i) => ({ key: i, ...fig(name, l, (x, t) => here(dClients(x, t)), { drillLabel: `Lost: ${name}` }) }))
  if (isAdmin() && I.t('lost')) lostItems.push({ key: 'unassigned', label: 'Moved to Unassigned (Investor DMS)', value: I.t('lost'), listCount: I.t('lost'), drill: X.drill(I.t('lost'), 'lost', 'Moved to Unassigned') })
  const cards = [
    { key: 'journey', title: 'From first call to deal', icon: 'lucide-route', sub: 'This period, both websites · click a step to open its records', kind: 'steps', ratios: false, wide: true, info: DEF.journey, items: steps },
    { key: 'lost', title: 'Lost from the pipeline', sub: `${lostItems.reduce((t, x) => t + x.value, 0).toLocaleString('en-IN')} in the period`, kind: 'bars', tone: 'gray', info: DEF.lost, empty: 'Nothing lost in this period.', items: [...lostItems].sort((x, y) => y.value - x.value) },
  ]
  if (X.ok) cards.splice(1, 0,
    { key: 'dealOutcomes', title: 'How deals ended', site: 'I', kind: 'donut', caption: 'deals', info: DEF.dealOutcomes, empty: 'No deal in this period.',
      items: ended.filter(([, x]) => I.t(x)).map(([label, x, full, tone], i) => ({ key: i, label, tone, value: I.t(x), listCount: I.t(x), drill: X.drill(I.t(x), `dealOutcomes.${full}`, 'Deals') })) },
    { key: 'pipelineAhead', title: 'Pipeline ahead', site: 'I', badge: 'Now', kind: 'bars', tone: 'i', info: DEF.pipelineAhead, empty: 'No deal planned.',
      items: SLOTS.map(([label, x], i) => ({ key: i, label, value: I.n(`${x}Amt`), fmt: 'money', listCount: I.n(x), note: `${I.n(x)} deal${I.n(x) === 1 ? '' : 's'}`, drill: X.drill(I.n(x), `pipelineAhead.${label}`, 'Deals') })) })
  return { key: 'pipeline', title: 'Pipeline', icon: 'lucide-git-branch', sub: 'From the first call to the deal', cards }
}

// ---------------------------------------------------------------- Clients now: who each person holds, and who needs a call
function clientsNow(users, tl, X) {
  const s = db(); const mine = mineC(users); const I = X.of(users)
  const held = (st) => ids(s.clients.filter((c) => c.stage === st && mine(c)))
  const pl = s.clients.filter((c) => ['Prospect', 'Lead'].includes(c.stage) && mine(c))
  const back = ids(pl.filter((c) => LIMITS.PL_INACTIVITY_DAYS - daysSince(c.lastCallAt || c.takeoverDate) <= R.TIMER_AMBER_DAYS || LIMITS.PL_CAP_DAYS - daysSince(c.takeoverDate) <= R.TIMER_AMBER_DAYS))
  const open = (x, t) => here(dClients(x, t))
  const donut = (pairs, label) => pairs.filter(([, l]) => l.length).map(([name, l], i) => ({ key: i, ...fig(name, l, open, { drillLabel: `${label}: ${name}` }) }))
  // ranked bars with each one's share of the Prospects and Leads held (a record can be interested in several products)
  const ranked = (pairs, label) => donut(pairs, label).sort((x, y) => y.value - x.value).map((x) => ({ ...x, note: `${Math.round((x.value / Math.max(1, pl.length)) * 100)}%` }))
  const langs = {}; for (const c of pl) (langs[c.members[0]?.language || 'Not known'] ||= []).push(c.id)
  const choices = [{ label: 'Product interest', kind: 'bars', empty: 'No Prospects or Leads.', items: ranked(PRODUCT_INTEREST.map((x) => [x.label, ids(pl.filter((c) => (c.members[0]?.product || []).includes(x.key)))]), 'Product interest') }]
  if (tl) choices.push({ label: 'Language', kind: 'bars', empty: 'No Prospects or Leads.', items: ranked(Object.entries(langs).sort((a, b) => a[0].localeCompare(b[0])), 'Language') })
  const iFig = (key, label, n, openKey, extra = {}) => ({ key, label, value: X.ok ? n : null, listCount: n, drill: X.drill(n, openKey, label), ...extra })
  const status = [['Active', 'active', 'i'], ['Prospect Investor', 'prospect', 'mid'], ['Inactive', 'inactive', 'gray']]
  return { key: 'clients', title: 'Clients now', icon: 'lucide-contact', badge: 'Now', cols: 2, cards: [
    { key: 'held', title: 'Held now', kind: 'figures', cols: 2, info: DEF.held, items: [
      fig('Prospects', held('Prospect'), open, { key: 'prospects', sub: 'Prospect DMS', site: 'P', icon: 'lucide-user-round' }),
      fig('Leads', held('Lead'), open, { key: 'leads', sub: 'Prospect DMS', site: 'P', icon: 'lucide-flame' }),
      fig('Investor Family', held('Investor Family'), open, { key: 'family', sub: 'members still to convert', site: 'P', icon: 'lucide-users-round' }),
      iFig('investors', 'Investors', I.n('investors'), 'investors', { sub: X.ok ? `${I.n('active')} active · Investor DMS` : 'Investor DMS', site: 'I', icon: 'lucide-landmark' }),
    ] },
    ...(X.ok ? [{ key: 'invStatus', title: 'Investors by status', site: 'I', badge: 'Now', kind: 'donut', caption: 'investors', info: DEF.invStatus, empty: 'No investor.',
      items: status.filter(([, k]) => I.n(k)).map(([label, k, tone], i) => ({ key: i, label, tone, value: I.n(k), listCount: I.n(k), drill: X.drill(I.n(k), `status.${label}`, `Investors: ${label}`) })) }] : []),
    { key: 'attention', title: 'Needs a call soon', kind: 'figures', cols: 2, info: DEF.attention, items: [
      fig('About to go back to Pool', back, open, { key: 'pool', tone: back.length ? 'amber' : null, sub: 'Prospects and Leads', site: 'P', icon: 'lucide-hourglass' }),
      ...(X.ok ? [
        iFig('inactive', 'Turning Inactive in 30 days', I.n('soonInactive'), 'atRisk.inactive', { tone: I.n('soonInactive') ? 'amber' : null, sub: 'Investors', site: 'I', icon: 'lucide-trending-down' }),
        iFig('running', 'Prospect Investors running out', I.n('runningOut'), 'running', { tone: I.n('runningOut') ? 'amber' : null, sub: '7 days or less', site: 'I', icon: 'lucide-timer' }),
        iFig('notCalled', 'Not called in 60 days', I.n('notCalled60'), 'atRisk.notCalled', { sub: 'Investors', site: 'I', icon: 'lucide-phone-off' }),
      ] : []),
    ] },
    { key: 'interest', title: 'What they are interested in', site: 'P', badge: 'Prospects & Leads', kind: 'choice', info: DEF.interest, choices },
  ] }
}

// ---------------------------------------------------------------- Calling (period), both websites
// Design review 27 Nov 2026: when clients pick up (weekday × hour heatmap), the connect rate against its 75% target,
// calls by hour of the day by website, and how calls ended as ranked bars (seven outcomes are too many for a donut).
const heatMemo = perRun(() => new Map())
/** The weekday × hour grid of the period's calls in both websites (also used by the highlights). */
function heatOf(p, users, X) {
  const key = `${p.from}|${p.to}|${users.join(',')}`; const memo = heatMemo()
  if (!memo.has(key)) {
    const I = X.of(users)
    memo.set(key, weekHeat(callsIn(p, users), { isConnected, label: hourLabel, open: (l, t) => here(dCalls(ids(l), `${t}: calls`)),
      add: (r, h) => { const n = I.week.calls[r * 24 + h] || 0; return { calls: n, conn: I.week.conn[r * 24 + h] || 0, drill: X.drill(n, 'calls', 'Call Logs (whole period)') } } }))
  }
  return memo.get(key)
}
function calling(p, users, X) {
  const c = callsIn(p, users); const conn = c.filter(isConnected); const I = X.of(users)
  const calls = c.length + I.t('calls'); const connN = conn.length + I.t('conn')
  const names = uniq([...CALL_OUTCOMES.Prospect, ...Object.keys(I.outcomes)])
  const ended = [...names.map((o) => ({ label: o, p: ids(conn.filter((x) => x.subStatus === o)), i: I.outcomes[o] || 0 })),
    { label: 'Not connected', p: ids(c.filter((x) => !isConnected(x))), i: I.t('calls') - I.t('conn') }]
    .filter((x) => x.p.length || x.i).sort((a, b) => b.p.length + b.i - (a.p.length + a.i))
  const heat = heatOf(p, users, X)
  // calls by hour of the day, by website (Investor DMS opens the whole period: one hour of every day is not a list there)
  const byHour = Array.from({ length: 24 }, () => []); for (const x of c) byHour[new Date(x.at).getHours()].push(x)
  const hours = heat.cols.map(({ h, label }) => ({ key: h, label, title: label, segments: [
    { key: 'p', tone: 'p', label: 'Prospect DMS', value: byHour[h].length, listCount: byHour[h].length, drill: here(dCalls(ids(byHour[h]), `${label}: calls`)) },
    { key: 'i', tone: 'i', label: 'Investor DMS', value: I.hours.calls[h] || 0, listCount: I.hours.calls[h] || 0, drill: X.drill(I.hours.calls[h] || 0, 'calls', 'Call Logs (whole period)') },
  ] }))
  const pRate = pct(conn.length, c.length); const iRate = pct(I.t('conn'), I.t('calls'))
  return { key: 'calling', title: 'Calling', icon: 'lucide-phone', sub: X.ok ? 'Both websites' : '', cards: [
    { key: 'heat', title: 'When clients pick up', sub: 'Each weekday and hour of the period', kind: 'heatmap', span2: true, info: DEF.heat, ...heat },
    { key: 'connectGauge', title: 'Connect rate', kind: 'gauge', info: DEF.gauge, value: pct(connN, calls), target: R.CONNECT_GREEN_AT, label: `${connN.toLocaleString('en-IN')} of ${calls.toLocaleString('en-IN')} calls connected`,
      listCount: calls, drill: [...here(dCalls(ids(c), 'All calls')), ...X.drill(I.t('calls'), 'rate', 'Call Logs')],
      parts: X.ok ? [{ label: 'Prospect DMS', value: pRate, tone: 'p' }, { label: 'Investor DMS', value: iRate, tone: 'i' }] : null },
    { key: 'byHour', title: 'Calls by hour of the day', sub: X.ok ? 'By website' : '', kind: 'columns', span2: true, info: DEF.byHour, legend: X.ok ? SITE_LEGEND_PI : [], columns: hours, height: 200 },
    { key: 'outcomes', title: 'How calls ended', kind: 'bars', info: DEF.outcomes, empty: 'No calls in this period.', tone: 'dark',
      items: ended.map((x, i) => ({ key: i, label: x.label, value: x.p.length + x.i, listCount: x.p.length + x.i, note: `${Math.round(((x.p.length + x.i) / Math.max(1, calls)) * 100)}%`,
        drill: [...here(x.p.length ? dCalls(x.p, `Calls: ${x.label}`) : []), ...X.drill(x.i, `outcomes.${x.label}`, 'Call Logs')] })) },
  ] }
}

// ---------------------------------------------------------------- Messaging (period), both websites
function messaging(p, users, X) {
  const s = db(); const I = X.of(users); const bs = buckets(p); const hourly = p.to - p.from <= DAY; const now = Date.now()
  const wa = sentIn(s.wa, p, users); const em = sentIn(s.emails, p, users)
  const byKey = (l, k) => { const o = {}; for (const m of l) (o[m[k] || 'Not known'] ||= []).push(m.id); return o }
  const tplSent = wa.filter((m) => m.type === 'Template')
  const tplBars = Object.entries(byKey(tplSent, 'template')).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, l]) => ({ key: name, ...fig(name, l, (x, t) => here(dWa(x, t)), { drillLabel: `WhatsApp template ${name}` }), note: `${Math.round((l.length / tplSent.length) * 100)}%` }))
  const DELIVERY = { Read: 'dark', Opened: 'dark', Delivered: 'mid', Sent: 'light', Failed: 'crit', Bounced: 'crit' }
  const donut = (o, open, label) => Object.entries(o).filter(([, l]) => l.length).map(([k, l], i) => ({ key: i, tone: DELIVERY[k], ...fig(k, l, (x, t) => here(open(x, t)), { drillLabel: `${label}: ${k}` }) }))
  const order = (o, keys) => Object.fromEntries(keys.filter((k) => o[k]?.length).map((k) => [k, o[k]]))
  const day = (b) => (hourly ? undefined : X.dayOf(b))
  const waDay = byBucket(bs, wa); const emDay = byBucket(bs, em)
  const columns = bs.map((b, i) => {
    const w = waDay(b); const e = emDay(b)
    return { key: i, label: b.label, title: b.title || b.label, partial: inB(b, now), segments: [
      { key: 'w', tone: 'wa', label: 'WhatsApp', value: w.length + I.at('wa', i), listCount: w.length + I.at('wa', i), drill: [...here(dWa(ids(w), `${b.title || b.label}: WhatsApp sent`)), ...X.drill(I.at('wa', i), 'wa', 'WhatsApp Logs', undefined, day(b))] },
      { key: 'e', tone: 'em', label: 'Email', value: e.length + I.at('email', i), listCount: e.length + I.at('email', i), drill: [...here(dEm(ids(e), `${b.title || b.label}: emails sent`)), ...X.drill(I.at('email', i), 'email', 'Email Logs', undefined, day(b))] },
    ] }
  })
  const sent = wa.length + em.length + I.t('wa') + I.t('email')
  const channel = (key, label, pList, iN, open, iKey, iList) => ({ key, label, note: `${Math.round(((pList.length + iN) / Math.max(1, sent)) * 100)}%`, segments: [
    { key: 'p', tone: 'p', label: 'Prospect DMS', value: pList.length, listCount: pList.length, drill: here(open(ids(pList), `${label} sent`)) },
    { key: 'i', tone: 'i', label: 'Investor DMS', value: iN, listCount: iN, drill: X.drill(iN, iKey, iList) }] })
  return { key: 'messaging', title: 'Messaging', icon: 'lucide-message-square', sub: X.ok ? 'Both websites' : '', cards: [
    { key: 'msgDays', title: `Messages sent ${hourly ? 'by hour' : 'per day'}`, sub: `${sent.toLocaleString('en-IN')} in the period`, kind: 'columns', span2: true, height: 200, info: DEF.msgTypes, legend: [{ label: 'WhatsApp', tone: 'wa' }, { label: 'Email', tone: 'em' }], columns },
    { key: 'msgSites', title: 'What was sent', sub: X.ok ? 'Each channel by website' : '', kind: 'bars', info: DEF.msgTypes, empty: 'Nothing sent in this period.', legend: X.ok ? SITE_LEGEND_PI : [],
      items: sent ? [channel('wa', 'WhatsApp', wa, I.t('wa'), dWa, 'wa', 'WhatsApp Logs'), channel('em', 'Email', em, I.t('email'), dEm, 'email', 'Email Logs')] : [] },
    { key: 'templates', title: 'WhatsApp templates used', site: 'P', sub: tplSent.length ? `${tplSent.length} sent · each template's share` : '', kind: 'bars', tone: 'wa', span2: true, scroll: true, info: DEF.templates, empty: 'No template sent in this period.', items: tplBars },
    { key: 'delivery', title: 'Delivery', site: 'P', kind: 'choice', info: DEF.delivery, choices: [
      { label: 'WhatsApp', kind: 'donut', caption: 'sent', empty: 'No WhatsApp sent.', items: donut(order(byKey(wa, 'status'), ['Read', 'Delivered', 'Sent', 'Failed']), dWa, 'WhatsApp') },
      { label: 'Email', kind: 'donut', caption: 'sent', empty: 'No email sent.', items: donut(order(byKey(em, 'status'), ['Opened', 'Delivered', 'Sent', 'Bounced']), dEm, 'Email') },
    ] },
  ] }
}

// ---------------------------------------------------------------- Highlights: what the numbers say, in a sentence each
// At most four, most useful first: work waiting today, how calling is going, the best time to call, and results.
function highlights(p, prev, users, X) {
  const out = []; const I = X.of(users)
  const c = callsIn(p, users); const cp = callsIn(prev, users)
  const calls = c.length + I.t('calls'); const callsPrev = cp.length + I.pv('calls'); const d = change(calls, callsPrev)
  const over = overdueFollowups(users); const overN = over.length + I.n('fuOverdue')
  if (overN) out.push({ key: 'overdue', icon: 'lucide-phone-missed', tone: 'warn', title: `${overN.toLocaleString('en-IN')} follow-up${overN === 1 ? '' : 's'} overdue`, text: X.ok ? `Prospect ${over.length} · Investor ${I.n('fuOverdue')} — promised calls not made yet` : 'Promised calls not made yet',
    drill: [...here(over.length ? dEvents(ids(over), 'Follow-ups overdue') : []), ...X.drill(I.n('fuOverdue'), 'fuOverdue', 'Events')] })
  if (calls) out.push({ key: 'calls', icon: d == null || d >= 0 ? 'lucide-trending-up' : 'lucide-trending-down', tone: d == null ? 'info' : d >= 0 ? 'good' : 'bad',
    title: d == null ? `${calls.toLocaleString('en-IN')} calls made` : `Calls ${d >= 0 ? 'up' : 'down'} ${Math.abs(d) > 999 ? '999+' : Math.abs(d)}%`,
    text: `${calls.toLocaleString('en-IN')} calls, ${pct(c.filter(isConnected).length + I.t('conn'), calls)}% connected · ${prev.caption}`, drill: [...here(dCalls(ids(c), 'Calls')), ...X.drill(I.t('calls'), 'calls', 'Call Logs')] })
  const best = heatOf(p, users, X).best
  if (best) out.push({ key: 'bestTime', icon: 'lucide-clock-3', tone: 'info', title: `Best time to call: ${best.day} ${best.hour}`, text: `${best.rate}% of ${best.calls.toLocaleString('en-IN')} calls picked up then`, drill: best.drill })
  if (X.ok && I.t('won')) out.push({ key: 'won', icon: 'lucide-badge-indian-rupee', tone: 'good', title: `${inrShort(I.t('wonAmt'))} closed`, text: `${I.t('won')} deal${I.t('won') === 1 ? '' : 's'} marked Completed · win rate ${pct(I.t('won'), I.t('decided')) ?? 0}%`, drill: X.drill(I.t('won'), 'won', 'Deals closed') })
  const acc = accepted(p, users); const indiv = acc.reduce((t, h) => t + h.memberCount, 0)
  if (out.length < 4 && indiv) out.push({ key: 'converted', icon: 'lucide-user-check', tone: 'good', title: `${indiv} converted to Investor`, text: `${new Set(acc.map((h) => h.familyId)).size} group${acc.length === 1 ? '' : 's'} handed over to Investor DMS`, drill: here(dClients(acc.map((h) => h.clientId), 'Converted to Investor')) })
  return out.slice(0, 4)
}

// ---------------------------------------------------------------- Team (TL+): who to coach, and every person, both websites
function stats(p, who, X) {
  const c = callsIn(p, who); const conn = c.filter(isConnected); const I = X.of(who); const w = X.whoOf(who)
  const calls = c.length + I.t('calls'); const rate = pct(conn.length + I.t('conn'), calls)
  const mv = moves(p, who); const acc = accepted(p, who)
  const own = (st) => clientsBy()(who).filter((x) => x.stage === st)
  const set = new Set(who)
  const pc = (l, open, label, extra = {}) => fig('', l, (x, t) => here(open(x, t)), { drillLabel: label, ...extra })
  const ic = (n, open, label, extra = {}) => ({ value: X.ok ? n : null, listCount: n, drill: X.drill(n, open, label, w), ...extra })
  return {
    calls: { value: calls, listCount: calls, drill: [...here(dCalls(ids(c), 'Calls')), ...X.drill(I.t('calls'), 'calls', 'Call Logs', w)] },
    rate: { value: rate, tone: R.connectTone(rate), drill: [...here(dCalls(ids(c), 'All calls')), ...X.drill(I.t('calls'), 'rate', 'Call Logs', w)] },
    talk: { value: R.talkTime(c) + I.t('talk'), drill: [...here(dCalls(ids(conn), 'Connected calls (talk time)')), ...X.drill(I.t('conn'), 'talk', 'Call Logs', w)] },
    taken: pc(mv.filter((m) => m.from === 'Pool').map((m) => m.clientId), dClients, 'Taken from the Pool'),
    conv: pc(acc.map((h) => h.clientId), dClients, 'Converted to Investor', { value: acc.reduce((t, h) => t + h.memberCount, 0) }),
    held: pc([...ids(own('Prospect')), ...ids(own('Lead'))], dClients, 'Prospects and Leads held'),
    investors: ic(I.n('investors'), 'investors', 'Investors'),
    closed: ic(I.t('won'), 'won', 'Deals closed'),
    closedAmt: ic(I.t('wonAmt'), 'won', 'Deals closed', { listCount: I.t('won'), drill: X.drill(I.t('won'), 'won', 'Deals closed', w) }),
    win: ic(pct(I.t('won'), I.t('decided')), 'winRate', 'Deals decided', { listCount: I.t('decided'), drill: X.drill(I.t('decided'), 'winRate', 'Deals decided', w) }),
    pipeline: ic(I.n('pipelineAmt'), 'pipeline', 'Deals ahead', { listCount: I.n('pipelineN'), drill: X.drill(I.n('pipelineN'), 'pipeline', 'Deals ahead', w) }),
    back: pc(backToPool(p).filter((b) => set.has(b.owner)).map((b) => b.clientId), dClients, 'Back to Pool'),
    lost: ic(I.t('lost'), 'lost', 'Moved to Unassigned'),
  }
}
function team(p, users, X) {
  const s = db()
  const people = s.users.filter((u) => users.includes(u.id) && u.role !== 'Admin' && u.active !== false).sort((a, b) => a.name.localeCompare(b.name))
  const G = { a: 'Calling', p: 'Prospects', i: 'Investors', l: 'Lost' }
  const columns = [['calls', 'Calls', 'a'], ['rate', 'Connect rate', 'a', 'pct'], ['talk', 'Talk time', 'a', 'time'], ['taken', 'Taken from Pool', 'p'], ['conv', 'Converted', 'p'], ['held', 'Held now', 'p'],
    ...(X.ok ? [['investors', 'Investors', 'i'], ['closed', 'Deals closed', 'i'], ['closedAmt', 'Closed amount', 'i', 'money'], ['win', 'Win rate', 'i', 'pct'], ['pipeline', 'Pipeline', 'i', 'money']] : []),
    // product owner 27 Nov 2026: what was lost is shown to Admin only
    ...(isAdmin() ? [['back', 'Back to Pool', 'l'], ...(X.ok ? [['lost', 'To Unassigned', 'l']] : [])] : [])]
    .map(([key, label, g, fmt]) => ({ key, label, group: G[g], fmt, bar: key === 'calls' }))
  const rows = people.map((u) => ({ id: u.id, name: u.name, code: u.mhf_id, group: teamName(u.id), cells: stats(p, [u.id], X) }))
  const teams = uniq(rows.map((r) => r.group)).sort((a, b) => (a === 'Management') - (b === 'Management') || byTeamOrder(a, b))
  const grouped = teams.length > 1
  const groupTotals = grouped ? Object.fromEntries(teams.map((t) => [t, stats(p, rows.filter((r) => r.group === t).map((r) => r.id), X)])) : null
  return { key: 'team', title: 'Team', icon: 'lucide-users', badge: 'TL+', sub: 'Both websites · click a person to see their dashboard', cards: [
    effortCard(p, people, X),
    { key: 'people', title: 'People', kind: 'table', wide: true, searchable: true, grouped, groupTotals, info: DEF.people, columns, rows: grouped ? teams.flatMap((t) => rows.filter((r) => r.group === t)) : rows, total: stats(p, ids(people), X) },
  ] }
}
// Effort vs results: every IS as a dot - effort across (calls a day in both websites, on the days they called), a
// result up; the middle lines split them into four groups. People with no call in the period are counted apart.
function effortCard(p, people, X) {
  const points = []; let idle = 0
  for (const u of people) {
    if (u.role !== 'IS') continue
    const c = callsIn(p, [u.id]); const I = X.of([u.id])
    const calls = c.length + I.t('calls')
    if (!calls) { idle++; continue }
    const days = Math.max(1, workDays(p, u.id, X))
    const conn = c.filter(isConnected).length + I.t('conn')
    const conv = accepted(p, [u.id]).reduce((t, h) => t + h.memberCount, 0)
    const called = new Set(c.map((x) => x.clientId)).size
    const won = I.t('won'); const decided = I.t('decided')
    // raw counts too, so a team's figures are pooled (its calls ÷ its working days ...), not an average of averages
    points.push({ id: u.id, name: u.name, code: u.mhf_id, team: teamName(u.id), calls, days, raw: { calls, days, conn, conv, called, won, decided },
      x: Math.round((calls / days) * 10) / 10,
      y: { rate: pct(conn, calls), conv: pct(conv, called), win: pct(won, decided) } })
  }
  return { key: 'effort', title: 'Effort vs results', sub: 'Each dot is an IS · calls in both websites', kind: 'effort', wide: true, info: DEF.effort, points, idle, teams: uniq(points.map((x) => x.team)).sort(byTeamOrder),
    x: { label: 'Calls a day' },
    ys: [{ key: 'rate', label: 'Connect rate', fmt: 'pct', num: 'conn', den: 'calls' }, { key: 'conv', label: 'Conversion rate', fmt: 'pct', num: 'conv', den: 'called' },
      ...(X.ok ? [{ key: 'win', label: 'Deal win rate', fmt: 'pct', num: 'won', den: 'decided' }] : [])] }
}

// ---------------------------------------------------------------- Compare (several teams, or several people, ticked)
// Tick 2 or more teams (or people) in the picker: a line per team or person over the period, and every measure
// against the Money Honey average (the company's figures in both websites ÷ the number of teams, or of IS).
const CMP_ALL = [
  { key: 'calls', label: 'Calls', fmt: 'n', line: true, hint: 'both websites' },
  { key: 'rate', label: 'Connect rate', fmt: 'pct', line: true, rate: true },
  { key: 'talk', label: 'Talk time', fmt: 'time', line: true, lineUnit: 'min' },
  { key: 'msgs', label: 'Messages sent', fmt: 'n', line: true, hint: 'WhatsApp and email' },
  { key: 'taken', label: 'Taken from Pool', fmt: 'n', line: true },
  { key: 'conv', label: 'Converted', fmt: 'n', line: true, hint: 'individuals' },
  { key: 'convRate', label: 'Conversion rate', fmt: 'pct', rate: true, hint: 'converted ÷ clients called' },
  { key: 'closedAmt', label: 'Deals closed', fmt: 'money', line: true, hint: 'final amount', inv: true },
  { key: 'closed', label: 'Deals closed (number)', fmt: 'n', line: true, inv: true },
  { key: 'win', label: 'Deal win rate', fmt: 'pct', rate: true, inv: true },
  { key: 'back', label: 'Back to Pool', fmt: 'n', lowerBetter: true, admin: true },
]
/** A group's numbers for the period (total) and per day (or hour). `I` = its Investor DMS figures (or the company's). */
function numbersOf(p, bs, who, I) {
  const c = callsIn(p, who); const conn = c.filter(isConnected)
  const wa = sentIn(db().wa, p, who); const em = sentIn(db().emails, p, who)
  const taken = moves(p, who).filter((m) => m.from === 'Pool'); const acc = accepted(p, who)
  const set = new Set(who); const conv = acc.reduce((t, h) => t + h.memberCount, 0)
  const total = {
    calls: c.length + I.t('calls'), rate: pct(conn.length + I.t('conn'), c.length + I.t('calls')), talk: R.talkTime(c) + I.t('talk'), msgs: wa.length + em.length + I.t('wa') + I.t('email'),
    taken: new Set(taken.map((m) => m.clientId)).size, conv, convRate: pct(conv, new Set(c.map((x) => x.clientId)).size),
    closedAmt: I.t('wonAmt'), closed: I.t('won'), win: pct(I.t('won'), I.t('decided')), back: backToPool(p).filter((x) => set.has(x.owner)).length,
  }
  const at = (l, b) => l.filter((x) => inB(b, x.at))
  const line = {
    calls: bs.map((b, i) => at(c, b).length + I.at('calls', i)),
    rate: bs.map((b, i) => { const n = at(c, b).length + I.at('calls', i); return n ? pct(at(conn, b).length + I.at('conn', i), n) : null }),
    talk: bs.map((b, i) => Math.round((R.talkTime(at(c, b)) + I.at('talk', i)) / 60)),
    msgs: bs.map((b, i) => at(wa, b).length + at(em, b).length + I.at('wa', i) + I.at('email', i)),
    taken: bs.map((b) => new Set(at(taken, b).map((m) => m.clientId)).size), conv: bs.map((b) => acc.filter((h) => inB(b, h.ackAt)).reduce((t, h) => t + h.memberCount, 0)),
    closedAmt: bs.map((b, i) => I.at('wonAmt', i)), closed: bs.map((b, i) => I.at('won', i)),
  }
  return { total, line }
}
function averageOf(n, size, metrics) {
  const d = (v) => (v == null ? null : Math.round((v / Math.max(1, size)) * 10) / 10)
  const total = {}; const line = {}
  for (const m of metrics) total[m.key] = m.rate ? n.total[m.key] : d(n.total[m.key])
  for (const [k, l] of Object.entries(n.line)) line[k] = metrics.find((m) => m.key === k)?.rate ? l : l.map(d)
  return { total, line }
}
function compareSection(p, sel, X) {
  const s = db(); const vis = visibleUserIds(); const bs = buckets(p)
  const metrics = CMP_ALL.filter((m) => (!m.inv || X.ok) && (!m.admin || isAdmin()))
  const isIS = (id) => s.userById(id)?.role === 'IS'
  const entities = sel.list.map((key) => {
    if (sel.kind === 'teams') {
      const who = teamMembers(key).filter((id) => vis.includes(id)); const size = who.filter(isIS).length || who.length
      const n = numbersOf(p, bs, who, X.of(who))
      return { key, label: key, sub: `${size} IS`, size, total: n.total, line: n.line }
    }
    const u = s.userById(key); if (!u || !vis.includes(key)) return null
    const n = numbersOf(p, bs, [key], X.of([key]))
    return { key, label: u.name, sub: u.mhf_id, team: teamName(key), size: 1, total: n.total, line: n.line }
  }).filter(Boolean)
  // the Money Honey average: for teams the average team, for people the average IS; people also against their team
  const allIS = s.users.filter((u) => u.role === 'IS' && u.active !== false).map((u) => u.id)
  const company = numbersOf(p, bs, allIS, X.all || X.of([]))
  const teamCount = uniq(allIS.map(teamName)).filter((t) => t !== 'Management').length || 1
  const mh = sel.kind === 'teams' ? averageOf(company, teamCount, metrics) : averageOf(company, allIS.length, metrics)
  const teamAvg = {}
  if (sel.kind === 'users') for (const t of uniq(entities.map((e) => e.team))) { const who = teamMembers(t).filter(isIS); teamAvg[t] = averageOf(numbersOf(p, bs, who, X.of(who)), who.length, metrics).total }
  return { key: 'compare', kind: 'compare', title: `Comparing ${entities.length} ${sel.kind === 'teams' ? 'teams' : 'people'}`, icon: 'lucide-git-compare', info: DEF.compare,
    mode: sel.kind, metrics, labels: bs.map((b) => b.label), titles: bs.map((b) => b.title || b.label), entities, mh, teamAvg }
}

// ---------------------------------------------------------------- Sources (Admin)
// Product owner, 25 Nov 2026: judge a source by the work done in the period, not by its whole list. Of the records
// from the source called in the period: how many were reached; of those called in the Pool, how many were taken out
// of it; and how many were converted in the period.
function sources(p) {
  const s = db()
  const src = (id) => s.clientById(id)?.source || 'Not known'
  const by = {}
  const row = (k) => (by[k] ||= { calls: [], called: new Set(), reached: new Set(), poolCalled: new Set(), taken: new Set(), conv: [] })
  for (const x of s.calls) {
    if (!inP(x.at, p)) continue
    const r = row(src(x.clientId)); r.calls.push(x.id); r.called.add(x.clientId)
    if (isConnected(x)) r.reached.add(x.clientId)
    if (x.stageAtCall === 'Pool') r.poolCalled.add(x.clientId)
  }
  for (const m of moves(p)) if (m.from === 'Pool') row(src(m.clientId)).taken.add(m.clientId)
  for (const h of s.handovers) if (h.status === 'Delivered' && inP(h.ackAt, p)) row(src(h.clientId)).conv.push(h)
  const G = { w: 'Worked in the period', r: 'What it gave' }
  const columns = [['calls', 'Calls made', 'w', null, 'Every call made, counting repeat calls to the same record'], ['called', 'Unique records', 'w', null, 'Different records called at least once (each counted once)'], ['reached', 'Connected', 'r', 'pctbar'], ['taken', 'Taken from Pool', 'r', 'pctbar'], ['conv', 'Converted', 'r', 'pctbar']]
    .map(([key, label, g, fmt, hint]) => ({ key, label, group: G[g], fmt: fmt || undefined, hint }))
  const share = (l, of, label, name, extra = {}) => ({ value: of ? Math.round((l.length / of) * 1000) / 10 : 0, sub: `${l.length} of ${of}`, listCount: l.length, drill: dClients(l, `${name}: ${label}`), ...extra })
  const rows = Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])).map(([name, r]) => {
    const called = [...r.called]; const conv = uniq(r.conv.map((h) => h.clientId)); const people = r.conv.reduce((t, h) => t + h.memberCount, 0)
    return { id: name, name, noScope: true, cells: {
      calls: fig('', r.calls, dCalls, { drillLabel: `${name}: calls` }),
      called: fig('', called, dClients, { drillLabel: `${name}: records called` }),
      reached: share([...r.reached], called.length, 'connected', name),
      taken: share([...r.taken], r.poolCalled.size, 'taken from the Pool', name, { sub: `${r.taken.size} of ${r.poolCalled.size} called in the Pool` }),
      conv: share(conv, called.length, 'converted to Investor', name, { value: called.length ? Math.round((people / called.length) * 1000) / 10 : 0, sub: `${people} of ${called.length}` }),
    } }
  })
  return { key: 'sources', title: 'Sources', icon: 'lucide-radio-tower', badge: 'Admin', sub: 'What each lead source gave in this period', cards: [
    { key: 'sourceFunnel', title: 'Source quality', kind: 'table', wide: true, info: DEF.sources, columns, rows, empty: 'No calls in this period.' },
  ] }
}

// ---------------------------------------------------------------- the page
/** What to ask Investor DMS for (flow F5): the people in view (employee IDs) and the period's days or hours. When
 *  people are compared, their teams too (for the team averages), and the company's total (for the Money Honey average). */
export function figuresRequest(f) {
  return run(() => {
    const p = R.periodOf(f); const prev = R.previousOf(p, f.range); const bs = buckets(p); const sel = parseScope(f.scope)
    const vis = visibleUserIds(); const compare = sel.list.length > 1 && (isSupervisor() || isAdmin())
    let who = scopeUsers(f.scope)
    if (compare && sel.kind === 'users') who = uniq([...who, ...uniq(who.map(teamName)).flatMap(teamMembers).filter((id) => vis.includes(id))])
    const users = uniq(who.map((id) => db().userById(id)?.mhf_id).filter(Boolean)).sort()
    const edges = bs.length ? [...bs.map((b) => b.from), bs[bs.length - 1].to] : []
    const d0 = R.startOfDay()
    return { users, edges, prev: { from: prev.from, to: prev.to }, today: { from: d0, to: d0 + DAY }, all: compare }
  })
}
/** The scope as Investor DMS understands it: employee IDs or team names (its own user IDs differ). */
function whoFor(sel, users) {
  const { kind, list } = parseScope(sel)
  if (kind === 'teams') return { teams: list.filter((t) => !db().userById(t)) }
  if (kind === 'users') return { people: users.map((id) => db().userById(id)?.mhf_id).filter(Boolean) }
  return {}
}
/** While Investor DMS's numbers are on their way (or not available), a line at the top says so. */
function notice(X) {
  if (X.state === 'loading') return { key: 'notice', message: { icon: 'lucide-loader-circle', loading: true, text: 'Getting the Investor DMS numbers… The figures below show Prospect DMS until they arrive.' } }
  return { key: 'notice', message: { icon: 'lucide-cloud-off', tone: 'amber', text: `${X.message} The figures below show Prospect DMS only.` } }
}
/** @param inv the Investor DMS numbers (flow F5): { state: 'loading' | 'ok' | 'off' | 'down' | 'error', data, message } */
export function buildDashboard(f, inv = null) {
  return run(() => build(f, inv))
}
function build(f, inv) {
  const p = R.periodOf(f); const prev = R.previousOf(p, f.range)
  const users = scopeUsers(f.scope)
  const tl = isSupervisor() || isAdmin()
  const X = investorFacts(inv, f, whoFor(f.scope, users), (id) => db().userById(id)?.mhf_id)
  const sections = X.ok ? [] : [notice(X)]
  sections.push(overview(p, prev, users, X), pipeline(p, users, tl, X), clientsNow(users, tl, X), calling(p, users, X), messaging(p, users, X))
  if (tl) sections.push(team(p, users, X))
  if (isAdmin()) sections.push(sources(p))
  // two or more teams (or people) chosen: their comparison at the bottom (the page scrolls to it)
  const sel = parseScope(f.scope)
  if (sel.list.length > 1 && tl) sections.push(compareSection(p, sel, X))
  return { sections, caption: prev.caption, period: p, requests: requests(), insights: highlights(p, prev, users, X) }
}
