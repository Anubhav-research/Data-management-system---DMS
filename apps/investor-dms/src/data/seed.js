// Investor DMS seed. Fictional demonstration data. No real customer information is used.
// Only people registered on the Transaction Platform live here: the one-time migration seed (D07 §9) with new
// Family IDs (FAM-M.....) and the fixed demo families FAM-009xx, which exist by value in Prospect DMS too.
// All names, numbers, emails and PANs are generated. Dates are relative to "now".
import { DAY, now } from '@/utils/format'
import { CITIES, LANGUAGES, DEFAULT_SWITCHES, PRODUCT_INTEREST } from './masters'

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const r = rng(20261105)
const pick = (a) => a[Math.floor(r() * a.length)]
const int = (a, b) => a + Math.floor(r() * (b - a + 1))
const ago = (d, h = 0) => now() - d * DAY - h * 3600000
const ahead = (d, h = 0) => now() + d * DAY + h * 3600000

const FIRST = ['Aarav', 'Vivaan', 'Ishaan', 'Kabir', 'Reyansh', 'Arnav', 'Dhruv', 'Kiaan', 'Ritvik', 'Yash', 'Aditi', 'Ananya', 'Diya', 'Ira', 'Kavya', 'Meera', 'Nisha', 'Pooja', 'Riya', 'Sanya', 'Tanvi', 'Uma', 'Varun', 'Harsh', 'Karan', 'Mohit', 'Nikhil', 'Omkar', 'Pranav', 'Rohan', 'Sameer', 'Tarun', 'Gaurav', 'Himanshu', 'Jatin', 'Lalit', 'Manav', 'Deepa', 'Shreya', 'Asha', 'Bhavna', 'Charu', 'Esha', 'Farhan', 'Girish', 'Hemant', 'Indu', 'Jaya', 'Kunal', 'Lata']
const LAST = ['Sharma', 'Verma', 'Gupta', 'Patel', 'Iyer', 'Nair', 'Reddy', 'Kapoor', 'Desai', 'Joshi', 'Kulkarni', 'Menon', 'Bose', 'Chopra', 'Malhotra', 'Pillai', 'Saxena', 'Trivedi', 'Pandey', 'Bhat', 'Rao', 'Shetty', 'Agarwal', 'Mishra']
const SOURCES = ['Facebook Ad', 'Referral', 'Direct', 'Event – Mumbai 2025', 'Website Form', 'Google Ads', 'Purchased List', 'Partner Leads', 'Webinar – Q3', 'Instagram Ad', 'Walk-in', 'Campaign Q3']

let mobileSeq = 0
function mobile() { mobileSeq++; return String(7000000000 + int(10000000, 99999999) * 10 + (mobileSeq % 10)).slice(0, 10) }
function pan(letter = 'P') { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; return `${pick(L)}${pick(L)}${pick(L)}${letter}${pick(L)}${int(1000, 9999)}${pick(L)}` }

// ---------------- Users / hierarchy (D01 §4.1) ----------------
const U = (id, name, mhf, role, reportsTo, extra = {}) => ({
  id, name, mhf_id: mhf, role, reportsTo,
  active: true, availability: 'Present', dataCodes: [], switches: { ...DEFAULT_SWITCHES[role] }, ...extra,
})
export const seedUsers = () => [
  U('u_admin', 'James Wilson', 'MHF500001', 'Admin', null),
  // President, VP and TL also keep a personal book and work as an Investment Specialist, so each has a Data Code
  U('u_pres', 'Robert Brown', 'MHF500002', 'President', 'u_admin', { dataCodes: ['INS500002'] }),
  U('u_vp', 'Emma Clark', 'MHF500003', 'VP', 'u_pres', { dataCodes: ['INS500003'] }),
  U('u_tl1', 'David Miller', 'MHF500004', 'TL', 'u_vp', { dataCodes: ['INS500004'] }),
  U('u_tl2', 'Sarah Lee', 'MHF500005', 'TL', 'u_vp', { dataCodes: ['INS500005'] }),
  U('u_is1', 'John Smith', 'MHF500007', 'IS', 'u_tl1', { dataCodes: ['INS500001', 'INS500010'] }),
  U('u_is2', 'Emily Davis', 'MHF500011', 'IS', 'u_tl1', { dataCodes: ['INS500038'] }),
  U('u_is3', 'Mark Taylor', 'MHF500077', 'IS', 'u_tl1', { dataCodes: ['INS500077'] }),
  U('u_is4', 'Tom Harris', 'MHF500031', 'IS', 'u_tl2', { dataCodes: ['INS500031'] }),
  U('u_is5', 'Anna White', 'MHF500051', 'IS', 'u_tl2', { dataCodes: ['INS500051', 'INS500022'] }),
  U('u_is6', 'Kevin Moore', 'MHF500090', 'IS', 'u_tl2', { dataCodes: [], active: false }),
]

