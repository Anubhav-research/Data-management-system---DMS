// Rough demo data at real volume (product owner, 25 Nov 2026): ~210 more people (VPs, TLs, IS) and, for every IS,
// about 70 calls a working day for the last 7 days: 45-50 on Prospect DMS, the rest on Investor DMS. Added on top of
// the existing data through each website's state API (the open browsers reload by themselves). Everything added
// carries `bulk: 1`, so `node scripts/demo-bulk.mjs remove` takes it out again and leaves the rest as it was.
//   node scripts/demo-bulk.mjs add      add the data (refuses when it is already there)
//   node scripts/demo-bulk.mjs remove   remove everything this script added
//   node scripts/demo-bulk.mjs patch    add what later rounds asked for to data already loaded (runs once):
//                                       the five named teams, calls on Pool records (25 Nov 2026), and on Investor
//                                       DMS money: investments from the platform and the deals ahead (26 Nov 2026)
import { loadEnv } from '../services/lib/common.mjs'

const env = loadEnv()
const SITES = {
  p: { url: `http://127.0.0.1:${env.P_API_PORT}/api/state`, key: env.P_API_KEY },
  i: { url: `http://127.0.0.1:${env.I_API_PORT}/api/state`, key: env.I_API_KEY },
}
const mode = process.argv[2]
if (!['add', 'remove', 'patch'].includes(mode)) { console.log('usage: node scripts/demo-bulk.mjs add|remove|patch'); process.exit(1) }

async function load(site) {
  const r = await fetch(site.url, { headers: { 'x-api-key': site.key } })
  if (!r.ok) throw new Error(`GET ${site.url}: ${r.status}`)
  return r.json()
}
async function save(site, version, state) {
  const body = `{"version":${version},"savedBy":"demo-bulk","state":${JSON.stringify(state)}}`
  const r = await fetch(site.url, { method: 'PUT', headers: { 'x-api-key': site.key, 'content-type': 'application/json' }, body })
  if (!r.ok) throw new Error(`PUT ${site.url}: ${r.status} ${await r.text()}`)
  console.log(`  saved ${(body.length / 1e6).toFixed(1)} MB`)
}
const isBulk = (x) => x && typeof x === 'object' && x.bulk === 1
function strip(s) {
  for (const [k, v] of Object.entries(s)) if (Array.isArray(v)) s[k] = v.filter((x) => !isBulk(x))
  if (s.f2Last) for (const k of Object.keys(s.f2Last)) if (k.startsWith('FAM-B') || k.startsWith('FAM-MB')) delete s.f2Last[k]
  for (const u of s.users || []) delete u.teamName
  return s
}

// ------------------------------------------------------------------ helpers (seeded, so a rerun gives the same data)
let seed = 20261125
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = (l) => l[Math.floor(rnd() * l.length)]
const weighted = (pairs) => { const t = pairs.reduce((s, [, w]) => s + w, 0); let x = rnd() * t; for (const [v, w] of pairs) { if ((x -= w) < 0) return v } return pairs[0][0] }
const pad = (n, w) => String(n).padStart(w, '0')

