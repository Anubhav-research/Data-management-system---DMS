// Prospect DMS seed. Fictional demonstration data. No real customer information is used.
// No investors here (they live in Investor DMS). The fixed demo families below match the seeds of tp-sim and
// Investor DMS by value only (Family ID, PAN, mobile) - the two websites share no data at run time.
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
  active: true, availability: 'Present', switches: { ...DEFAULT_SWITCHES[role] }, ...extra,
})
export const seedUsers = () => [
  // Data Codes exist only in Investor DMS (split prompt §12)
  U('u_admin', 'James Wilson', 'MHF500001', 'Admin', null),
  // President, VP and TL also keep a personal book and work as an Investment Specialist, so each has a Data Code
  U('u_pres', 'Robert Brown', 'MHF500002', 'President', 'u_admin'),
  U('u_vp', 'Emma Clark', 'MHF500003', 'VP', 'u_pres'),
  U('u_tl1', 'David Miller', 'MHF500004', 'TL', 'u_vp'),
  U('u_tl2', 'Sarah Lee', 'MHF500005', 'TL', 'u_vp'),
  U('u_is1', 'John Smith', 'MHF500007', 'IS', 'u_tl1'),
  U('u_is2', 'Emily Davis', 'MHF500011', 'IS', 'u_tl1'),
  U('u_is3', 'Mark Taylor', 'MHF500077', 'IS', 'u_tl1'),
  U('u_is4', 'Tom Harris', 'MHF500031', 'IS', 'u_tl2'),
  U('u_is5', 'Anna White', 'MHF500051', 'IS', 'u_tl2'),
  U('u_is6', 'Kevin Moore', 'MHF500090', 'IS', 'u_tl2', { active: false }),
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
let clientSeq = 100 // ids 00101+ ; 00014 is reserved for the Figma anchor record
let familySeq = 100 // FAM-00101+ ; FAM-00014..00025 and FAM-009xx are fixed demo families (the 009xx ones exist by value in Investor DMS too)
/** Permanent Family ID, given when a group is created (split prompt §5.1). Never changes. */
export const famId = (n) => `FAM-${String(n).padStart(5, '0')}`
function client(stage, extra = {}) {
  clientSeq++; familySeq++
  const first = pick(FIRST), last = pick(LAST)
  const p = person(first, last, 'Primary', { pan: r() > 0.6 ? pan('P') : '' })
  const members = [p]
  if (r() > 0.55) {
    const rels = ['Brother', 'Sister', 'Spouse', 'Father', 'Son', 'Reference']
    const n = int(1, 2)
    for (let i = 0; i < n; i++) members.push(person(pick(FIRST), last, pick(rels), { key: 'm' + (i + 1) }))
  }
  return {
    id: `CRM-LEAD-2026-${String(clientSeq).padStart(5, '0')}`,
    familyId: famId(familySeq),
    stage, members,
    poolState: 'Active', inactiveUntil: null, batchOf: null,
    assignedTo: null,
    takeoverDate: null, lastCallAt: null, callStatus: null,
    unassignedSince: null, totalCalls: 0,
    source: pick(SOURCES), importDate: ago(int(5, 300)),
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
  // Pool (lots) - Active/Inactive
  for (let i = 0; i < 70; i++) list.push(client('Pool', { poolState: i % 9 === 0 ? 'Inactive' : 'Active', inactiveUntil: i % 9 === 0 ? ahead(int(3, 25)) : null }))
  // Prospects / Leads per IS
  const owners = [['u_is1', 9, 5], ['u_is2', 5, 3], ['u_is3', 4, 3], ['u_is4', 4, 2], ['u_is5', 3, 2], ['u_tl1', 1, 0]]
  for (const [u, np, nl] of owners) {
    for (let i = 0; i < np; i++) {
      const takeover = ago(int(10, 700))
      const last = Math.min(now(), takeover + int(1, 80) * DAY)
      list.push(client('Prospect', { assignedTo: u, takeoverDate: takeover, lastCallAt: last > now() - 89 * DAY ? last : now() - int(84, 88) * DAY, callStatus: pick(['Followup', 'Not Interested', 'Disconnected', 'Followup']) }))
    }
    for (let i = 0; i < nl; i++) {
      const takeover = ago(int(10, 700))
      list.push(client('Lead', { assignedTo: u, takeoverDate: takeover, lastCallAt: ago(int(1, 86)), callStatus: pick(['Followup', 'Followup', 'Not Interested']) }))
    }
  }
  // Junk
  for (let i = 0; i < 6; i++) list.push(client('Junk', { movedFrom: pick(['Pool', 'Pool', 'Prospect', 'Lead']), movedOn: ago(int(1, 60)), movedBy: pick(['System', 'Admin']), totalCalls: int(0, 30) }))

  // Demo anchor record (Figma "Mr Himanshu", CRM-LEAD-2026-00014) - Prospect of Anubhav with a group
  const h = list.find((c) => c.stage === 'Prospect' && c.assignedTo === 'u_is1')
  h.id = 'CRM-LEAD-2026-00014'; h.familyId = 'FAM-00014'
  h.members = [
    person('Himanshu', 'Kumar', 'Primary', { gender: 'Male', language: 'Hindi', pan: 'ABKPK1234F', product: ['pi_mf_debt', 'pi_fd'] }),
    person('Anubhav', 'Kumar', 'Brother', { key: 'm1', gender: 'Male' }),
    person('Shashank', 'Kumar', 'Reference', { key: 'm2', gender: 'Male' }),
  ]
  h.members[0].contacts = [
    { id: 'c9001', type: 'Residence', mobile: '7862171615', is_whatsapp: true },
    { id: 'c9002', type: 'Office', mobile: '7862181615', is_whatsapp: false },
    { id: 'c9003', type: 'Others', mobile: '7862179615', is_whatsapp: false },
  ]
  h.members[0].emails = [{ id: 'e9001', email: 'himanshu.k@examplemail.in' }]
  h.takeoverDate = ago(40); h.lastCallAt = ago(2); h.callStatus = 'Followup'
  list.push(...demoFamilies())
  return list
}

// ---------------- Fixed demo families (split prompt §11, §15) ----------------
const fixedPerson = (first, last, rel, key, o = {}) => {
  const p = person(first, last, rel, { key, gender: o.gender, language: o.language || 'Hindi', pan: o.pan || '', product: o.product || [] })
  p.contacts = (o.mobiles || []).map((m, i) => ({ id: `c-${key}-${m}`, type: i ? 'Office' : 'Residence', mobile: m, is_whatsapp: i === 0 }))
  p.emails = o.email ? [{ id: `e-${key}-${first}`, email: o.email }] : []
  if (o.dob) p.date_of_birth = o.dob
  p.extra = { pan: o.pan || '', nationality: 'Indian', ...(o.dob ? { date_of_birth: o.dob } : {}) }
  return p
}
/** A member converted earlier: only name, Investor tag, handover ID and conversion date remain (DECISION-13, mode "remove"). */
// cid / platformFamilyId: the investor's Client ID and platform family, as Investor DMS holds them (CID6090x / PF-2090x)
const investorStub = (first, last, key, handoverId, convertedAt, cid = null, platformFamilyId = null) => ({ key, first_name: first, middle_name: '', last_name: last, relationship: key === 'p' ? 'Primary' : '', contacts: [], emails: [], addresses: [], product: [], extra: {}, investor: { handoverId, convertedAt, status: 'Accepted', dataRemoved: true, cid, platformFamilyId } })
function fixedClient(id, familyId, stage, members, extra = {}) {
  return {
    id, familyId, stage, members,
    poolState: stage === 'Pool' ? 'Active' : null, inactiveUntil: null, batchOf: null,
    assignedTo: null, takeoverDate: null, lastCallAt: null, callStatus: null, unassignedSince: null, totalCalls: 0,
    source: 'Referral', importDate: ago(120), movedFrom: null, movedOn: null, movedBy: null,
    msgWindowUntil: null, replyWindowUntil: null,
    counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [], documents: [], createdAt: ago(150),
    ...extra,
  }
}
function demoFamilies() {
  return [
    // Demo script step 2 (Figma 13365): Lead of Anubhav. Ramesh and Sunita are registered on tp-sim; Priya and Anil are not.
    // Figma shows Anil's PAN as "WXYZ0000A" (9 characters, invalid format); a valid-format fictional PAN is used instead.
    fixedClient('CRM-LEAD-2026-00021', 'FAM-00021', 'Lead', [
      fixedPerson('Ramesh', 'Kumar', 'Primary', 'p', { gender: 'Male', pan: 'ABCDE1234F', mobiles: ['9876501001'], email: 'ramesh.kumar@examplemail.in', dob: '1971-04-12', product: ['pi_mf_equity', 'pi_fd'] }),
      fixedPerson('Sunita', 'Kumar', 'Wife', 'm1', { gender: 'Female', pan: 'PQRST9876V', mobiles: ['9876501002'], dob: '1975-09-03' }),
      fixedPerson('Priya', 'Kumar', 'Daughter', 'm2', { gender: 'Female', pan: 'LMNOP4567Q', mobiles: ['9876501003'], dob: '2000-01-21' }),
      fixedPerson('Anil', 'Kumar', 'Reference', 'm3', { gender: 'Male', pan: 'WXYZA1000A', mobiles: ['9876501004'] }),
    ], { assignedTo: 'u_is1', takeoverDate: ago(60), lastCallAt: ago(3), callStatus: 'Followup', source: 'Referral' }),
    // "Different family on the platform": Mahesh and Kavita are registered in two platform families.
    fixedClient('CRM-LEAD-2026-00022', 'FAM-00022', 'Lead', [
      fixedPerson('Mahesh', 'Patil', 'Primary', 'p', { gender: 'Male', pan: 'AMPPP1111M', mobiles: ['9876502001'], language: 'Marathi' }),
      fixedPerson('Kavita', 'Patil', 'Wife', 'm1', { gender: 'Female', pan: 'KVPPP2222K', mobiles: ['9876502002'], language: 'Marathi' }),
    ], { assignedTo: 'u_is1', takeoverDate: ago(45), lastCallAt: ago(6), callStatus: 'Followup' }),
    // "Already an investor with another advisor": Suresh is mapped to Emily Davis on the platform.
    fixedClient('CRM-LEAD-2026-00023', 'FAM-00023', 'Prospect', [
      fixedPerson('Suresh', 'Menon', 'Primary', 'p', { gender: 'Male', pan: 'SRMPM3333S', mobiles: ['9876503001'], language: 'English' }),
      fixedPerson('Asha', 'Menon', 'Mother', 'm1', { gender: 'Female', mobiles: ['9876503002'], language: 'English' }),
    ], { assignedTo: 'u_is1', takeoverDate: ago(30), lastCallAt: ago(9), callStatus: 'Followup' }),
    // Self-registration demo (DECISION-21): register ARJPR5555R on the simulator console.
    fixedClient('CRM-LEAD-2026-00024', 'FAM-00024', 'Prospect', [
      fixedPerson('Arjun', 'Reddy', 'Primary', 'p', { gender: 'Male', pan: 'ARJPR5555R', mobiles: ['9876504001'], language: 'Telugu' }),
    ], { assignedTo: 'u_is1', takeoverDate: ago(25), lastCallAt: ago(4), callStatus: 'Followup' }),
    // Duplicate-investor case (TS-16): Vijay Rao is registered with Anubhav AND already exists in Investor DMS (migration).
    fixedClient('CRM-LEAD-2026-00026', 'FAM-00026', 'Prospect', [
      fixedPerson('Vijay', 'Rao', 'Primary', 'p', { gender: 'Male', pan: 'VJYPR7777V', mobiles: ['9876508001'], language: 'Kannada' }),
    ], { assignedTo: 'u_is1', takeoverDate: ago(35), lastCallAt: ago(5), callStatus: 'Followup' }),
    // Investor Family: Deepak Shah is an investor of Anubhav in Investor DMS (18 months without investment there).
    fixedClient('CRM-LEAD-2026-00901', 'FAM-00901', 'Investor Family', [
      investorStub('Deepak', 'Shah', 'p', 'HND-20250512-0001', ago(549), 'CID60901', 'PF-20901'),
      fixedPerson('Meera', 'Shah', 'Wife', 'm1', { gender: 'Female', mobiles: ['9876505002'], language: 'Gujarati', product: ['pi_fd'] }),
    ], { assignedTo: 'u_is1', platformFamilyId: 'PF-20901', convertedAt: ago(549), takeoverDate: ago(700), lastCallAt: ago(20), callStatus: 'Followup', investorActive: 'No' }),
    // Investor Family of Emily Davis: Lakshmi Iyer is an active investor in Investor DMS.
    fixedClient('CRM-LEAD-2026-00902', 'FAM-00902', 'Investor Family', [
      investorStub('Lakshmi', 'Iyer', 'p', 'HND-20260315-0002', ago(242), 'CID60902', 'PF-20902'),
      fixedPerson('Karthik', 'Iyer', 'Son', 'm1', { gender: 'Male', mobiles: ['9876506002'], language: 'Tamil', product: ['pi_mf_equity'] }),
    ], { assignedTo: 'u_is2', platformFamilyId: 'PF-20902', convertedAt: ago(242), takeoverDate: ago(400), lastCallAt: ago(12), callStatus: 'Followup', investorActive: 'Yes' }),
    // Harish Bose went to Unassigned Investors in Investor DMS; his family stays with Tom Harris until Admin reassigns him there.
    fixedClient('CRM-LEAD-2026-00903', 'FAM-00903', 'Investor Family', [
      investorStub('Harish', 'Bose', 'p', 'HND-20241104-0003', ago(740), 'CID60903', 'PF-20903'),
      fixedPerson('Ritu', 'Bose', 'Daughter', 'm1', { gender: 'Female', mobiles: ['9876507002'], language: 'Bengali' }),
    ], { assignedTo: 'u_is4', platformFamilyId: 'PF-20903', convertedAt: ago(740), investorUnassigned: ago(14), takeoverDate: ago(900), lastCallAt: ago(60), investorActive: 'No' }),
    // A Pool record holding a number of an existing family (Meera Shah's): never distributed (split prompt §6.7.4).
    fixedClient('CRM-LEAD-2026-00025', 'FAM-00025', 'Pool', [
      fixedPerson('Vinod', 'Shah', 'Primary', 'p', { gender: 'Male', mobiles: ['9876505002'], language: 'Gujarati' }),
    ], { source: 'Walk-in' }),
  ]
}

// ---------------- Activity-bearing objects ----------------
export function seedRelated(clients, users) {
  const calls = [], events = [], notes = [], tasks = [], wa = [], emails = [], activities = []
  let n = 0
  const nameOf = (c) => `${c.members[0].first_name} ${c.members[0].last_name}`
  const HOUR = 3600000
  for (const c of clients) {
    // Every record starts in the Pool (an import), before a specialist takes it.
    if (c.takeoverDate && c.importDate >= c.takeoverDate) c.importDate = c.takeoverDate - int(2, 30) * DAY
    if (c.importDate) activities.push({ id: 'A-' + ++n, clientId: c.id, at: c.importDate, actor: null, type: 'stage', text: `Added to the Pool (${c.source} import)` })
    if (!['Prospect', 'Lead', 'Investor Family'].includes(c.stage)) continue
    const owner = c.assignedTo
    const took = c.takeoverDate || c.createdAt
    // Journey before the calls: Pool -> Prospect (takeover), and for a Lead, Prospect -> Lead a little later.
    activities.push({ id: 'A-' + ++n, clientId: c.id, at: took, actor: owner, type: 'stage', text: 'moved it from Pool to Prospect' })
    const k = int(1, 4)
    const callAts = Array.from({ length: k }, (_, i) => Math.min(Math.max((c.lastCallAt || ago(5)) - i * int(2, 9) * DAY, took + (k - i + 2) * HOUR), Date.now() - (i + 1) * HOUR))
    if (c.stage === 'Lead' || c.stage === 'Investor Family') {
      // an Investor Family was a Lead before its conversion
      const end = c.stage === 'Investor Family' && c.convertedAt ? Math.min(c.convertedAt, ...callAts) : Math.min(...callAts)
      const leadAt = took + Math.max(HOUR, Math.floor((end - took) / 2))
      activities.push({ id: 'A-' + ++n, clientId: c.id, at: leadAt, actor: owner, type: 'stage', text: 'moved it from Prospect to Lead' })
      if (c.stage === 'Investor Family') activities.push({ id: 'A-' + ++n, clientId: c.id, at: c.convertedAt || leadAt + DAY, actor: owner, type: 'stage', text: 'converted to Investor. Family moved to Investor Family.' })
    }
    for (let i = 0; i < k; i++) {
      const connected = r() > 0.3
      const at = callAts[i]
      calls.push({
        id: 'CL-' + ++n, clientId: c.id, stageAtCall: c.stage, direction: r() > 0.8 ? 'Inbound' : 'Outbound',
        mobile: (c.members.find((m) => m.contacts?.length) || c.members[0]).contacts[0]?.mobile || '', at, duration: connected ? int(20, 600) : 0,
        status: connected ? 'Connected' : 'Not Connected', subStatus: connected ? (i === 0 && c.callStatus ? c.callStatus : pick(['Followup', 'Disconnected', 'Not Interested'])) : pick(['Ringing', 'Busy', 'Switched Off']),
        clientName: nameOf(c), comment: connected ? pick(['Client asked for a call back next week to discuss options.', 'Discussed FD rates; client comparing with bank.', 'Client busy, requested evening call.', 'Shared overview of debt funds; client interested in details.']) : '',
        madeBy: owner, recording: connected,
      })
    }
    c.totalCalls = k
    if (r() > 0.4) {
      const t = ahead(int(0, 12), int(1, 8))
      events.push({ id: 'EV-' + ++n, clientId: c.id, type: pick(['Call Follow-up', 'Call Follow-up', 'Video Conference', 'In-Person Meeting']), title: pick(['Portfolio review call', 'Follow up on FD', 'KYC & asset allocation', 'SIP discussion']), allDay: false, start: t, end: t + 3600000, clientNames: [nameOf(c)], attendees: [owner], description: '', createdBy: owner, createdAt: ago(int(1, 20)) })
    }
    if (r() > 0.6) notes.push({ id: 'NT-' + ++n, clientId: c.id, title: pick(['2nd call', 'Prefers Hindi', 'Risk profile', 'Family details']), content: pick(['Showed interest in debt funds.', 'Call only after 6 pm.', 'Moderate risk appetite; prefers FDs.', 'Brother handles finances.']), createdBy: owner, createdAt: ago(int(1, 60)), updatedAt: ago(int(0, 30)), pinnedHome: false, pinnedClient: false })
    if (c.stage !== 'Pool' && r() > 0.5) {
      const tpl = pick(['followup_intro_v1', 'portfolio_rebalance_v2', 'sip_reminder_alert'])
      const wm = c.members.find((m) => m.contacts?.length) || c.members[0]
      const wnum = wm.contacts.find((x) => x.is_whatsapp)?.mobile || wm.contacts[0]?.mobile || ''
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
    T('Collect PAN copies from new prospects', 'To-Do', 'Medium', ahead(1, 4), 'u_is1', 'u_is1'),
    T('Prepare FD rate comparison', 'Completed', 'Low', ago(4), 'u_is2', 'u_tl1', 'Shared comparison sheet with the team.'),
    T('Diwali greeting call list', 'Expired', 'Low', ago(10), 'u_is1', 'u_tl1'),
    T('Review team call quality', 'To-Do', 'High', ahead(5), 'u_tl1', 'u_tl1'),
    T('Update prospect contact details', 'Rejected', 'Medium', ago(2), 'u_is3', 'u_tl1', 'Client not reachable; reassigned to next week.'),
  )
  // General notes
  notes.push({ id: 'NT-' + ++n, clientId: null, title: 'Team targets', content: 'Focus on Leads older than 60 days this week.', createdBy: 'u_is1', createdAt: ago(21), updatedAt: ago(21), pinnedHome: true, pinnedClient: false })
  // Internal meeting (no client)
  events.push({ id: 'EV-' + ++n, clientId: null, type: 'Internal Meeting', title: 'Weekly team huddle', allDay: false, start: ahead(1, 2), end: ahead(1, 3), clientNames: [], attendees: ['u_is1', 'u_tl1'], description: '', createdBy: 'u_tl1', createdAt: ago(2) })
  return { calls, events, notes, tasks, wa, emails, activities }
}

export function seedPoolSources(clients) {
  return SOURCES.map((s, i) => ({ name: s, visible: s !== 'Purchased List', isNew: s === 'Instagram Ad', lastImported: ago(int(2, 300)), count: clients.filter((c) => c.stage === 'Pool' && c.source === s).length }))
}

export function seedImports() {
  return [
    { id: 'IMP-6', file: 'contacts_q4_leads.csv', meta: '2.4 MB · UTF-8', source: 'Facebook Ad', at: ago(1, 3), imported: 790, duplicates: 200, invalid: 123, existing: 10, total: 1123, status: 'Processing', by: 'u_admin' },
    { id: 'IMP-5', file: 'customer_master_v2.xlsx', meta: '4.8 MB · Sheet 1', source: 'Referral', at: ago(2), imported: 1441, duplicates: 12, invalid: 5, existing: 9, total: 1467, status: 'Completed', by: 'u_admin' },
    { id: 'IMP-4', file: 'retail_walkins_oct.csv', meta: '1.1 MB · Batch #409', source: 'Walk-in', at: ago(3), imported: 320, duplicates: 45, invalid: 0, existing: 0, total: 365, status: 'Completed', by: 'u_admin' },
    { id: 'IMP-3', file: 'webinar_q3_attendees.csv', meta: '0.6 MB', source: 'Webinar – Q3', at: ago(9), imported: 638, duplicates: 22, invalid: 8, existing: 2, total: 670, status: 'Completed', by: 'u_admin' },
  ]
}

/** One pending data-change request on the Figma anchor record (Fig 26227): TL approved, VP pending. */
export function seedApprovals(clients) {
  const h = clients.find((c) => c.id === 'CRM-LEAD-2026-00014')
  const m = h.members[0]
  const newRow = { id: 'c9100', type: 'Office', mobile: '7890654399', is_whatsapp: false, pendingAdd: true, reqId: 'APR-1' }
  m.contacts.push(newRow)
  return [{
    id: 'APR-1', clientId: h.id, category: 'Name', categories: ['Name', 'Mobile', 'Delete Mobile/Email'],
    changes: [
      { memberKey: 'p', memberName: 'Himanshu Kumar', section: 'identity', field: 'first_name', label: 'First Name', old: 'Himanshu', new: 'Himansh', kind: 'modify' },
      { memberKey: 'p', memberName: 'Himanshu Kumar', section: 'contact', rowId: 'c9100', label: 'Mobile No. (Office)', old: '', new: '7890654399', kind: 'add' },
      { memberKey: 'p', memberName: 'Himanshu Kumar', section: 'contact', rowId: 'c9003', label: 'Mobile No. (Others)', old: '7862179615', new: '', kind: 'delete' },
    ],
    payload: null, requestedBy: 'u_is1', requestedOn: ago(0, 3), status: 'Pending',
    chain: [
      { userId: 'u_tl1', state: 'Approved', at: ago(0, 2), edited: false },
      { userId: 'u_vp', state: 'Pending', at: null, edited: false },
      { userId: 'u_pres', state: 'Waiting', at: null, edited: false },
      { userId: 'u_admin', state: 'Waiting', at: null, edited: false },
    ],
    history: [{ userId: 'u_tl1', action: 'Approved', at: ago(0, 2) }],
  }]
}

export function seedNotifications() {
  return [
    { id: 'N-s1', to: 'u_vp', code: 'N-23', text: "John Smith requested a change to Himanshu Kumar's record under Himanshu Kumar. Review before it goes live.", link: { path: '/record/CRM-LEAD-2026-00014', query: { tab: 'data' } }, filterIds: null, at: ago(0, 2), read: false, tab: 'All' },
    { id: 'N-s2', to: 'u_is1', code: 'N-05', text: 'David Miller assigned you a task: Check all renewals for this month. Due in 3 days.', link: { path: '/tasks' }, filterIds: null, at: ago(1), read: false, tab: 'All' },
  ]
}

export function seedTransfers() {
  return [
    { id: 'TR-2', at: ago(4, 6), from: 'u_is6', to: [{ userId: 'u_is2', prospects: 120, leads: 0 }, { userId: 'u_is5', prospects: 0, leads: 40 }], movedBy: 'u_admin' },
    { id: 'TR-1', at: ago(5, 2), from: 'u_is4', to: [{ userId: 'u_is1', prospects: 30, leads: 12 }], movedBy: 'u_admin' },
  ]
}