// ---------------- Clients ----------------
let idSeq = 0
function person(first, last, rel = 'Primary', opts = {}) {
  const [city, state] = pick(CITIES)
  const m = mobile()
  return {
    key: opts.key || 'p',
    first_name: first, middle_name: '', last_name: last,
    gender: opts.gender || (['Aditi', 'Ananya', 'Diya', 'Ira', 'Kavya', 'Meera', 'Nisha', 'Pooja', 'Riya', 'Sanya', 'Tanvi', 'Uma', 'Deepa', 'Shreya', 'Asha', 'Bhavna', 'Charu', 'Esha', 'Indu', 'Jaya', 'Lata'].includes(first) ? 'Female' : 'Male'),
    language: opts.language || pick(LANGUAGES.slice(0, 6)),
    relationship: rel,
    pan: opts.pan || '',
    date_of_birth: opts.dob || '',
    contacts: [{ id: 'c' + ++idSeq, type: 'Residence', mobile: m, is_whatsapp: r() > 0.25 }, ...(r() > 0.6 ? [{ id: 'c' + ++idSeq, type: 'Office', mobile: mobile(), is_whatsapp: false }] : [])],
    emails: r() > 0.3 ? [{ id: 'e' + ++idSeq, email: `${first.toLowerCase()}.${last.toLowerCase()}${int(1, 99)}@examplemail.in` }] : [],
    addresses: [{ id: 'a' + ++idSeq, type: 'Present', address: `${int(1, 220)}, ${pick(['MG Road', 'Station Road', 'Park Street', 'Lake View', 'Hill Road'])}`, city, pin: String(int(110001, 799999)), state, country: 'India' }],
    product: opts.product || PRODUCT_INTEREST.filter(() => r() > 0.7).map((p) => p.key).slice(0, 3),
    extra: {},
    city, state,
  }
}
let clientSeq = 100
let famSeq = 0 // DECISION-28 (default, confirm): migrated investors get new Family IDs FAM-M.....; Prospect DMS has no family for them (§7.2.3)
function client(stage, extra = {}) {
  clientSeq++
  const first = pick(FIRST), last = pick(LAST)
  const p = person(first, last, 'Primary', { pan: stage === 'Investor' || stage === 'Unassigned' || r() > 0.6 ? pan('P') : '' })
  const members = [p]
  if (r() > 0.55) {
    const rels = ['Brother', 'Sister', 'Spouse', 'Father', 'Son', 'Reference']
    const n = int(1, 2)
    for (let i = 0; i < n; i++) members.push(person(pick(FIRST), last, pick(rels), { key: 'm' + (i + 1) }))
  }
  return {
    id: `CRM-LEAD-2026-${String(clientSeq).padStart(5, '0')}`,
    familyId: `FAM-M${String(++famSeq).padStart(5, '0')}`,
    stage, members,
    poolState: 'Active', inactiveUntil: null, batchOf: null,
    assignedTo: null, sourceIs: null, dataCode: null, prevDataCode: null,
    takeoverDate: null, lastCallAt: null, callStatus: null,
    invStatus: null, invClockStart: null, lastInvDate: null, lastInvProduct: null, lastInvAmount: null, aum: null, cid: null,
    unassignedSince: null, totalCalls: 0,
    source: 'Migration (D07 §9)', importDate: ago(int(400, 900)),
    movedFrom: null, movedOn: null, movedBy: null,
    msgWindowUntil: null, replyWindowUntil: null,
    counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 },
    ownershipHistory: [], documents: [],
    createdAt: ago(int(30, 400)),
    ...extra,
  }
}