const FIRST_M = ['Aarav', 'Vihaan', 'Arjun', 'Rohan', 'Kabir', 'Ishaan', 'Aditya', 'Rahul', 'Karan', 'Nikhil', 'Siddharth', 'Varun', 'Manish', 'Rakesh', 'Sanjay', 'Amit', 'Deepak', 'Suresh', 'Vikram', 'Harsh', 'Pranav', 'Yash', 'Akash', 'Gaurav', 'Rajesh', 'Mohit', 'Tarun', 'Naveen', 'Ankit', 'Kunal']
const FIRST_F = ['Ananya', 'Diya', 'Priya', 'Sneha', 'Kavya', 'Meera', 'Pooja', 'Neha', 'Riya', 'Isha', 'Aditi', 'Shreya', 'Nisha', 'Swati', 'Divya', 'Anjali', 'Komal', 'Sakshi', 'Tanvi', 'Ritu', 'Simran', 'Payal', 'Bhavna', 'Kritika', 'Lavanya', 'Mansi', 'Nandini', 'Radhika', 'Sonal', 'Trisha']
const LAST = ['Sharma', 'Verma', 'Gupta', 'Mehta', 'Shah', 'Patel', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Joshi', 'Kulkarni', 'Desai', 'Agarwal', 'Bansal', 'Chopra', 'Malhotra', 'Kapoor', 'Saxena', 'Mishra', 'Pandey', 'Tiwari', 'Banerjee', 'Mukherjee', 'Das', 'Ghosh', 'Pillai', 'Menon', 'Bhatt', 'Trivedi', 'Jain', 'Singh', 'Chauhan', 'Thakur', 'Kaur', 'Sethi', 'Arora', 'Khanna', 'Bose', 'Naidu']
const LANGS = [['Hindi', 30], ['English', 20], ['Gujarati', 10], ['Marathi', 10], ['Tamil', 8], ['Telugu', 7], ['Kannada', 6], ['Bengali', 6], ['Malayalam', 3]]
const CITIES = [['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'], ['Delhi', 'Delhi'], ['Bengaluru', 'Karnataka'], ['Chennai', 'Tamil Nadu'], ['Hyderabad', 'Telangana'], ['Ahmedabad', 'Gujarat'], ['Kolkata', 'West Bengal'], ['Jaipur', 'Rajasthan'], ['Indore', 'Madhya Pradesh'], ['Lucknow', 'Uttar Pradesh'], ['Kochi', 'Kerala']]
const SOURCES = [['Referral', 18], ['Website Form', 14], ['Google Ads', 12], ['Facebook Ad', 10], ['Instagram Ad', 8], ['Purchased List', 12], ['Webinar – Q3', 6], ['Event – Mumbai 2025', 5], ['Walk-in', 4], ['Partner Leads', 6], ['Campaign Q3', 3], ['Direct', 2]]
const PRODUCTS = ['pi_mf_equity_hybrid', 'pi_mf_debt', 'pi_mf_sif', 'pi_mf_gift_city', 'pi_fd', 'pi_rbi_bond', 'pi_capital_gain_bond', 'pi_ncd', 'pi_others']
const WA_TEMPLATES = [['followup_intro_v1', 'Hello, thank you for speaking with Money Honey today.', 35], ['sip_reminder', 'A gentle reminder about starting your SIP this month.', 20], ['fd_rates_nov', 'This month\'s FD rates from our partner companies are attached.', 20], ['portfolio_rebalance_v2', 'It may be a good time to review your portfolio mix.', 15], ['sip_reminder_alert', 'Your SIP date is coming up in 3 days.', 10]]
const DOCS = [{ docId: 'DOC-001', name: 'KYC Checklist – Individual.pdf', mime: 'application/pdf', size: 74057 }, { docId: 'DOC-002', name: 'KYC Checklist – NRI.pdf', mime: 'application/pdf', size: 73770 }, { docId: 'DOC-004', name: 'SIP – How It Works.pdf', mime: 'application/pdf', size: 74034 }, { docId: 'DOC-005', name: 'Why Start a SIP – WhatsApp Card.png', mime: 'image/png', size: 320091 }, { docId: 'DOC-006', name: 'Mutual Fund Category Guide – Nov 2026.pdf', mime: 'application/pdf', size: 73978 }]
const FREE_TEXT = ['Sure, I will call you at 4 pm.', 'Please share your PAN copy when convenient.', 'As discussed, here are the next steps.', 'Thank you, noted.']
const REPLIES = ['Ok, call me tomorrow.', 'Please send the details.', 'Thanks!', 'Not now, maybe next month.', 'What is the FD rate for 3 years?']
const ROLE_SWITCHES = (site, role) => ({ dms: true, wa_template: true, wa_custom: role !== 'IS' ? false : true, email_template: true, email_custom: role !== 'IS' ? false : true, create_prospect: true, play_recordings: role !== 'IS', wa_document: true })

const NOW = Date.now()
const DAY = 86400000
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
// the last 7 calendar days including today; Sunday is a holiday
const DAYS = []
for (let i = 6; i >= 0; i--) { const d = dayStart(NOW) - i * DAY; if (new Date(d).getDay() !== 0) DAYS.push(d) }
/** n call times on a working day, 9:30 to 19:00, sorted; today only up to a few minutes ago. */
function times(d, n) {
  const from = d + 9.5 * 3600000; const to = Math.min(d + 19 * 3600000, NOW - 5 * 60000)
  if (to <= from) return []
  const share = (to - from) / (9.5 * 3600000) // today: only the part of the day already gone
  const k = Math.max(0, Math.round(n * Math.min(1, share)))
  return Array.from({ length: k }, () => from + rnd() * (to - from)).sort((a, b) => a - b).map(Math.round)
}
let mob = 0
const mobile = () => `${pick(['9', '8', '7', '6'])}${pad((7300000 + mob++ * 37) % 1000000000, 9)}`
function person() {
  const female = rnd() < 0.45
  return { first_name: pick(female ? FIRST_F : FIRST_M), last_name: pick(LAST), gender: female ? 'Female' : 'Male' }
}
const fullName = (m) => [m.first_name, m.last_name].filter(Boolean).join(' ')

// ------------------------------------------------------------------ the organisation (the same people on both websites)
function makeOrg(existing) {
  const used = new Set(existing.map((u) => u.name))
  const uniqName = () => { for (;;) { const p = person(); const n = fullName(p); if (!used.has(n)) { used.add(n); return n } } }
  let code = 501000
  const users = []
  const add = (id, role, reportsTo) => { const u = { id, name: uniqName(), mhf_id: `MHF${code++}`, role, reportsTo, active: true, availability: 'Present', bulk: 1 }; users.push(u); return u }
  const vps = ['u_vp', add('ub_vp2', 'VP', 'u_pres').id, add('ub_vp3', 'VP', 'u_pres').id]
  const tls = [['u_tl1', 7], ['u_tl2', 7]] // the two existing teams grow to 10 IS each
  let t = 3
  for (const [vp, n] of [[vps[0], 4], [vps[1], 7], [vps[2], 7]]) for (let i = 0; i < n; i++) tls.push([add(`ub_tl${t++}`, 'TL', vp).id, 10])
  let s = 7
  for (const [tl, n] of tls) for (let i = 0; i < n; i++) add(`ub_is${s++}`, 'IS', tl)
  // a few people are on leave today (approval chains skip them)
  for (const u of users) if (u.role === 'IS' && rnd() < 0.03) u.availability = 'Absent'
  return users
}

// ------------------------------------------------------------------ calls
const CONNECTED_P = [['Followup', 42], ['Disconnected', 18], ['Not Interested', 16], ['Wrong Number', 4]]
const CONNECTED_I = [['Followup', 30], ['Interested', 18], ['Passive Communication', 22], ['Disconnected', 15], ['Not Interested', 15]]
const NOT_CONNECTED = [['Ringing', 45], ['Busy', 25], ['Switched Off', 18], ['Out of Coverage', 12]]
const talk = () => Math.round(weighted([[int(20, 90), 35], [int(90, 300), 45], [int(300, 900), 17], [int(900, 1800), 3]]))
function call(id, c, at, by, investor, stage) {
  const connected = rnd() < (investor ? 0.6 : 0.52)
  const sub = connected ? weighted(investor ? CONNECTED_I : CONNECTED_P) : weighted(NOT_CONNECTED)
  const m = c.members[0]
  return { id, clientId: c.id, stageAtCall: stage, direction: rnd() < 0.9 ? 'Outbound' : 'Inbound', mobile: m.contacts[0].mobile, at, duration: connected ? talk() : 0, status: connected ? 'Connected' : 'Not Connected', subStatus: sub, clientName: fullName(m), comment: '', madeBy: by, recording: connected, bulk: 1 }
}
function touch(c, k) { c.lastCallAt = Math.max(c.lastCallAt || 0, k.at); if (k.at === c.lastCallAt) c.callStatus = k.subStatus; c.totalCalls = (c.totalCalls || 0) + 1 }

// ------------------------------------------------------------------ Prospect DMS
function prospect(s, org) {
  const IS = s.users.filter((u) => u.role === 'IS').concat(org.filter((u) => u.role === 'IS'))
  let cn = 50000; let fam = 50000; let k = 1; let a = 1; let w = 1; let e = 1; let ev = 1; let h = 1
  const nid = (p) => `${p}-B${pad(k++, 6)}`
  const out = { clients: [], calls: [], activities: [], wa: [], emails: [], events: [], handovers: [] }
  const act = (clientId, at, actor, type, text) => out.activities.push({ id: `A-B${pad(a++, 6)}`, clientId, at, actor, type, text, bulk: 1 })
  function client(owner, stage, extra = {}) {
    const p = person(); const [city, state] = pick(CITIES); const id = `CRM-LEAD-2026-${cn++}`
    const m = { key: 'p', ...p, middle_name: '', language: weighted(LANGS), relationship: 'Primary', pan: '', date_of_birth: '', contacts: [{ id: `c-b${cn}`, type: 'Residence', mobile: mobile(), is_whatsapp: rnd() < 0.85 }], emails: rnd() < 0.45 ? [{ id: `e-b${cn}`, email: `${p.first_name}.${p.last_name}${cn % 97}@examplemail.in`.toLowerCase() }] : [], addresses: [], product: [...new Set([pick(PRODUCTS), ...(rnd() < 0.4 ? [pick(PRODUCTS)] : [])])], extra: { pan: '', nationality: 'Indian' }, city, state, clientId: id }
    const taken = NOW - int(10, 80) * DAY
    const c = { id, familyId: `FAM-B${fam++}`, stage, members: [m], poolState: null, inactiveUntil: null, batchOf: null, assignedTo: owner, takeoverDate: taken, lastCallAt: null, callStatus: null, unassignedSince: null, totalCalls: 0, source: weighted(SOURCES), importDate: taken - int(5, 200) * DAY, movedFrom: null, movedOn: null, movedBy: null, msgWindowUntil: null, replyWindowUntil: null, counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [{ userId: owner, from: taken, to: null }], documents: [], createdAt: taken - int(5, 200) * DAY, prevOwner: owner, callLockBy: null, ownershipPending: null, bulk: 1, ...extra }
    out.clients.push(c); return c
  }
  for (const u of IS) {
    const book = []
    for (let i = 0; i < 32; i++) book.push(client(u.id, 'Prospect'))
    for (let i = 0; i < 14; i++) book.push(client(u.id, 'Lead'))
    if (u.availability === 'Absent') continue
    for (const d of DAYS) {
      const isToday = d === dayStart(NOW)
      // taken from the Pool today (new records in the book)
      for (let i = 0, n = weighted([[1, 30], [2, 40], [3, 20], [4, 10]]); i < n; i++) {
        const to = rnd() < 0.7 ? 'Prospect' : 'Lead'; const at = d + int(10, 18) * 3600000 + int(0, 3599999); if (at > NOW) continue
        const c = client(u.id, to, { takeoverDate: at, ownershipHistory: [{ userId: u.id, from: at, to: null }] }); book.push(c)
        act(c.id, at, u.id, 'stage', `moved it from Pool to ${to}`)
      }
      // Prospect -> Lead now and then
      if (rnd() < 0.5) { const c = pick(book.filter((x) => x.stage === 'Prospect')); const at = d + int(11, 18) * 3600000; if (c && at < NOW) { c.stage = 'Lead'; act(c.id, at, u.id, 'stage', 'moved it from Prospect to Lead') } }
      // calls: 40-50 a day on the book
      for (const at of times(d, int(40, 50))) {
        const c = pick(book); if (c.takeoverDate > at) continue
        const x = call(nid('CL'), c, at, u.id, false, c.stage); out.calls.push(x); touch(c, x)
      }
      // follow-ups planned for this day (most get called back after the planned time)
      for (let i = 0; i < 2; i++) {
        const c = pick(book); const start = d + int(10, 17) * 3600000
        out.events.push({ id: `EV-B${pad(ev++, 6)}`, createdBy: u.id, createdAt: start - int(1, 4) * DAY, attendees: [u.id], clientNames: [fullName(c.members[0])], description: '', reminders: [10], type: 'Call Follow-up', title: 'Follow-up call', allDay: false, start, end: start + 15 * 60000, clientId: c.id, notifications: [{ type: 'Notification', before: 10, interval: 'minutes' }], bulk: 1 })
        if (start < NOW && rnd() < 0.75) { const at = Math.min(NOW - 60000, start + int(5, 240) * 60000); const x = call(nid('CL'), c, at, u.id, false, c.stage); out.calls.push(x); touch(c, x) }
      }
      // WhatsApp: templates start a conversation; documents and free text only in an open window
      for (const at of times(d, int(6, 10))) {
        const c = pick(book); const type = weighted([['Template', 50], ['Document', 25], ['Free Text', 25]]); const t = type === 'Template' ? weighted(WA_TEMPLATES.map((x) => [x, x[2]])) : null
        out.wa.push({ id: `WA-B${pad(w++, 6)}`, clientId: c.id, stage: c.stage, mobile: c.members[0].contacts[0].mobile, at, direction: 'Sent', type, template: t ? t[0] : null, body: t ? t[1] : type === 'Free Text' ? pick(FREE_TEXT) : '', doc: type === 'Document' ? pick(DOCS) : null, status: weighted([['Read', 52], ['Delivered', 30], ['Sent', 12], ['Failed', 6]]), sentBy: u.id, bulk: 1 })
        if (rnd() < 0.3 && at + 30 * 60000 < NOW) out.wa.push({ id: `WA-B${pad(w++, 6)}`, clientId: c.id, stage: c.stage, mobile: c.members[0].contacts[0].mobile, at: at + int(5, 120) * 60000, direction: 'Received', type: 'Free Text', template: null, body: pick(REPLIES), doc: null, status: 'Received', sentBy: u.id, bulk: 1 })
      }
      // email
      for (const at of times(d, int(2, 4))) {
        const c = pick(book.filter((x) => x.members[0].emails.length)) || book[0]; const tpl = rnd() < 0.65
        out.emails.push({ id: `EM-B${pad(e++, 6)}`, clientId: c.id, stage: c.stage, email: c.members[0].emails[0]?.email || '', at, direction: 'Sent', type: tpl ? 'Template' : 'Custom', template: tpl ? 'meeting_followup' : null, subject: tpl ? 'Follow-up on our call' : 'Details you asked for', body: 'Thank you for your time today.', ...(rnd() < 0.3 ? { docs: [pick(DOCS)] } : {}), status: weighted([['Opened', 40], ['Delivered', 40], ['Sent', 15], ['Bounced', 5]]), sentBy: u.id, bulk: 1 })
        if (rnd() < 0.2 && at + 60 * 60000 < NOW) out.emails.push({ id: `EM-B${pad(e++, 6)}`, clientId: c.id, stage: c.stage, email: c.members[0].emails[0]?.email || '', at: at + int(30, 300) * 60000, direction: 'Received', type: 'Custom', template: null, subject: 'Re: Follow-up on our call', body: pick(REPLIES), status: 'Received', sentBy: u.id, bulk: 1 })
      }
      // lost: released to the Pool by the IS, or the timer ran out
      if (rnd() < 0.45 && !isToday) {
        const c = pick(book.filter((x) => x.stage !== 'Pool')); const at = d + int(10, 18) * 3600000
        const from = c.stage; Object.assign(c, { stage: 'Pool', poolState: 'Active', assignedTo: null, takeoverDate: null, prevOwner: u.id, unassignedSince: null })
        c.ownershipHistory[0].to = at
        act(c.id, at, rnd() < 0.7 ? u.id : null, 'stage', rnd() < 0.7 ? `Release to Pool from ${from}` : `Timer expiry from ${from}`)
      }
      // conversions (about 5% of what is worked): the family is accepted by Investor DMS a little later
      if (rnd() < 0.33) {
        const c = pick(book.filter((x) => x.stage === 'Lead')); const at = d + int(11, 17) * 3600000
        if (c && at + 60000 < NOW) {
          const from = c.stage; const hid = `HND-B${pad(h++, 6)}`
          Object.assign(c, { stage: 'Investor Family', convertedAt: at, convertedFromStage: from, platformFamilyId: `PF-B${pad(h, 5)}`, investorActive: 'Yes', investorUnassigned: null, completedAt: at + 60000 })
          act(c.id, at, u.id, 'stage', 'converted to Investor. Family moved to Investor Family.')
          act(c.id, at + 30000, null, 'stage', 'Conversion confirmed by Investor DMS.')
          out.handovers.push({ id: hid, clientId: c.id, familyId: c.familyId, memberKeys: ['p'], memberCount: 1, status: 'Delivered', delivery: 'at-bridge', createdAt: at, sentAt: at + 200, ackAt: at + 30000, reasonCode: null, attempts: 0, nextTryAt: at, lastError: null, hash: '', contractVersion: '1.1.0', convertedFromStage: from, advisorId: u.id, actedBy: u.id, payload: null, stripped: [], retry: false, bulk: 1 })
        }
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ Investor DMS
function investor(s, org, converted) {
  const IS = s.users.filter((u) => u.role === 'IS').concat(org.filter((u) => u.role === 'IS'))
  let cid = 700000; let k = 1; let dl = 1; let w = 1; let e = 1; let ev = 1
  const out = { clients: [], calls: [], deals: [], wa: [], emails: [], events: [], f2: {} }
  const PRODUCTS_I = ['FD', 'MF Equity', 'MF Debt', 'RBI Bond', 'NCD', 'Capital Gain Bond']
  function family(u, extra = {}) {
    const p = person(); const [city, state] = pick(CITIES); const id = `CID${cid++}`
    const pan = `${String.fromCharCode(65 + int(0, 25), 65 + int(0, 25), 65 + int(0, 25))}P${p.last_name[0].toUpperCase()}${int(1000, 9999)}${String.fromCharCode(65 + int(0, 25))}`
    const m = { key: 'p', ...p, middle_name: '', language: weighted(LANGS), relationship: 'Primary', pan, date_of_birth: `19${int(55, 95)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`, panVerified: true, cid: id, contacts: [{ id: `c-b${cid}`, type: 'Residence', mobile: mobile(), is_whatsapp: true }], emails: rnd() < 0.6 ? [{ id: `e-b${cid}`, email: `${p.first_name}.${p.last_name}${cid % 89}@examplemail.in`.toLowerCase() }] : [], addresses: [], product: [pick(PRODUCTS)], extra: { pan, nationality: 'Indian' }, city, state, clientId: id }
    const since = NOW - int(60, 900) * DAY; const lastInv = rnd() < 0.75 ? NOW - int(5, 500) * DAY : NOW - int(560, 900) * DAY
    const amount = pick([25000, 50000, 100000, 200000, 500000, 1000000]); const aum = Math.round(amount * (1 + rnd() * 3))
    const code = u.dataCodes?.[0] || null
    const c = { id, cid: id, familyId: `FAM-MB${cid}`, platformFamilyId: `PF-MB${cid}`, stage: 'Investor', members: [m], verifiedKeys: ['p'], poolState: null, inactiveUntil: null, batchOf: null, assignedTo: u.id, sourceIs: u.id, dataCode: code, prevDataCode: null, takeoverDate: since, lastCallAt: null, callStatus: null, unassignedSince: null, totalCalls: 0, source: 'Migrated', importDate: since, movedFrom: null, movedOn: null, movedBy: null, msgWindowUntil: null, replyWindowUntil: null, counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [{ userId: u.id, dataCode: code, from: since, to: null }], documents: [], createdAt: since, handoverIds: [], invStatus: NOW - lastInv < 548 * DAY ? 'Active' : 'Inactive', invClockStart: lastInv, lastInvDate: lastInv, lastInvProduct: pick(PRODUCTS_I), lastInvAmount: amount, aum, f2Invested: NOW - lastInv < 548 * DAY ? 'Yes' : 'No', totalInvested: amount, invested: amount, valuesAsOf: dayStart(NOW), investedV: 2, bulk: 1, ...extra }
    out.clients.push(c)
    out.f2[c.familyId] = `Assigned|${u.mhf_id}|${c.f2Invested}`
    return c
  }
  for (const u of IS) {
    const book = []
    for (let i = 0; i < 28; i++) book.push(family(u))
    // the families converted on Prospect DMS arrive here with the same Family ID
    for (const pc of converted.filter((x) => x.assignedTo === u.id)) {
      const c = family(u, { familyId: pc.familyId, platformFamilyId: pc.platformFamilyId, source: 'Prospect DMS', takeoverDate: pc.completedAt, importDate: pc.completedAt, createdAt: pc.completedAt, invStatus: 'Prospect', lastInvDate: null, lastInvProduct: null, lastInvAmount: null, aum: 0, f2Invested: 'No', totalInvested: 0, invested: 0, invClockStart: pc.completedAt })
      c.members[0] = { ...c.members[0], first_name: pc.members[0].first_name, last_name: pc.members[0].last_name, gender: pc.members[0].gender }
      c.ownershipHistory[0].from = pc.completedAt
      out.f2[c.familyId] = `Assigned|${u.mhf_id}|No`
      book.push(c)
    }
    if (u.availability === 'Absent') continue
    for (const d of DAYS) {
      for (const at of times(d, int(20, 30))) {
        const c = pick(book); if (c.takeoverDate > at) continue
        const x = call(`CL-B${pad(k++, 6)}`, c, at, u.id, true, 'Investor'); out.calls.push(x); touch(c, x)
      }
      // investment meetings (deals)
      if (rnd() < 0.7) {
        const c = pick(book); const start = d + int(10, 17) * 3600000; const p1 = pick(PRODUCTS_I); const amt = pick([25000, 50000, 100000, 250000, 500000])
        const status = start > NOW ? 'Scheduled' : weighted([['Completed', 55], ['Expired', 25], ['Rejected', 20]])
        out.deals.push({ id: `DL-B${pad(dl++, 6)}`, clientId: c.id, allDay: false, start, end: start + 3600000, rows: [{ product: p1, amount: amt, ...(p1 === 'FD' ? { company: 'Bajaj Finance', tenure: '3 Years' } : {}) }], total: amt, status, finalAmount: status === 'Completed' ? amt : null, remark: '', createdBy: u.id, updatedAt: Math.min(NOW, start + 2 * 3600000), bulk: 1 })
      }
      if (rnd() < 0.8) { const c = pick(book); const start = d + int(10, 17) * 3600000; out.events.push({ id: `EV-B${pad(ev++, 6)}`, createdBy: u.id, createdAt: start - DAY, attendees: [u.id], clientNames: [fullName(c.members[0])], description: '', reminders: [10], type: 'Call Follow-up', title: 'Follow-up call', allDay: false, start, end: start + 15 * 60000, clientId: c.id, notifications: [{ type: 'Notification', before: 10, interval: 'minutes' }], bulk: 1 }) }
      for (const at of times(d, int(2, 5))) {
        const c = pick(book); const type = weighted([['Template', 55], ['Document', 25], ['Free Text', 20]]); const t = type === 'Template' ? weighted(WA_TEMPLATES.map((x) => [x, x[2]])) : null
        out.wa.push({ id: `WA-B${pad(w++, 6)}`, clientId: c.id, stage: 'Investor', mobile: c.members[0].contacts[0].mobile, at, direction: 'Sent', type, template: t ? t[0] : null, body: t ? t[1] : type === 'Free Text' ? pick(FREE_TEXT) : '', doc: type === 'Document' ? pick(DOCS) : null, status: weighted([['Read', 60], ['Delivered', 28], ['Sent', 8], ['Failed', 4]]), sentBy: u.id, bulk: 1 })
      }
      for (const at of times(d, int(0, 2))) {
        const c = pick(book.filter((x) => x.members[0].emails.length)) || book[0]
        out.emails.push({ id: `EM-B${pad(e++, 6)}`, clientId: c.id, stage: 'Investor', email: c.members[0].emails[0]?.email || '', at, direction: 'Sent', type: 'Template', template: 'meeting_followup', subject: 'Follow-up on our call', body: 'Thank you for your time today.', status: weighted([['Opened', 45], ['Delivered', 40], ['Sent', 12], ['Bounced', 3]]), sentBy: u.id, bulk: 1 })
      }
    }
  }
  return out
}

// ------------------------------------------------------------------ later rounds
// The five teams (Alpha ... Epsilon): every TL belongs to one, their IS with them. Same on both websites.
const TEAMS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']
function nameTeams(users) {
  const num = (u) => Number(String(u.id).replace(/D/g, '')) || 0
  const tls = users.filter((u) => u.role === 'TL').sort((a, b) => num(a) - num(b))
  const per = Math.ceil(tls.length / TEAMS.length)
  tls.forEach((u, i) => { u.teamName = TEAMS[Math.min(TEAMS.length - 1, Math.floor(i / per))] })
}
// Calls on Pool records: every IS works a Pool batch of their own; a record is taken out of the Pool after a call.
function poolCalls(ps) {
  if (ps.calls.some((c) => c.bulkPool)) return 0
  seed = 20261126; mob = 600000
  let cn = 80000; let k = 1; const added = { clients: [], calls: [] }
  const poolCall = (c, at, by, connected) => {
    const x = call(`CL-BP${pad(k++, 6)}`, c, at, by, false, 'Pool')
    if (connected != null && connected !== (x.status === 'Connected')) Object.assign(x, connected ? { status: 'Connected', subStatus: 'Followup', duration: talk(), recording: true } : { status: 'Not Connected', subStatus: weighted(NOT_CONNECTED), duration: 0, recording: false })
    x.bulkPool = 1; added.calls.push(x); touch(c, x); c.counters = { ...(c.counters || {}), poolCalls: (c.counters?.poolCalls || 0) + 1 }
  }
  for (const u of ps.users.filter((x) => x.role === 'IS' && x.availability !== 'Absent')) {
    const batch = []
    for (let i = 0; i < 25; i++) {
      const p = person(); const [city, state] = pick(CITIES); const id = `CRM-LEAD-2026-${cn++}`; const since = NOW - int(5, 60) * DAY
      const c = { id, familyId: `FAM-B${cn}`, stage: 'Pool', members: [{ key: 'p', ...p, middle_name: '', language: weighted(LANGS), relationship: 'Primary', pan: '', date_of_birth: '', contacts: [{ id: `c-p${cn}`, type: 'Residence', mobile: mobile(), is_whatsapp: rnd() < 0.85 }], emails: [], addresses: [], product: [pick(PRODUCTS)], extra: { pan: '', nationality: 'Indian' }, city, state, clientId: id }],
        poolState: 'Active', inactiveUntil: null, batchOf: u.id, assignedTo: null, takeoverDate: null, lastCallAt: null, callStatus: null, unassignedSince: null, totalCalls: 0, source: weighted(SOURCES), importDate: since, movedFrom: null, movedOn: null, movedBy: null, msgWindowUntil: null, replyWindowUntil: null,
        counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, ownershipHistory: [], documents: [], createdAt: since, bulk: 1 }
      batch.push(c); added.clients.push(c)
    }
    for (const d of DAYS) for (const at of times(d, int(6, 10))) poolCall(pick(batch), at, u.id, rnd() < 0.35)
  }
  // every record taken out of the Pool had a connected call in the Pool just before
  const byId = new Map(ps.clients.map((c) => [c.id, c]))
  for (const a of ps.activities) {
    if (!a.bulk || a.type !== 'stage' || !/^moved it from Pool to/.test(a.text)) continue
    const c = byId.get(a.clientId); if (c) poolCall(c, a.at - int(2, 6) * 60000, a.actor, true)
  }
  ps.clients = [...added.clients, ...ps.clients]; ps.calls = [...added.calls, ...ps.calls]
  return added.calls.length
}

// Investor DMS money (26 Nov 2026): the platform's investments over the last days - every completed deal is invested
// (its final amount, a little after the meeting), plus top-ups and SIP starts without a deal, and some newly converted
// families investing for the first time - and the deals planned for the next 30 days (planned, not certain).
function investorMoney(is) {
  if (is.activities.some((a) => a.bulkInv)) return null
  seed = 20261127
  const byId = new Map(is.clients.map((c) => [c.id, c]))
  const PRODUCTS_I = ['MF Equity', 'MF Debt', 'MF SIF', 'FD', 'RBI Bond', 'NCD', 'Capital Gain Bond']
  const amountOf = () => weighted([[int(5, 25) * 1000, 30], [int(25, 100) * 1000, 35], [int(1, 5) * 100000, 25], [int(5, 25) * 100000, 10]])
  let a = 1; let d = 1; const acts = []; const deals = []
  function invest(c, at, product, amount) {
    acts.push({ id: `A-BI${pad(a++, 6)}`, clientId: c.id, at, actor: null, type: 'stage', text: `Investment on the Transaction Platform: ${product}, ₹${Number(amount).toLocaleString('en-IN')}.`, bulk: 1, bulkInv: 1 })
    if (!c.lastInvDate || at >= c.lastInvDate) Object.assign(c, { lastInvDate: at, lastInvProduct: product, lastInvAmount: amount, invClockStart: at, invStatus: 'Active', f2Invested: 'Yes' })
    c.aum = (c.aum || 0) + amount; c.totalInvested = (c.totalInvested || 0) + amount; c.invested = (c.invested || 0) + amount
  }
  // 1. completed deals are invested on the platform
  for (const x of is.deals) {
    if (!x.bulk || x.status !== 'Completed' || !x.finalAmount) continue
    const c = byId.get(x.clientId); const at = x.start + int(1, 4) * 3600000
    if (c && at < NOW) invest(c, at, x.rows?.[0]?.product || pick(PRODUCTS_I), x.finalAmount)
  }
  // 2. top-ups and SIP starts without a deal; 3. new investors from the converted families
  const IS = is.users.filter((u) => u.role === 'IS' && u.availability !== 'Absent')
  for (const u of IS) {
    const book = is.clients.filter((c) => c.bulk && c.assignedTo === u.id && c.stage === 'Investor')
    if (!book.length) continue
    for (const day of DAYS) {
      for (let i = 0, n = weighted([[0, 25], [1, 45], [2, 25], [3, 5]]); i < n; i++) {
        const at = day + int(10, 18) * 3600000 + int(0, 3599999); if (at > NOW) continue
        invest(pick(book), at, pick(PRODUCTS_I), amountOf())
      }
    }
    for (const c of book.filter((x) => x.invStatus === 'Prospect' && x.source === 'Prospect DMS')) {
      if (rnd() < 0.45) { const at = Math.min(NOW - 3600000, (c.takeoverDate || NOW) + int(1, 3) * DAY); if (at > (c.takeoverDate || 0)) invest(c, at, pick(PRODUCTS_I), amountOf()) }
    }
    // the deals planned for the next 30 days
    for (let i = 0, n = int(3, 6); i < n; i++) {
      const c = pick(book); const start = dayStart(NOW) + int(1, 30) * DAY + int(10, 17) * 3600000
      const rows = [{ product: pick(PRODUCTS_I), amount: amountOf() }]; if (rnd() < 0.3) rows.push({ product: pick(PRODUCTS_I), amount: amountOf() })
      const total = rows.reduce((t, r) => t + r.amount, 0)
      deals.push({ id: `DL-BP${pad(d++, 6)}`, clientId: c.id, allDay: false, start, end: start + 3600000, rows, total, status: 'Scheduled', finalAmount: null, remark: '', createdBy: u.id, updatedAt: NOW - int(0, 6) * DAY, bulk: 1 })
    }
  }
  is.activities = [...acts, ...is.activities]; is.deals = [...deals, ...is.deals]
  return { investments: acts.length, deals: deals.length }
}

// A deal rarely closes at exactly the amount planned: the planned amount of each closed demo deal is set between
// about 75% and 135% of what was invested (the closed amount, and the investment already recorded, stay as they are).
function variedPlans(is) {
  seed = 20261128; let n = 0
  for (const x of is.deals) {
    if (!x.bulk || x.status !== 'Completed' || !x.finalAmount || x.planVaried) continue
    const total = Math.max(1000, Math.round(x.finalAmount / (0.75 + rnd() * 0.6) / 1000) * 1000)
    if (x.rows?.length) x.rows[0].amount = Math.max(0, (Number(x.rows[0].amount) || 0) + total - (Number(x.total) || 0))
    x.total = total; x.planVaried = 1; n++
  }
  return n
}

// ------------------------------------------------------------------ run
const [P, I] = [await load(SITES.p), await load(SITES.i)]
if (!P.state || !I.state) throw new Error('A website has no data yet: open both websites once, then run this again.')
if (mode === 'remove') {
  for (const [k, x] of [['p', P], ['i', I]]) { strip(x.state); console.log(`${k === 'p' ? 'Prospect' : 'Investor'} DMS: bulk data removed`); await save(SITES[k], x.version, x.state) }
  process.exit(0)
}
if (mode === 'patch') {
  nameTeams(P.state.users); nameTeams(I.state.users)
  const n = poolCalls(P.state)
  console.log(`Teams named (${TEAMS.join(', ')}); calls on Pool records added: ${n || 'already there'}`)
  const m = investorMoney(I.state)
  console.log(`Investor DMS: ${m ? `${m.investments} investments and ${m.deals} deals ahead added` : 'investments already there'}; planned amounts varied on ${variedPlans(I.state)} closed deals`)
  await save(SITES.p, P.version, P.state); await save(SITES.i, I.version, I.state)
  process.exit(0)
}
if (P.state.users.some(isBulk) || I.state.users.some(isBulk)) { console.log('The bulk data is already there. Run "remove" first to load it again.'); process.exit(1) }

const org = makeOrg(P.state.users)
const pUsers = org.map((u) => ({ ...u, switches: ROLE_SWITCHES('p', u.role) }))
let dc = 501000
const iUsers = org.map((u) => ({ ...u, ...(u.role === 'IS' ? { dataCodes: [`INS${dc++}`] } : {}), switches: ROLE_SWITCHES('i', u.role) }))
// existing IS on Investor DMS already have data codes; new ones get theirs above
const pData = prospect({ users: P.state.users }, pUsers)
const converted = pData.clients.filter((c) => c.stage === 'Investor Family')
const iData = investor({ users: I.state.users }, iUsers, converted)

const sum = (o) => Object.entries(o).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ${v.length}`).join(', ')
console.log(`People: ${org.length} added (${org.filter((u) => u.role === 'VP').length} VP, ${org.filter((u) => u.role === 'TL').length} TL, ${org.filter((u) => u.role === 'IS').length} IS); days: ${DAYS.map((d) => new Date(d).toDateString().slice(0, 10)).join(', ')}`)
console.log(`Prospect DMS: ${sum(pData)}`)
console.log(`Investor DMS: ${sum(iData)}`)

const ps = P.state
ps.users.push(...pUsers)
for (const k of ['clients', 'calls', 'activities', 'wa', 'emails', 'events', 'handovers']) ps[k] = [...pData[k], ...ps[k]]
nameTeams(ps.users); poolCalls(ps)
await save(SITES.p, P.version, ps)
const is = I.state
is.users.push(...iUsers)
for (const k of ['clients', 'calls', 'deals', 'wa', 'emails', 'events']) is[k] = [...iData[k], ...is[k]]
is.f2Last = { ...(is.f2Last || {}), ...iData.f2 }
nameTeams(is.users)
investorMoney(is)
variedPlans(is)
await save(SITES.i, I.version, is)
console.log('Done. The open websites reload by themselves within about 10 seconds.')
