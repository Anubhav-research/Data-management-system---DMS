// Fixed sample data for the dashboard lab (#/dashboard-lab, PROMPT_DASHBOARD_REDESIGN.md §2.4). No store, no
// services: every state a component must handle, written out by hand, so the design can be reviewed without
// clicking through real data. Numbers are invented; drill links stay on the lab page.
const to = { path: '/dashboard-lab' }
const drill = (n, label = 'Sample list') => [{ label, count: n, to }]
const drill2 = (a, b) => [{ label: 'Prospects', count: a, to }, { label: 'Leads', count: b, to }]

/** The KPI row: one item per state. */
export const kpiStates = [
  { state: 'Normal', items: [
    { key: 'calls', label: 'Calls', value: 87438, delta: 12, sub: '47,002 connected', spark: [40, 52, 48, 61, 58, 66, 71], listCount: 87438, drill: drill(87438),
      parts: [{ label: 'Prospect DMS', value: 61063, tone: 'blue' }, { label: 'Investor DMS', value: 26375, tone: 'green' }] },
    { key: 'rate', label: 'Connect rate', value: 53.8, fmt: 'pct', delta: -4, sub: '47,002 of 87,438 calls', spark: [55, 54, 56, 52, 53, 54, 53] },
    { key: 'rateGood', label: 'Connect rate (≥ 75%)', value: 78.2, fmt: 'pct', tone: 'green', delta: 3, sub: '1,204 of 1,540 calls' },
    { key: 'talk', label: 'Talk time', value: 11574000, fmt: 'time', delta: 14, sub: '2h 39m per IS a day' },
    { key: 'won', label: 'Deals closed', value: 1302000000, fmt: 'money', delta: 5, sub: '338 deals · win rate 49.9%', listCount: 338, drill: drill(338) },
    { key: 'conv', label: 'Converted', value: 356, delta: 0, sub: 'individuals · 355 groups', listCount: 355, drill: drill(355) },
  ] },
  { state: 'Comparison not meaningful (previous 0 or tiny)', items: [
    { key: 'c1', label: 'Calls', value: 87438, delta: 4571, sub: 'previous period: 19 calls' },
    { key: 'c2', label: 'Converted', value: 12, delta: null, sub: 'previous period: 0' },
    { key: 'c3', label: 'Deals closed', value: 1302000000, fmt: 'money', delta: 32450, sub: 'previous: ₹4,000' },
    { key: 'c4', label: 'Talk time', value: 11574000, fmt: 'time', delta: 999, sub: 'previous: 3 calls' },
  ] },
  { state: 'Negative, zero and missing', items: [
    { key: 'n1', label: 'Calls', value: 0, delta: -100, sub: 'No call yet' },
    { key: 'n2', label: 'Connect rate', value: null, fmt: 'pct', sub: 'No call yet' },
    { key: 'n3', label: 'Deals closed', value: null, fmt: 'money', sub: 'From Investor DMS' },
    { key: 'n4', label: 'Change', value: -12, delta: -40, sub: 'a negative value' },
  ] },
  { state: 'Very large numbers and very long labels', items: [
    { key: 'l1', label: 'Pipeline (planned, not certain until the investor invests)', value: 98765432101, fmt: 'money', sub: '12,834 deals ahead · not certain until invested' },
    { key: 'l2', label: 'Calls made in both websites', value: 123456789, delta: 7, sub: '98,76,543 connected across all teams' },
    { key: 'l3', label: 'Talk time', value: 987654321, fmt: 'time', sub: '274,348h in the period' },
  ] },
]