export function seedClients() {
  const list = []
  // Investors (one-time migration seed)
  const inv = [['u_is1', 'INS500001', 6], ['u_is1', 'INS500010', 2], ['u_is2', 'INS500038', 4], ['u_is3', 'INS500077', 3], ['u_is4', 'INS500031', 3], ['u_is5', 'INS500051', 3]]
  let cid = 10490
  for (const [u, dc, n] of inv) {
    for (let i = 0; i < n; i++) {
      const status = pick(['Active', 'Active', 'Inactive', 'Prospect'])
      const lastInv = status === 'Active' ? ago(int(5, 170)) : status === 'Inactive' ? ago(int(190, 530)) : null
      list.push(client('Investor', {
        assignedTo: u, sourceIs: u, dataCode: dc, cid: 'CID' + ++cid, invStatus: status,
        invClockStart: status === 'Prospect' ? ago(int(5, 85)) : lastInv, lastInvDate: lastInv,
        lastInvProduct: lastInv ? pick(['MF Equity', 'MF Debt', 'FD', 'NCD']) : null, lastInvAmount: lastInv ? int(1, 20) * 25000 : null,
        aum: lastInv ? int(2, 60) * 100000 : 0, lastCallAt: ago(int(1, 60)), callStatus: pick(['Followup', 'Interested', 'Passive Communication', 'Not Interested']),
        takeoverDate: ago(int(100, 600)),
        ownershipHistory: [{ userId: u, dataCode: dc, from: ago(int(200, 600)), to: null }],
      }))
    }
  }
  // Unassigned (system moved)
  for (let i = 0; i < 6; i++) {
    const st = i % 3 === 0 ? 'Prospect' : 'Inactive'
    list.push(client('Unassigned', {
      invStatus: st, cid: 'CID' + ++cid, sourceIs: pick(['u_is2', 'u_is4', 'u_is6']), prevDataCode: pick(['INS500038', 'INS500031', 'INS500090']),
      lastInvDate: st === 'Inactive' ? ago(int(545, 700)) : null, lastInvProduct: st === 'Inactive' ? pick(['MF Equity', 'MF Debt', 'FD']) : null,
      lastInvAmount: st === 'Inactive' ? int(2, 20) * 25000 : null, aum: st === 'Inactive' ? int(2, 30) * 100000 : 0,
      totalCalls: int(0, 15), lastCallAt: r() > 0.3 ? ago(int(20, 200)) : null, unassignedSince: ago(int(0, 40)),
    }))
  }
  // Junk
  // Junk: only from Unassigned Investors (split prompt §7.2.2)
  // junked from Unassigned, so they invested once (Inactive) and had a specialist before
  for (let i = 0; i < 3; i++) list.push(client('Junk', { movedFrom: 'Unassigned', movedOn: ago(int(1, 60)), movedBy: 'Admin', totalCalls: int(0, 30), cid: 'CID' + ++cid, ...pick([{ sourceIs: 'u_is2', prevDataCode: 'INS500038' }, { sourceIs: 'u_is4', prevDataCode: 'INS500031' }]), invStatus: 'Inactive',
    lastInvDate: ago(int(560, 900)), lastInvProduct: pick(['MF Equity', 'MF Debt', 'FD']), lastInvAmount: int(2, 20) * 25000, aum: int(6, 25) * 100000 })) // AUM above the last investment (max ₹5L)

  // Every person in an investor group is registered on the platform: own PAN and CID, verified (D03 §25.3)
  for (const c of list) {
    c.id = c.cid // the record ID is the investor primary's CID
    c.members.forEach((m, i) => { if (!m.pan) m.pan = pan('P'); m.extra = { ...(m.extra || {}), pan: m.pan }; m.panVerified = true; m.cid = i === 0 ? c.cid : 'CID' + ++cid })
    c.verifiedKeys = c.members.map((m) => m.key)
  }
  list.push(...demoInvestors())
  return list
}

