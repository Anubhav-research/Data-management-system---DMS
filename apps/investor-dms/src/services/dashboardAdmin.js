// Investor DMS dashboard: Admin operations (docs/DASHBOARD_SPEC.md §5), at the bottom, Admin only.
// Product owner, 27 Nov 2026: only the Unassigned Investors queue stays here. Handover health was removed (a verified
// investor moves to the next stage directly), and so were Approvals stuck, Pending by level / category, Exceptions,
// Junk, Users, Data quality, Circulars read and Quiz participation - each has its own page.
import { DEF } from '@/data/dashboardDefinitions'
import * as R from '@mh/core-ui/dash/rules.js'
import { dClients } from './dashboard'

import { dashDb as db } from './dashboard' // the same plain view while the dashboard is worked out
const { DAY, fig } = R
const ids = (l) => l.map((x) => x.id)

export function adminOperations() {
  const s = db(); const now = Date.now()
  const un = s.clients.filter((c) => c.stage === 'Unassigned')
  const reason = (c) => (c.invStatus === 'Prospect' ? '90' : c.reassignedUntil ? '12m' : '18m')
  const age = (c) => Math.floor((now - (c.unassignedSince || now)) / DAY)
  const AGES = [['0–7 days', 0, 7], ['8–30 days', 8, 30], ['31–90 days', 31, 90], ['Over 90 days', 91, Infinity]]
  const cards = [
    { key: 'unassigned', title: 'Unassigned Investors', badge: 'Now', kind: 'figures', info: DEF.unassigned, items: [
      fig('In the queue', ids(un), dClients, { key: 'all', drillLabel: 'Unassigned Investors' }),
      fig('Prospect Investors (90 days)', ids(un.filter((c) => reason(c) === '90')), dClients, { key: '90', drillLabel: 'Unassigned: Prospect Investors (90 days)' }),
      fig('Inactive (18 / 12 months)', ids(un.filter((c) => reason(c) !== '90')), dClients, { key: '18m', drillLabel: 'Unassigned: Inactive (18 / 12 months)' }),
    ] },
    { key: 'unassignedAge', title: 'Unassigned: time in queue', badge: 'Now', kind: 'bars', info: DEF.unassigned, empty: 'The queue is empty.',
      items: AGES.map(([l, a, b], i) => ({ key: i, ...fig(l, ids(un.filter((c) => age(c) >= a && age(c) <= b)), dClients, { drillLabel: `Unassigned ${l}` }) })) },
  ]
  return { key: 'ops', title: 'Admin operations', icon: 'lucide-shield', badge: 'Admin', cols: 2, cards }
}
