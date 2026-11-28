// F5 Investor figures (product owner, 27 Nov 2026): Prospect DMS has ONE dashboard for both websites - its calls are the
// calls made in both, its to-do list has both, a click asks "Prospect DMS or Investor DMS" and opens that website. For
// the Investor DMS part of every number, Investor DMS answers here per person (employee ID) with COUNTS AND AMOUNTS
// ONLY: no client, no name, no record ID, no phone number crosses. A click opens Investor DMS, which shows the records
// to whoever may see them there.
// The counting rules are the Investor DMS dashboard's own (apps/investor-dms/src/services/dashboard.js):
//   closed = a deal marked Completed, with its final amount; decided = Completed, Rejected or Expired; deals count by
//   meeting date and belong to who holds the investor now; pipeline = Scheduled deals still ahead;
//   connected = status Connected and duration above 0.
import { LIMITS } from '../../apps/investor-dms/src/data/masters.js'
import { isConnected, DAY, TIMER_AMBER_DAYS } from '../../packages/core-ui/src/dash/rules.js'

const DECIDED = ['Completed', 'Rejected', 'Expired']
const addMonths = (t, m) => { const d = new Date(t); d.setMonth(d.getMonth() + m); return d.getTime() }
/** Days left on an investor's clock (lifecycle.js remDays). */
function remDays(c, now) {
  if (c.stage !== 'Investor') return null
  if (c.invStatus === 'Prospect') return Math.max(0, LIMITS.PROSPECT_INVESTOR_DAYS - (c.invClockStart ? Math.floor((now - c.invClockStart) / DAY) : 0))
  const end = c.reassignedUntil || addMonths(c.lastInvDate || c.invClockStart, LIMITS.INACTIVE_TO_UNASSIGNED_MONTHS)
  return Math.max(0, Math.ceil((end - now) / DAY))
}

/** The fields an answer may carry (the bridge strips anything else). Series: one number per bucket of the period. */
export const SERIES = ['calls', 'conn', 'talk', 'won', 'wonAmt', 'decided', 'rej', 'exp', 'sched', 'wa', 'email', 'lost']
export const NOW = ['investors', 'active', 'inactive', 'prospect', 'pipelineAmt', 'pipelineN', 'wk', 'nextWk', 'in30', 'later', 'wkAmt', 'nextWkAmt', 'in30Amt', 'laterAmt',
  'dealsToday', 'dealsToUpdate', 'fuToday', 'fuOverdue', 'runningOut', 'nearUnassigned', 'soonInactive', 'notCalled60', 'missed', 'tasksDue']

/**
 * @param state  the Investor DMS database
 * @param q      { users: [employee ID], edges: [t0 … tn] (the period's days or hours, from the asking browser),
 *                 prev: { from, to }, today: { from, to }, all: true for the company's total over every active IS }
 * @returns      { asOf, people: { [employee ID]: Figures }, all?: Figures & { n } }
 *   Figures = { series: { calls: [per bucket] … }, prev: { calls … }, now: { … }, week: { calls: [168], conn: [168] } (weekday × hour, Monday first),
 *               outcomes: { <how a connected call ended>: count } }
 */
