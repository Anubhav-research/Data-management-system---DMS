// Dashboard cards that are the same in Prospect DMS and Investor DMS (docs/DASHBOARD_SPEC.md §3 / §4 and the
// approval cards). Pure functions: each website passes its own records, outcome lists, drill-down links and (i) texts.
import { isConnected, talkTime, pct, change, connectTone, approvalTone, fig, figP } from './rules.js'

/** Pending requests split by time with the current approver: all, over 2 days (amber), over 3 days (red). */
export function pendingFigures(list, label, open) {
  const pend = list.filter((a) => a.status === 'Pending')
  const amber = pend.filter((a) => approvalTone(a) === 'amber'); const red = pend.filter((a) => approvalTone(a) === 'red')
  return [
    fig(label, pend.map((a) => a.id), open, { key: 'pending', drillLabel: label }),
    fig('Over 2 days', amber.map((a) => a.id), open, { key: 'amber', tone: amber.length ? 'amber' : null, drillLabel: `${label}: over 2 days` }),
    fig('Over 3 days', red.map((a) => a.id), open, { key: 'red', tone: red.length ? 'red' : null, drillLabel: `${label}: over 3 days` }),
  ]
}
/** One bar per [name, ids]. */
export const bars = (groups, open, label, extra = () => ({})) => groups.map(([name, ids], i) => ({ key: i, ...fig(name, ids, open, { drillLabel: `${label}: ${name}`, ...extra(name, ids) }) }))

/**
 * B / D. Calling (period): calls, talk time, outcomes, inbound vs outbound, by hour, short connected calls (TL+).
 * `c` / `cp` = calls of this and the previous period; `open` = drill to Call Logs.
 */
export function callingCards(c, cp, { outcomes, notConnected, open, tl, DEF }) {
  const conn = c.filter(isConnected); const connP = cp.filter(isConnected)
  const rate = pct(conn.length, c.length); const rateP = pct(connP.length, cp.length)
  const talk = talkTime(c); const talkP = talkTime(cp)
  const avg = conn.length ? Math.round(talk / conn.length) : null; const avgP = connP.length ? Math.round(talkP / connP.length) : null
  const ids = (l) => l.map((x) => x.id)
  const groups = [
    ...outcomes.map((o) => [o, ids(conn.filter((x) => x.subStatus === o))]),
    ...notConnected.map((r) => [`Not connected: ${r}`, ids(c.filter((x) => !isConnected(x) && x.subStatus === r))]),
  ]
  const zero = c.filter((x) => x.status === 'Connected' && !(x.duration > 0))
  if (zero.length) groups.push(['Not connected: 0 seconds', ids(zero)])
  const hours = {}; for (const x of c) (hours[new Date(x.at).getHours()] ||= []).push(x)
  const hourBars = Object.keys(hours).map(Number).sort((a, b) => a - b).map((h) => {
    const l = hours[h]; const r = pct(l.filter(isConnected).length, l.length)
    return { key: h, ...fig(`${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`, ids(l), open, { drillLabel: `Calls ${h}:00–${h + 1}:00`, sub: `${r}%`, subTone: connectTone(r) }) }
  })
  const dir = (l, d) => ids(l.filter((x) => x.direction === d))
  const cards = [
    { key: 'calls', title: 'Calls', kind: 'figures', info: DEF.calls, cols: 2, items: [
      figP('Total', ids(c), ids(cp), open, { key: 'total', drillLabel: 'Calls' }),
      figP('Connected', ids(conn), ids(connP), open, { key: 'connected', drillLabel: 'Connected calls' }),
      figP('Not connected', ids(c.filter((x) => !isConnected(x))), ids(cp.filter((x) => !isConnected(x))), open, { key: 'notConnected', drillLabel: 'Calls not connected', bad: true }),
      { key: 'rate', label: 'Connect rate', value: rate, fmt: 'pct', tone: connectTone(rate), delta: change(rate, rateP), drill: open(ids(conn), 'Connected calls') },
    ] },
    { key: 'talk', title: 'Talk time', kind: 'figures', info: DEF.talk, cols: 2, items: [
      { key: 'total', label: 'Total', value: talk, fmt: 'time', delta: change(talk, talkP), drill: open(ids(conn), 'Connected calls (talk time)') },
      { key: 'avg', label: 'Average per connected call', value: avg, fmt: 'time', delta: change(avg, avgP), drill: open(ids(conn), 'Connected calls (talk time)') },
    ] },
    { key: 'outcomes', title: 'Calls by outcome', kind: 'bars', info: DEF.outcomes, items: bars(groups.filter(([, l]) => l.length), open, 'Calls'), empty: 'No calls in this period.' },
    { key: 'direction', title: 'Inbound vs outbound', kind: 'figures', info: DEF.direction, cols: 2, items: [
      figP('Inbound', dir(c, 'Inbound'), dir(cp, 'Inbound'), open, { key: 'in', drillLabel: 'Incoming calls' }),
      figP('Outbound', dir(c, 'Outbound'), dir(cp, 'Outbound'), open, { key: 'out', drillLabel: 'Outgoing calls' }),
    ] },
    { key: 'byHour', title: 'Calls by hour of day', kind: 'bars', info: DEF.byHour, items: hourBars, empty: 'No calls in this period.' },
  ]
  if (tl) cards.push({ key: 'shortCalls', title: 'Short connected calls', badge: 'TL+', kind: 'figures', info: DEF.shortCalls, cols: 1, items: [
    figP('Under 30 seconds', ids(conn.filter((x) => x.duration < 30)), ids(connP.filter((x) => x.duration < 30)), open, { key: 'short', drillLabel: 'Connected calls under 30 seconds' }),
  ] })
  return cards
}

