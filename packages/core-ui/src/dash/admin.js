// Admin operations cards shared by both dashboards (docs/DASHBOARD_SPEC.md §5). Pure functions over the records a
// website passes in; each website adds its own cards (Unassigned Investors, handover health, exceptions, Junk).
import { DAY, inP, approvalTone, fig } from './rules.js'
import { bars, pendingFigures } from './cards.js'

const ids = (l) => l.map((x) => x.id)
/** The team a person belongs to: the named team of their team leader (Alpha, Beta ...), or "<TL>'s team" when the
 *  team has no name; people above the team leaders are Management. */
export function teamOf(userById, uid) {
  let u = userById(uid)
  for (let i = 0; u && i < 8; i++) {
    if (u.teamName) return u.teamName
    if (u.role === 'TL') return `${u.name}'s team`
    u = userById(u.reportsTo)
  }
  return 'Management'
}

/** Approvals stuck: every pending request by time with the current approver, then by level and by category. */
export function approvalsStuckCards(approvals, userById, open, DEF) {
  const pend = approvals.filter((a) => a.status === 'Pending')
  const levelOf = (a) => userById((a.chain || []).find((s) => s.state === 'Pending')?.userId)?.role || 'Not known'
  const late = (l) => { const r = l.filter((a) => approvalTone(a) === 'red').length; const am = l.filter((a) => approvalTone(a) === 'amber').length; return r || am ? { sub: [am ? `${am} amber` : '', r ? `${r} red` : ''].filter(Boolean).join(' · '), subTone: r ? 'red' : 'amber' } : {} }
  const byLevel = ['TL', 'VP', 'President', 'Admin'].map((lv) => [lv, pend.filter((a) => levelOf(a) === lv)])
  const cats = [...new Set(pend.flatMap((a) => a.categories || [a.category]))].sort()
  const byCat = cats.map((c) => [c, pend.filter((a) => (a.categories || [a.category]).includes(c))])
  return [
    { key: 'adminApprovals', title: 'Approvals stuck', kind: 'figures', info: DEF.adminApprovals, items: pendingFigures(approvals, 'All pending', open) },
    { key: 'adminApprovalsLevel', title: 'Pending by level', kind: 'bars', info: DEF.adminApprovals, empty: 'Nothing pending.', items: byLevel.filter(([, l]) => l.length).map(([lv, l], i) => ({ key: i, ...fig(lv, ids(l), open, { drillLabel: `Pending with ${lv}`, ...late(l) }) })) },
    { key: 'adminApprovalsCat', title: 'Pending by category', kind: 'bars', info: DEF.adminApprovals, empty: 'Nothing pending.', items: byCat.map(([c, l], i) => ({ key: i, ...fig(c, ids(l), open, { drillLabel: `Pending: ${c}`, ...late(l) }) })) },
  ]
}

/** Users: switched on, CRM access off, (Investor DMS) IS without a Data Code, no call in the last 7 days. */
export function usersCard(users, calls, open, DEF, { dataCode = false } = {}) {
  const now = Date.now(); const people = users.filter((u) => u.role !== 'Admin')
  const on = people.filter((u) => u.active !== false)
  const items = [
    fig('Switched on', ids(on), open, { key: 'active', drillLabel: 'Users switched on' }),
    fig('CRM access off', ids(people.filter((u) => u.switches?.dms === false)), open, { key: 'crmOff', drillLabel: 'CRM access off' }),
  ]
  if (dataCode) items.push(fig('IS without Data Code', ids(on.filter((u) => u.role === 'IS' && !(u.dataCodes || []).length)), open, { key: 'noCode', drillLabel: 'IS without a Data Code' }))
  items.push(fig('No call in 7 days', ids(on.filter((u) => !calls.some((c) => c.madeBy === u.id && c.at > now - 7 * DAY))), open, { key: 'noCall', drillLabel: 'No call in the last 7 days' }))
  return { key: 'users', title: 'Users', kind: 'figures', info: DEF.users, cols: 2, items }
}

/** Data quality: records with a member missing PAN, email, date of birth or address; numbers reported in calls. */
export function dataQualityCard(clients, calls, p, openClients, openCalls, DEF, { badNumbers = ['Wrong Number', 'Invalid Number'] } = {}) {
  const miss = (test) => ids(clients.filter((c) => c.members.some((m) => !m.investor && test(m))))
  const val = (m, k) => m[k] || m.extra?.[k]
  const items = [
    fig('No PAN', miss((m) => !val(m, 'pan')), openClients, { key: 'pan', drillLabel: 'A member without PAN' }),
    fig('No email', miss((m) => !(m.emails || []).some((e) => e.email)), openClients, { key: 'email', drillLabel: 'A member without email' }),
    fig('No date of birth', miss((m) => !val(m, 'date_of_birth')), openClients, { key: 'dob', drillLabel: 'A member without date of birth' }),
    fig('No address', miss((m) => !(m.addresses || []).some((a) => a.address || a.city)), openClients, { key: 'address', drillLabel: 'A member without address' }),
    ...badNumbers.map((r) => fig(`${r} (calls)`, ids(calls.filter((c) => c.subStatus === r && inP(c.at, p))), openCalls, { key: r, drillLabel: `Calls reporting ${r}` })),
  ]
  return { key: 'dataQuality', title: 'Data quality', kind: 'figures', info: DEF.dataQuality, items }
}

/** Content Hub: circulars read by X of Y (the IS of this website), quiz participation per team. */
export function contentCards(circ, quiz, users, userById, DEF) {
  const takers = users.filter((u) => u.role === 'IS' && u.active !== false)
  const readers = new Set(takers.map((u) => u.mhf_id))
  const list = (circ.items || []).filter((c) => c.type !== 'Market Update').slice(0, 8)
  const teams = {}; for (const u of takers) (teams[teamOf(userById, u.id)] ||= []).push(u.mhf_id)
  const took = new Set((quiz.items || []).flatMap((q) => (q.attempts || []).map((a) => a.mhfId)))
  return [
    { key: 'contentCirculars', title: 'Circulars read', kind: 'bars', info: DEF.content, empty: circ.loaded ? 'No circulars yet.' : 'Loading circulars…',
      items: list.map((c, i) => { const n = (c.readBy || []).filter((m) => readers.has(m)).length; return { key: i, label: c.title, value: n, fmt: 'n', sub: `of ${takers.length}`, drill: null } }) },
    { key: 'contentQuiz', title: 'Quiz participation', kind: 'bars', info: DEF.content, empty: quiz.loaded ? 'No quizzes yet.' : 'Loading quizzes…',
      items: Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])).map(([t, l], i) => ({ key: i, label: t, value: l.filter((m) => took.has(m)).length, sub: `of ${l.length}`, drill: null })) },
  ]
}
