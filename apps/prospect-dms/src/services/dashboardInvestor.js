// The Investor DMS share of the combined dashboard (product owner, 27 Nov 2026: one dashboard for both websites).
// Investor DMS's numbers arrive through the bridge (flow F5: counts and amounts per employee ID, never a record;
// services/investorFigures.js). This module adds them up for any group of people and builds the Investor DMS link of
// a figure. In the "Open in" menu of a number, Prospect DMS's own lists come first, then "Investor DMS · …", which
// opens Investor DMS in a new tab on the same period and people; its own access rules apply there.
import { investorLink } from './investorFigures'

const sumArr = (a, b) => (a ? a.map((v, i) => v + (b?.[i] || 0)) : [...(b || [])])
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Several people's figures, added up; every reader below answers 0 when Investor DMS did not answer. */
function addUp(list) {
  const out = { series: {}, prev: {}, now: {}, week: { calls: Array(168).fill(0), conn: Array(168).fill(0) }, outcomes: {} }
  for (const x of list) {
    if (!x) continue
    for (const [k, v] of Object.entries(x.series || {})) out.series[k] = sumArr(out.series[k], v)
    for (const part of ['prev', 'now']) for (const [k, v] of Object.entries(x[part] || {})) out[part][k] = (out[part][k] || 0) + v
    for (const k of ['calls', 'conn']) out.week[k] = sumArr(out.week[k], x.week?.[k])
    for (const [k, v] of Object.entries(x.outcomes || {})) out.outcomes[k] = (out.outcomes[k] || 0) + v
  }
  const total = (a) => (a || []).reduce((t, v) => t + v, 0)
  // calls by hour of the day (every weekday together), from the weekday × hour grid (Monday 0 am = 0)
  const hours = { calls: Array(24).fill(0), conn: Array(24).fill(0) }
  for (const k of ['calls', 'conn']) out.week[k].forEach((v, i) => { hours[k][i % 24] += v })
  return {
    ...out, hours,
    t: (k) => total(out.series[k]), // in the period
    pv: (k) => out.prev[k] || 0, // in the previous period
    n: (k) => out.now[k] || 0, // now (book, pipeline, to-do)
    at: (k, i) => out.series[k]?.[i] || 0, // in one day (or hour) of the period
  }
}

/**
 * @param inv     the page's F5 state: { state: 'loading' | 'ok' | 'off' | 'down' | 'error', data, message }
 * @param f       the filters ({ range, from, to }) - the links open Investor DMS on the same period
 * @param who     the people in view, in Investor DMS's terms ({ people } | { teams } | {})
 * @param codeOf  user id -> employee ID
 */
export function investorFacts(inv, f, who, codeOf) {
  const ok = inv?.state === 'ok'
  const people = ok ? inv.data.people || {} : {}
  const memo = new Map()
  function of(users) {
    const codes = users.map(codeOf).filter(Boolean); const key = codes.join(',')
    if (!memo.has(key)) memo.set(key, addUp(codes.map((c) => people[c])))
    return memo.get(key)
  }
  /** the Investor DMS link of a figure: [] when there is nothing to open */
  function drill(n, open, label, w = who, period = f) {
    return ok && n ? [{ label: `Investor DMS · ${label}`, count: n, to: { href: investorLink(period, w, open) } }] : []
  }
  return {
    ok, state: inv?.state || 'loading', message: inv?.message || '',
    asOf: ok ? inv.data.asOf : null,
    of, drill,
    whoOf: (users) => ({ people: users.map(codeOf).filter(Boolean) }),
    /** a single day of the period as Investor DMS's custom period (an hour cannot be opened there: the whole day) */
    dayOf: (b) => ({ range: 'Custom', from: ymd(b.from), to: ymd(b.from) }),
    /** the company's total over every active IS, for the Money Honey average (null unless asked for) */
    all: ok && inv.data.all ? { ...addUp([inv.data.all]), size: inv.data.all.n || 0 } : null,
  }
}
