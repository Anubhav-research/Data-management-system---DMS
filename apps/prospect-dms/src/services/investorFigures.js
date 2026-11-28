// F5 Investor figures (product owner, 27 Nov 2026): the "Investor DMS" part of this website's dashboard. Investor DMS
// answers, through the bridge, numbers per employee ID only - no client, no record. A click on one of these numbers
// opens Investor DMS (a new tab) on its own dashboard for the same period and people, which opens the list behind
// the number there; Investor DMS applies its own sign-in and access rules.
import { bridge } from './bridge'
import { useDb } from '@/stores/db'

/** Investor DMS's address: the same machine on its own port (npm run dev:all), or ../investor/ (GitHub Pages demo). */
export function investorBase() {
  // eslint-disable-next-line no-undef
  const ports = typeof __DMS_PORTS__ !== 'undefined' ? __DMS_PORTS__ : { p: '5175', i: '5176' }
  const { protocol, hostname, port, href } = window.location
  if (port && port === String(ports.p)) return `${protocol}//${hostname}:${ports.i}/`
  return new URL('../investor/', href.split('#')[0]).href
}
/**
 * A link into Investor DMS's dashboard.
 * @param f      the period chosen here: { range, from, to }
 * @param who    { people: [employee ID] } or { teams: [name] } or {} for everyone in the reader's view there
 * @param open   what to open there: a headline / to-do key (e.g. 'won', 'dealsToday') or '<card>.<item>' (e.g. 'atRisk.inactive')
 */
export function investorLink(f, who, open) {
  // encodeURIComponent, not URLSearchParams: the router reads "+" as a plus, not a space ("This month")
  const q = []
  const set = (k, v) => q.push(`${k}=${encodeURIComponent(v)}`)
  if (f?.range) set('range', f.range)
  if (f?.range === 'Custom') { if (f.from) set('from', f.from); if (f.to) set('to', f.to) }
  if (who?.people?.length) set('people', who.people.join(','))
  if (who?.teams?.length) set('teams', who.teams.join(','))
  if (open) set('open', open)
  return `${investorBase()}#/dashboard?${q.join('&')}`
}

// The last answers, kept a few minutes for the same reader and the same request: coming back from a list shows the
// whole dashboard at once instead of Prospect-only numbers that jump when Investor DMS answers (the page still asks
// again in the background, so a new call shows up a moment later).
const KEEP_MS = 5 * 60 * 1000
const recent = new Map() // key -> { at, r }
const keyOf = (req) => { const me = useDb().me; return JSON.stringify([me?.id, me?.role, req]) }
/** The last answer for this request, if it is recent enough; otherwise null. */
export function recentInvestorFigures(req) {
  const x = recent.get(keyOf(req))
  return x && Date.now() - x.at < KEEP_MS ? x.r : null
}

/**
 * Ask the bridge for the figures of these people over these buckets.
 * @param all  also the company's total over all active IS (for the Money Honey average when people are compared)
 * @returns {Promise<{ ok: true, data } | { ok: false, reason: 'off' | 'down' | 'error', message }>}
 */
export async function fetchInvestorFigures(req) {
  const { users, edges, prev, today, all } = req
  if (!users.length || edges.length < 2) return { ok: true, data: { asOf: Date.now(), people: {} } }
  const r = await bridge('POST', '/investor-figures', { users, edges, prev, today, all: !!all })
  if (r.ok) {
    const out = { ok: true, data: r.data }
    recent.set(keyOf(req), { at: Date.now(), r: out })
    if (recent.size > 20) recent.delete(recent.keys().next().value) // oldest first
    return out
  }
  if (r.data?.flowOff) return { ok: false, reason: 'off', message: 'Investor figures (flow F5) are switched off by Admin.' }
  return { ok: false, reason: r.down ? 'down' : 'error', message: r.data?.error || 'Investor DMS figures are not available right now.' }
}