/** Focus today (ActionList). */
export const actionStates = [
  { state: 'Some to do, some clear', items: [
    { key: 'fuToday', icon: 'lucide-calendar-clock', label: 'Follow-ups due today', hint: 'Calls promised for today', value: 3, listCount: 3, drill: drill(3), parts: [{ label: 'Prospect', value: 0, tone: 'blue' }, { label: 'Investor', value: 3, tone: 'green' }] },
    { key: 'fuOverdue', icon: 'lucide-phone-missed', label: 'Follow-ups overdue', hint: 'Time passed, no call since', value: 516, listCount: 516, drill: drill(516), site: 'P' },
    { key: 'back', icon: 'lucide-hourglass', label: 'About to go back to Pool', hint: 'Prospects and Leads: 7 days or less on a timer', value: 4, tone: 'amber', listCount: 4, drill: drill2(3, 1), site: 'P' },
    { key: 'tasks', icon: 'lucide-list-todo', label: 'Tasks due or overdue', hint: 'Due today, or past due (last 60 days)', value: 0, site: 'P' },
    { key: 'window', icon: 'lucide-message-circle', label: 'Can message now', hint: 'After a Followup call, or they replied', value: 0, site: 'P' },
  ] },
  { state: 'Nothing to do', items: [
    { key: 'a', icon: 'lucide-calendar-clock', label: 'Follow-ups due today', hint: 'Calls promised for today', value: 0 },
    { key: 'b', icon: 'lucide-list-todo', label: 'Tasks due or overdue', hint: 'Due today, or past due', value: 0 },
  ] },
]

const days = (n, f) => Array.from({ length: n }, (_, i) => ({ key: i, label: i === 0 ? `${i + 1} Nov` : String(i + 1), title: `${i + 1} Nov`, partial: i === n - 1, segments: f(i) }))
/** Column charts. */
export const columnStates = [
  { state: 'Normal, two websites', card: { key: 'colA', title: 'Calls per day', kind: 'columns', avg: true, legend: [{ label: 'Prospect DMS', tone: 'p' }, { label: 'Investor DMS', tone: 'i' }],
    columns: days(14, (i) => [{ key: 'p', tone: 'p', label: 'Prospect DMS', value: 9000 + ((i * 731) % 2500), listCount: 9000, drill: drill(9000) }, { key: 'i', tone: 'i', label: 'Investor DMS', value: 3000 + ((i * 377) % 1200) }]) } },
  { state: 'Long empty run (18 days of 0, then 7 busy days)', card: { key: 'colB', title: 'Calls per day', kind: 'columns', avg: true,
    columns: days(28, (i) => [{ key: 'v', tone: 'dark', label: 'Calls', value: i < 18 ? (i % 3 ? 0 : 40) : 14000 + ((i * 911) % 2000) }]) } },
  { state: 'Money axis (₹ lakh)', card: { key: 'colC', title: 'Deals closed per day (₹ lakh)', kind: 'columns', unit: ' L', avg: true, columns: days(10, (i) => [{ key: 'v', tone: 'blue', label: 'Closed', value: [1200, 0, 20000, 450, 3100, 0, 870, 12500, 60, 2300][i] }]) } },
  { state: 'Empty', card: { key: 'colD', title: 'Calls per day', kind: 'columns', columns: days(7, () => [{ key: 'v', tone: 'dark', label: 'Calls', value: 0 }]) } },
]