// ---------------- Fixed demo families (by value the same Family IDs as in Prospect DMS) ----------------
const fixedInvestor = (first, last, o) => {
  const p = person(first, last, 'Primary', { gender: o.gender, language: o.language, pan: o.pan, product: o.product || [] })
  p.contacts = [{ id: `c-${o.mobile}`, type: 'Residence', mobile: o.mobile, is_whatsapp: true }]
  p.emails = []; p.extra = { pan: o.pan, nationality: 'Indian' }; p.panVerified = true; p.cid = o.cid
  return p
}
const addMonths = (t, m) => { const d = new Date(t); d.setMonth(d.getMonth() + m); return d.getTime() }
function fixedGroup(cidv, familyId, stage, member, extra) {
  return {
    id: cidv, cid: cidv, familyId, stage, members: [member], verifiedKeys: ['p'],
    poolState: null, inactiveUntil: null, batchOf: null, assignedTo: null, sourceIs: null, dataCode: null, prevDataCode: null,
    takeoverDate: ago(500), lastCallAt: ago(20), callStatus: 'Followup', invStatus: 'Inactive', invClockStart: null, lastInvDate: null, lastInvProduct: null, lastInvAmount: null, aum: 0,
    unassignedSince: null, totalCalls: 3, source: 'Prospect DMS', importDate: ago(500), movedFrom: null, movedOn: null, movedBy: null,
    msgWindowUntil: null, replyWindowUntil: null, counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [], documents: [], createdAt: ago(500),
    ...extra,
  }
}
function demoInvestors() {
  const at18 = addMonths(now(), -18) // exactly 18 months without investment: "Run daily jobs" moves it to Unassigned (demo step 7)
  return [
    fixedGroup('CID60901', 'FAM-00901', 'Investor', fixedInvestor('Deepak', 'Shah', { gender: 'Male', language: 'Gujarati', pan: 'DPKPS9011D', mobile: '9876505001', cid: 'CID60901', product: ['pi_fd'] }),
      { assignedTo: 'u_is1', sourceIs: 'u_is1', dataCode: 'INS500001', invStatus: 'Inactive', lastInvDate: at18, invClockStart: at18, lastInvProduct: 'FD', lastInvAmount: 100000, aum: 300000, platformFamilyId: 'PF-20901', handoverIds: ['HND-20250512-0001'],
        ownershipHistory: [{ userId: 'u_is1', dataCode: 'INS500001', from: ago(549), to: null }] }),
    fixedGroup('CID60902', 'FAM-00902', 'Investor', fixedInvestor('Lakshmi', 'Iyer', { gender: 'Female', language: 'Tamil', pan: 'LKSPI9022L', mobile: '9876506001', cid: 'CID60902', product: ['pi_mf_equity'] }),
      { assignedTo: 'u_is2', sourceIs: 'u_is2', dataCode: 'INS500038', invStatus: 'Active', lastInvDate: ago(40), invClockStart: ago(40), lastInvProduct: 'MF Equity', lastInvAmount: 200000, aum: 900000, platformFamilyId: 'PF-20902', handoverIds: ['HND-20260315-0002'],
        ownershipHistory: [{ userId: 'u_is2', dataCode: 'INS500038', from: ago(242), to: null }] }),
    // Duplicate-investor case (TS-16): migrated earlier; Prospect DMS still has him as a Prospect
    fixedGroup('CID60070', 'FAM-M90001', 'Investor', fixedInvestor('Vijay', 'Rao', { gender: 'Male', language: 'Kannada', pan: 'VJYPR7777V', mobile: '9876508001', cid: 'CID60070' }),
      { assignedTo: 'u_is1', sourceIs: 'u_is1', dataCode: 'INS500010', invStatus: 'Active', lastInvDate: ago(30), invClockStart: ago(30), lastInvProduct: 'MF Debt', lastInvAmount: 75000, aum: 75000, platformFamilyId: 'PF-30070',
        ownershipHistory: [{ userId: 'u_is1', dataCode: 'INS500010', from: ago(400), to: null }] }),
    fixedGroup('CID60903', 'FAM-00903', 'Unassigned', fixedInvestor('Harish', 'Bose', { gender: 'Male', language: 'Bengali', pan: 'HRSPB9033H', mobile: '9876507001', cid: 'CID60903' }),
      { sourceIs: 'u_is4', prevDataCode: 'INS500031', invStatus: 'Inactive', lastInvDate: ago(560), lastInvProduct: 'MF Debt', lastInvAmount: 50000, aum: 150000, unassignedSince: ago(14), platformFamilyId: 'PF-20903', handoverIds: ['HND-20241104-0003'] }),
  ]
}