/** Sum of a team table's columns: counts add up (opening every record of the column); rates and time are left to the caller. */
export function totalsRow(rows, columns, openFor) {
  return Object.fromEntries(columns.map((c) => {
    if (c.fmt === 'text') return [c.key, { value: '' }]
    const ids = [...new Set(rows.flatMap((r) => r[c.key]?.ids || []))]
    const value = rows.reduce((t, r) => t + (typeof r[c.key]?.value === 'number' ? r[c.key].value : 0), 0)
    const open = openFor(c.key)
    return [c.key, { value, ids, listCount: ids.length, drill: open && ids.length ? open(ids, `Team: ${c.label}`) : null }]
  }))
}

// ---------------------------------------------------------------- When clients pick up (design review 27 Nov 2026)
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/**
 * The calls of the period as a weekday × hour grid for the heatmap card (HeatmapChart). Working hours 9 am to 7 pm,
 * widened when calls were made earlier or later; Saturday and Sunday only when someone called then.
 * @param calls  this website's calls ({ at, ... })
 * @param opts   { isConnected, label(hour), open(calls, label) -> drill, add(weekday, hour) -> { calls, conn, drill } }
 *               `add` brings another website's numbers into the same cell (Prospect DMS adds Investor DMS's).
 * @returns { rows: [weekday], cols: [{ h, label }], cells: [[{ calls, conn, listCount, drill }]], best }
 */
export function weekHeat(calls, { isConnected, label, open, add = null, min = null }) {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []))
  for (const x of calls) { const d = new Date(x.at); grid[(d.getDay() + 6) % 7][d.getHours()].push(x) }
  const extra = (r, h) => (add && add(r, h)) || { calls: 0, conn: 0, drill: [] }
  // an hour outside 9 am - 7 pm is shown when real calling happened then (1% of the calls); a cell is judged on a fair
  // number of calls: a tenth of the busiest cell, at least 5 (so a lucky single call is never "the best time")
  const perHour = Array(24).fill(0); let all = 0; let busiest = 0
  for (let r = 0; r < 7; r++) for (let h = 0; h < 24; h++) { const n = grid[r][h].length + extra(r, h).calls; perHour[h] += n; all += n; busiest = Math.max(busiest, n) }
  min = min ?? Math.max(5, Math.round(busiest / 10))
  let from = 9; let to = 19
  for (let h = 0; h < 24; h++) if (perHour[h] && perHour[h] >= all * 0.01) { from = Math.min(from, h); to = Math.max(to, h) }
  const used = (r) => grid[r].some((l) => l.length) || Array.from({ length: 24 }, (_, h) => extra(r, h).calls).some(Boolean)
  const rows = [0, 1, 2, 3, 4, 5, 6].filter((r) => r < 5 || used(r))
  const cols = []; for (let h = from; h <= to; h++) cols.push({ h, label: label(h) })
  let best = null
  const cells = rows.map((r) => cols.map(({ h }) => {
    const l = grid[r][h]; const e = extra(r, h); const callsN = l.length + e.calls; const conn = l.filter(isConnected).length + e.conn
    const cell = { calls: callsN, conn, listCount: callsN, drill: [...(l.length ? open(l, `${WEEKDAYS[r]} ${label(h)}`) : []), ...(e.drill || [])] }
    if (callsN >= min && (!best || conn / callsN > best.rate || (conn / callsN === best.rate && callsN > best.calls))) best = { day: WEEKDAYS[r], hour: label(h), rate: conn / callsN, calls: callsN, drill: cell.drill }
    return cell
  }))
  return { rows: rows.map((r) => WEEKDAYS[r]), cols, cells, min, best: best && { ...best, rate: Math.round(best.rate * 1000) / 10 } }
}