/** Breakdown bars. */
export const barStates = [
  { state: 'Shares that are all close (bars scaled to the largest, not the total)', card: { key: 'barA', title: 'What they are interested in', kind: 'bars', items: ['Mutual funds', 'Insurance', 'Fixed deposits', 'Bonds', 'PMS', 'Gold'].map((l, i) => ({ key: i, label: l, value: 1500 + i * 40, note: `${15 + (i % 3)}%`, listCount: 1500, drill: drill(1500) })) } },
  { state: 'Very long labels and a large count', card: { key: 'barB', title: 'How calls ended', kind: 'bars', items: [
    { key: 0, label: 'Connected and the client asked to be called back later in the week', value: 2345678, note: '61%', listCount: 2345678, drill: drill(2345678) },
    { key: 1, label: 'Not reachable / switched off / out of coverage area', value: 987654, note: '26%' },
    { key: 2, label: 'Wrong number', value: 12, note: '0%' },
  ] } },
  { state: 'Split rows (two parts each)', card: { key: 'barC', title: 'What was sent', kind: 'bars', legend: [{ label: 'Prospect DMS', tone: 'p' }, { label: 'Investor DMS', tone: 'i' }], items: [
    { key: 0, label: 'WhatsApp', note: '74%', segments: [{ key: 'p', label: 'Prospect DMS', tone: 'p', value: 4200 }, { key: 'i', label: 'Investor DMS', tone: 'i', value: 1593 }] },
    { key: 1, label: 'Email', note: '26%', segments: [{ key: 'p', label: 'Prospect DMS', tone: 'p', value: 1300 }, { key: 'i', label: 'Investor DMS', tone: 'i', value: 760 }] },
  ] } },
  { state: 'Empty', card: { key: 'barD', title: 'Lost from the pipeline', kind: 'bars', items: [], empty: 'Nothing lost in this period.' } },
]

/** Share of a whole (today a donut). */
export const donutStates = [
  { state: 'Normal', card: { key: 'donA', title: 'How deals ended', kind: 'donut', caption: 'deals', items: [
    { key: 'a', label: 'Closed', tone: 'good', value: 150, listCount: 150, drill: drill(150) }, { key: 'b', label: 'Rejected', tone: 'crit', value: 31 },
    { key: 'c', label: 'Expired', tone: 'warn', value: 159 }, { key: 'd', label: 'Scheduled', tone: 'gray', value: 34 }] } },
  { state: 'Long labels in a narrow card', card: { key: 'donB', title: 'Delivery', kind: 'donut', caption: 'sent', items: [
    { key: 'a', label: 'Read by the client on WhatsApp', value: 2097 }, { key: 'b', label: 'Delivered but not read yet', value: 1228 }, { key: 'c', label: 'Sent', value: 474 }, { key: 'd', label: 'Failed', tone: 'crit', value: 245 }] } },
  { state: 'Empty', card: { key: 'donC', title: 'Investors by status', kind: 'donut', items: [], empty: 'No investor.' } },
]

/** Rate against the 75% benchmark (today a gauge). */
export const gaugeStates = [
  { state: 'Below 75%', card: { key: 'gA', title: 'Connect rate', kind: 'gauge', value: 53.8, target: 75, label: '47,002 of 87,438 calls connected', listCount: 87438, drill: drill(87438),
    parts: [{ label: 'Prospect DMS', value: 52.1, tone: 'p' }, { label: 'Investor DMS', value: 57.6, tone: 'i' }] } },
  { state: 'At or above 75%', card: { key: 'gB', title: 'Connect rate', kind: 'gauge', value: 81.4, target: 75, label: '814 of 1,000 calls connected' } },
  { state: 'No calls', card: { key: 'gC', title: 'Connect rate', kind: 'gauge', value: null, target: 75, label: 'No calls in this period' } },
]

const H = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
/** Heat table. */
export const heatStates = [
  { state: 'Normal, with too-few-calls cells', card: { key: 'hA', title: 'When clients pick up', kind: 'heatmap', min: 5, rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    cols: H.map((h) => ({ h, label: `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}` })),
    cells: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((_, r) => H.map((h, k) => { const calls = r === 5 ? (k % 4) : 20 + ((r * 7 + k * 13) % 60); return { calls, conn: Math.round(calls * (0.35 + (((r + 2) * (k + 3)) % 30) / 100)), listCount: calls, drill: drill(calls) } })) } },
  { state: 'No calls', card: { key: 'hB', title: 'When clients pick up', kind: 'heatmap', rows: ['Mon', 'Tue'], cols: H.slice(0, 6).map((h) => ({ h, label: `${h}` })), cells: [H.slice(0, 6).map(() => null), H.slice(0, 6).map(() => null)] } },
]