// ---------------- Activity-bearing objects ----------------
export function seedRelated(clients, users) {
  const calls = [], events = [], notes = [], tasks = [], deals = [], wa = [], emails = [], activities = []
  let n = 0
  const nameOf = (c) => `${c.members[0].first_name} ${c.members[0].last_name}`
  for (const c of clients) {
    if (!['Prospect', 'Lead', 'Investor'].includes(c.stage)) continue
    const owner = c.assignedTo
    const k = int(1, 4)
    for (let i = 0; i < k; i++) {
      const connected = r() > 0.3
      const at = (c.lastCallAt || ago(5)) - i * int(2, 9) * DAY
      calls.push({
        id: 'CL-' + ++n, clientId: c.id, stageAtCall: c.stage, direction: r() > 0.8 ? 'Inbound' : 'Outbound',
        mobile: c.members[0].contacts[0].mobile, at, duration: connected ? int(20, 600) : 0,
        status: connected ? 'Connected' : 'Not Connected', subStatus: connected ? (i === 0 && c.callStatus ? c.callStatus : pick(['Followup', 'Disconnected', 'Not Interested'])) : pick(['Ringing', 'Busy', 'Switched Off']),
        clientName: nameOf(c), comment: connected ? pick(['Client asked for a call back next week to discuss options.', 'Discussed FD rates; client comparing with bank.', 'Client busy, requested evening call.', 'Shared overview of debt funds; client interested in details.']) : '',
        madeBy: owner, recording: connected,
      })
    }
    c.totalCalls = k
    activities.push({ id: 'A-' + ++n, clientId: c.id, at: c.takeoverDate || c.createdAt, actor: owner, type: 'stage', text: `Moved to ${c.stage}` })
    if (r() > 0.4) {
      const t = ahead(int(0, 12), int(1, 8))
      events.push({ id: 'EV-' + ++n, clientId: c.id, type: pick(['Call Follow-up', 'Call Follow-up', 'Video Conference', 'In-Person Meeting']), title: pick(['Portfolio review call', 'Follow up on FD', 'KYC & asset allocation', 'SIP discussion']), allDay: false, start: t, end: t + 3600000, clientNames: [nameOf(c)], attendees: [owner], description: '', createdBy: owner, createdAt: ago(int(1, 20)) })
    }
    if (r() > 0.6) notes.push({ id: 'NT-' + ++n, clientId: c.id, title: pick(['2nd call', 'Prefers Hindi', 'Risk profile', 'Family details']), content: pick(['Showed interest in debt funds.', 'Call only after 6 pm.', 'Moderate risk appetite; prefers FDs.', 'Brother handles finances.']), createdBy: owner, createdAt: ago(int(1, 60)), updatedAt: ago(int(0, 30)), pinnedHome: false, pinnedClient: false })
    if (c.stage === 'Investor' && r() > 0.3) {
      const st = pick(['Scheduled', 'Scheduled', 'Completed', 'Rejected'])
      const when = st === 'Scheduled' ? ahead(int(1, 25), int(1, 6)) : ago(int(5, 60))
      const rows = [{ product: 'FD', company: 'Bajaj Finance', tenure: '3 Years', amount: 75000 }, ...(r() > 0.5 ? [{ product: 'MF Equity', amc: '360 ONE Mutual Fund', scheme: '360 ONE Quant Fund - Regular', amount: 50000 }] : [])]
      deals.push({ id: 'DL-' + ++n, clientId: c.id, allDay: false, start: when, end: when + 3600000, rows, total: rows.reduce((s, x) => s + x.amount, 0), status: st, finalAmount: st === 'Completed' ? 75000 : null, remark: st === 'Completed' ? 'Client invested ₹75,000 in FD after discussion.' : st === 'Rejected' ? 'Customer dropped their plan.' : '', createdBy: owner, updatedAt: ago(int(0, 30)) })
    }
    if (c.stage !== 'Pool' && r() > 0.5) {
      const tpl = pick(['followup_intro_v1', 'portfolio_rebalance_v2', 'sip_reminder_alert'])
      const wnum = c.members[0].contacts.find((x) => x.is_whatsapp)?.mobile || c.members[0].contacts[0].mobile
      wa.push({ id: 'WA-' + ++n, clientId: c.id, stage: c.stage, mobile: wnum, at: ago(int(0, 10), int(0, 12)), direction: 'Sent', type: 'Template', template: tpl, body: 'Hello, thank you for speaking with Money Honey today.', status: pick(['Read', 'Delivered', 'Sent', 'Failed']), sentBy: owner })
      if (r() > 0.6) wa.push({ id: 'WA-' + ++n, clientId: c.id, stage: c.stage, mobile: wnum, at: ago(0, int(1, 10)), direction: 'Received', type: 'Free Text', template: null, body: 'Thanks, please share details.', status: 'Received', sentBy: owner })
    }
    if (c.members[0].emails.length && r() > 0.6) {
      emails.push({ id: 'EM-' + ++n, clientId: c.id, stage: c.stage, email: c.members[0].emails[0].email, at: ago(int(0, 15), int(0, 10)), direction: 'Sent', type: 'Template', template: 'meeting_followup', subject: 'Follow-up on our call', body: 'Thank you for your time today.', status: pick(['Opened', 'Delivered', 'Sent', 'Bounced']), sentBy: owner })
    }
  }
  // Tasks (D05 §3)
  const T = (title, status, priority, due, assignedTo, createdBy, remark = '') => ({ id: 'TK-' + ++n, title, description: '', status, priority, due, assignedTo, createdBy, remark, createdAt: ago(int(3, 40)), updatedAt: ago(int(0, 20)) })
  tasks.push(
    T('Check all renewals for this month', 'In Progress', 'High', ahead(3), 'u_is1', 'u_tl1'),
    T('Call investors due for SIP renewal', 'To-Do', 'Medium', ahead(1, 4), 'u_is1', 'u_is1'),
    T('Prepare FD rate comparison', 'Completed', 'Low', ago(4), 'u_is2', 'u_tl1', 'Shared comparison sheet with the team.'),
    T('Diwali greeting call list', 'Expired', 'Low', ago(10), 'u_is1', 'u_tl1'),
    T('Review team call quality', 'To-Do', 'High', ahead(5), 'u_tl1', 'u_tl1'),
    T('Update investor contact details', 'Rejected', 'Medium', ago(2), 'u_is3', 'u_tl1', 'Client not reachable; reassigned to next week.'),
  )
  // General notes
  notes.push({ id: 'NT-' + ++n, clientId: null, title: 'Team targets', content: 'Review Inactive investors before month end.', createdBy: 'u_is1', createdAt: ago(21), updatedAt: ago(21), pinnedHome: true, pinnedClient: false })
  // Internal meeting (no client)
  events.push({ id: 'EV-' + ++n, clientId: null, type: 'Internal Meeting', title: 'Weekly team huddle', allDay: false, start: ahead(1, 2), end: ahead(1, 3), clientNames: [], attendees: ['u_is1', 'u_tl1'], description: '', createdBy: 'u_tl1', createdAt: ago(2) })
  return { calls, events, notes, tasks, deals, wa, emails, activities }
}

export function seedPoolSources() { return [] } // Pool Source Visibility is a Prospect DMS screen

export function seedImports() { return [] } // Data Import is a Prospect DMS screen

/** No seeded change requests in Investor DMS. */
export function seedApprovals() { return [] }

export function seedNotifications() {
  return [
    { id: 'N-s2', to: 'u_is1', code: 'N-05', text: 'David Miller assigned you a task: Check all renewals for this month. Due in 3 days.', link: { path: '/tasks' }, filterIds: null, at: ago(1), read: false, tab: 'All' },
  ]
}

export function seedTransfers() {
  return [
    { id: 'TR-2', at: ago(4, 6), from: 'u_is6', to: [{ userId: 'u_is5', codes: ['INS500022'], investors: 200 }], movedBy: 'u_admin' },
    { id: 'TR-1', at: ago(5, 2), from: 'u_is4', to: [{ userId: 'u_is1', codes: ['INS500010'], investors: 300 }], movedBy: 'u_admin' },
  ]
}