export function investorFigures(state, q) {
  const now = Date.now()
  const s = state || {}
  const users = s.users || []; const idOf = new Map(users.map((u) => [u.mhf_id, u.id]))
  const want = new Map(); for (const m of q.users || []) if (idOf.has(m)) want.set(idOf.get(m), m)
  const allIS = q.all ? new Set(users.filter((u) => u.role === 'IS' && u.active !== false).map((u) => u.id)) : new Set()
  const edges = (q.edges || []).map(Number).filter(Number.isFinite)
  const from = edges[0]; const to = edges[edges.length - 1]
  const prev = q.prev || { from: 0, to: 0 }; const d0 = Number(q.today?.from) || now - (now % DAY); const d1 = Number(q.today?.to) || d0 + DAY
  const bucket = (t) => { if (!(t >= from && t < to)) return -1; let lo = 0; let hi = edges.length - 2; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (edges[mid] <= t) lo = mid; else hi = mid - 1 } return lo }
  const blank = () => ({ series: Object.fromEntries(SERIES.map((k) => [k, Array(Math.max(0, edges.length - 1)).fill(0)])), prev: Object.fromEntries(SERIES.map((k) => [k, 0])),
    now: Object.fromEntries(NOW.map((k) => [k, 0])), week: { calls: Array(168).fill(0), conn: Array(168).fill(0) }, outcomes: {} })
  const people = {}; for (const [, mhf] of want) people[mhf] = blank()
  const all = q.all ? { ...blank(), n: allIS.size } : null
  /** the figures a person's numbers go into: their own, and the company's total */
  const targets = (uid) => { const l = []; if (want.has(uid)) l.push(people[want.get(uid)]); if (all && allIS.has(uid)) l.push(all); return l }
  const add = (uid, at, k, v = 1) => {
    const b = bucket(at); const inPrev = at >= prev.from && at < prev.to
    for (const p of targets(uid)) { if (b >= 0) p.series[k][b] += v; if (inPrev) p.prev[k] += v }
  }
  const clientById = new Map((s.clients || []).map((c) => [c.id, c]))
  const ownerOf = (clientId) => clientById.get(clientId)?.assignedTo
  // calls
  const lastCallOf = new Map(); const lastOutboundTo = new Map()
  for (const x of s.calls || []) {
    if (!(lastCallOf.get(x.clientId) >= x.at)) lastCallOf.set(x.clientId, x.at)
    if (x.direction === 'Outbound' && !(lastOutboundTo.get(x.mobile) >= x.at)) lastOutboundTo.set(x.mobile, x.at)
    const tg = targets(x.madeBy); if (!tg.length) continue
    add(x.madeBy, x.at, 'calls'); const conn = isConnected(x)
    if (conn) { add(x.madeBy, x.at, 'conn'); add(x.madeBy, x.at, 'talk', x.duration || 0) }
    if (bucket(x.at) >= 0) {
      const d = new Date(x.at); const w = ((d.getDay() + 6) % 7) * 24 + d.getHours() // Monday 0 am = 0
      for (const p of tg) { p.week.calls[w]++; if (conn) { p.week.conn[w]++; if (x.subStatus) p.outcomes[x.subStatus] = (p.outcomes[x.subStatus] || 0) + 1 } }
    }
  }
  // messages sent
  for (const [list, k] of [[s.wa, 'wa'], [s.emails, 'email']]) for (const m of list || []) if (m.direction === 'Sent') add(m.sentBy, m.at, k)
  // deals, by meeting date, credited to who holds the investor now (as on the Investor DMS dashboard); the pipeline in
  // the same slots as there: this week (to Sunday), next week, within 30 days, later
  const wkEnd = d0 + ((7 - new Date(d0).getDay()) % 7 || 7) * DAY
  for (const d of s.deals || []) {
    const uid = ownerOf(d.clientId); if (!targets(uid).length) continue
    if (d.status === 'Completed') { add(uid, d.start, 'won'); add(uid, d.start, 'wonAmt', Number(d.finalAmount) || 0) }
    if (DECIDED.includes(d.status)) add(uid, d.start, 'decided')
    if (d.status === 'Rejected') add(uid, d.start, 'rej')
    if (d.status === 'Expired') add(uid, d.start, 'exp')
    if (d.status !== 'Scheduled') continue
    add(uid, d.start, 'sched')
    const n = people[want.get(uid)]?.now; if (!n) continue
    if ((d.end || d.start) >= now) {
      const amt = Number(d.total) || 0; n.pipelineAmt += amt; n.pipelineN++
      const slot = d.start < wkEnd ? 'wk' : d.start < wkEnd + 7 * DAY ? 'nextWk' : d.start < d0 + 30 * DAY ? 'in30' : 'later'
      n[slot]++; n[`${slot}Amt`] += amt
    } else n.dealsToUpdate++
    if (d.start >= d0 && d.start < d1) n.dealsToday++
  }
  // moved to Unassigned (Lost): the record history, credited to the previous owner
  for (const a of s.activities || []) {
    if (a.type !== 'stage' || !/^Moved to Unassigned Investors/.test(a.text)) continue
    add(clientById.get(a.clientId)?.prevOwner, a.at, 'lost')
  }
  // the book, now
  for (const c of s.clients || []) {
    if (c.stage !== 'Investor' || !want.has(c.assignedTo)) continue
    const n = people[want.get(c.assignedTo)].now
    n.investors++
    if (c.invStatus === 'Active') n.active++; else if (c.invStatus === 'Inactive') n.inactive++; else if (c.invStatus === 'Prospect') n.prospect++
    const left = remDays(c, now)
    if (c.invStatus === 'Prospect' && left <= TIMER_AMBER_DAYS) n.runningOut++
    if (c.invStatus === 'Inactive' && left <= TIMER_AMBER_DAYS) n.nearUnassigned++
    if (c.invStatus === 'Active' && c.lastInvDate && addMonths(c.lastInvDate, LIMITS.ACTIVE_MONTHS) - now <= 30 * DAY) n.soonInactive++
    if (!c.lastCallAt || now - c.lastCallAt > 60 * DAY) n.notCalled60++
  }
  // to-do: follow-ups (counted once per person), missed calls to return, tasks
  for (const e of s.events || []) {
    if (e.cancelled || e.type !== 'Call Follow-up' || !e.clientId) continue
    const who = new Set([e.createdBy, ...(e.attendees || []), ownerOf(e.clientId)].filter((u) => want.has(u)))
    const today = e.start >= d0 && e.start < d1
    const overdue = e.start < now && e.start > now - 60 * DAY && !((lastCallOf.get(e.clientId) ?? -Infinity) >= e.start)
    for (const u of who) { const n = people[want.get(u)].now; if (today) n.fuToday++; if (overdue) n.fuOverdue++ }
  }
  for (const x of s.calls || []) {
    if (x.direction !== 'Inbound' || isConnected(x) || !want.has(x.madeBy) || !(x.at > now - 14 * DAY)) continue
    if (!((lastOutboundTo.get(x.mobile) ?? -Infinity) > x.at)) people[want.get(x.madeBy)].now.missed++
  }
  for (const t of s.tasks || []) {
    if (!want.has(t.assignedTo) || DECIDED.includes(t.status)) continue
    if (t.due && t.due < d1 && t.due > now - 60 * DAY) people[want.get(t.assignedTo)].now.tasksDue++
  }
  return all ? { asOf: now, people, all } : { asOf: now, people }
}