/** Steps (first call to deal). */
export const stepStates = [
  { state: 'Normal', card: { key: 'stA', title: 'From first call to deal', kind: 'steps', ratios: false, items: [
    { key: 'a', label: 'Called in Pool', site: 'P', value: 4365, sub: 'records called while in the Pool', listCount: 4365, drill: drill(4365) },
    { key: 'b', label: 'Taken from Pool', site: 'P', value: 1002, sub: 'to Prospect or Lead', listCount: 1002, drill: drill(1002) },
    { key: 'c', label: 'Converted', site: 'P', value: 159, sub: 'individuals → Investor DMS' },
    { key: 'd', label: 'Deals planned', site: 'I', value: 374, sub: 'meetings in the period' },
    { key: 'e', label: 'Deals closed', site: 'I', value: 150, sub: '₹2.8Cr' }] } },
  { state: 'Figures unavailable (flow F5 off)', card: { key: 'stB', title: 'From first call to deal', kind: 'steps', ratios: false, items: [
    { key: 'a', label: 'Called in Pool', site: 'P', value: 4365, sub: 'records called while in the Pool' },
    { key: 'd', label: 'Deals planned', site: 'I', value: null, sub: 'Investor DMS' },
    { key: 'e', label: 'Deals closed', site: 'I', value: null, sub: 'Investor DMS' }] } },
]

/** Figures (number tiles) and a people table. */
export const figureStates = [
  { state: 'Tiles with status colours', card: { key: 'fA', title: 'Needs a call soon', kind: 'figures', cols: 2, items: [
    { key: 'a', label: 'Back to Pool in 7 days or less', value: 14, tone: 'amber', listCount: 14, drill: drill(14) }, { key: 'b', label: 'Not called in 60 days', value: 233 },
    { key: 'c', label: 'Approvals over 3 days', value: 2, tone: 'red' }, { key: 'd', label: 'Held now', value: 1204 }] } },
]
export const tableStates = [
  { state: 'People, A–Z, totals', card: { key: 'tA', title: 'People', kind: 'table', columns: [
    { key: 'calls', label: 'Calls', group: 'Calling' }, { key: 'rate', label: 'Connect rate', group: 'Calling', fmt: 'pct' }, { key: 'talk', label: 'Talk time', group: 'Calling', fmt: 'time' },
    { key: 'taken', label: 'Taken from Pool', group: 'Results' }, { key: 'conv', label: 'Converted', group: 'Results' }],
    rows: [['Aarav Shah', 'MHF500101', 812, 54.1, 98000, 31, 4], ['Bhavna Iyer', 'MHF500102', 640, 77.0, 120000, 22, 6], ['Chirag Rao with a very long name for wrapping', 'MHF500103', 0, null, 0, 0, 0]]
      .map(([name, code, calls, rate, talk, taken, conv]) => ({ id: code, name, code, cells: { calls: { value: calls, listCount: calls, drill: calls ? drill(calls) : null }, rate: { value: rate, tone: rate >= 75 ? 'green' : null }, talk: { value: talk }, taken: { value: taken }, conv: { value: conv } } })),
    total: { calls: { value: 1452 }, rate: { value: 64.0 }, talk: { value: 218000 }, taken: { value: 53 }, conv: { value: 10 } } } },
]

/** Page-level notices (the other website's figures). */
export const noticeStates = [
  { state: 'Loading Investor DMS figures', message: { icon: 'lucide-loader-circle', loading: true, text: 'Getting the Investor DMS numbers for these people…' } },
  { state: 'Flow switched off by Admin', message: { tone: 'amber', icon: 'lucide-plug-zap', text: 'Investor DMS figures are switched off by Admin.' } },
  { state: 'Investor DMS not answering', message: { tone: 'amber', icon: 'lucide-cloud-off', text: 'Investor DMS is not answering. Its numbers are left out until it is back.' } },
]
