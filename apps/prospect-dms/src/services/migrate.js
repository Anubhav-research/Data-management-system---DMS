// One-time data fixes for data already on the server (they also run safely on every start: each step only
// acts on old-format entries, so running it again changes nothing).
//  1. Record journey: every record shows where it came from (Pool), then Pool -> Prospect -> Lead (-> Investor).
//     Older data had a single "Moved to Lead" / "Moved to Prospect" / "Moved to Investor Family" entry.
//  2. Wording: no "handover" in anything a user reads (activity, notifications).
import { reactive, toRaw } from 'vue'
import { useDb } from '@/stores/db'

const HOUR = 3600000, DAY = 24 * HOUR
const POOL_ENTRY = /^(Added to the Pool|imported it into the Pool)/
const NOT_FROM_POOL = /^(Prospect created|Created from group removal)/

const WORDING = [
  [/^(\d+) member\(s\) converted to Investor and handed over to Investor DMS \([^)]*\)\. Family moved to Investor Family\.( \[wording TBD\])?$/, 'converted $1 member(s) to Investor. Family moved to Investor Family.'],
  [/^Investor DMS accepted handover \S+?\.( \[wording TBD\])?$/, 'Conversion confirmed by Investor DMS.'],
  [/^Investor DMS rejected handover \S+?( \(([^)]*)\))?\.( \[wording TBD\])?$/, (m, a, code) => `Conversion not accepted by Investor DMS${code ? ` (${code})` : ''}.`],
  [/^Admin retried handover \S+?\.( \[wording TBD\])?$/, 'Admin retried the conversion.'],
  [/^Admin reverted handover \S+?\. Record returned to (.+?)\.( \[wording TBD\])?$/, 'Admin reverted the conversion. Record returned to $1.'],
  [/^Moved from Prospect to Lead$/, 'moved it from Prospect to Lead'],
  [/^Moved from Lead to Prospect$/, 'moved it from Lead to Prospect'],
  [/^Moved to Prospect$/, 'moved it from Pool to Prospect'],
]

export function migrateData() {
  const db = useDb()
  let changed = 0
  changed += stripWordingMarker(db)
  // quiz notifications that reached Admin by mistake (21 Nov 2026): Admin is never notified of quizzes
  { const admins = new Set(db.users.filter((x) => x.role === 'Admin').map((x) => x.id)); const before = db.notifications.length; db.notifications = db.notifications.filter((n) => !(n.code === 'QUIZ' && admins.has(n.to))); changed += before - db.notifications.length }
  // new switch 'WhatsApp: Send Documents' (17 Nov 2026): on for advisors, off for Admin (as the other messaging switches)
  for (const u of db.users) if (u.switches && u.switches.wa_document === undefined) { u.switches.wa_document = u.role !== 'Admin'; changed++ }
  const byClient = new Map()
  for (const a of db.activities) { if (!byClient.has(a.clientId)) byClient.set(a.clientId, []); byClient.get(a.clientId).push(a) }
  const add = (c, at, actor, text) => { db.activities.push({ id: db.nextId('A'), clientId: c.id, at, actor, type: 'stage', text }); changed++ }

  // wording (activity + notifications)
  for (const a of db.activities) {
    for (const [re, to] of WORDING) if (re.test(a.text || '')) { a.text = a.text.replace(re, to); changed++; break }
  }
  for (const n of db.notifications || []) {
    const m = /^Handover \S+ failed( \([^)]*\))?\./.exec(n.text || '')
    if (m) { n.text = n.text.replace(m[0], `Conversion to Investor failed${m[1] || ''}.`); changed++ }
  }

  // messages of investors converted before memberKey existed: numbers no member holds any more belong to an investor;
  // the seeded chats are the family primary's, so they go to the primary when the primary is an investor
  const holder = new Map()
  for (const c of db.clients) for (const mem of c.members) for (const x of mem.contacts || []) holder.set(`${c.id}|${String(x.mobile).replace(/\D/g, '').slice(-10)}`, mem.key)
  for (const w of db.wa) {
    if (w.memberKey) continue
    const c = db.clientById(w.clientId); const p = c?.members[0]
    if (!p?.investor || holder.has(`${w.clientId}|${String(w.mobile).replace(/\D/g, '').slice(-10)}`)) continue
    w.memberKey = p.key; changed++
  }

  // 3. no Unassigned Family section any more (product owner, 13 Nov 2026): back to Investor Family with the previous advisor
  for (const c of db.clients.filter((x) => x.stage === 'Unassigned Family')) {
    c.stage = 'Investor Family'; c.assignedTo = c.prevOwner || null; c.unassignedSince = null; c.investorUnassigned = c.investorUnassigned || Date.now()
    if (c.assignedTo) c.ownershipHistory = [...(c.ownershipHistory || []), { userId: c.assignedTo, from: Date.now(), to: null }]
    db.activities.push({ id: db.nextId('A'), clientId: c.id, at: Date.now(), actor: null, type: 'owner', text: `Back in Investor Family with ${db.userById(c.assignedTo)?.name || 'no IS'}. The investor is in Unassigned Investors in Investor DMS; the family moves when Admin assigns a new IS there.` })
    changed++
  }

  for (const c of db.clients) {
    const acts = byClient.get(c.id) || []
    if (acts.some((a) => NOT_FROM_POOL.test(a.text || ''))) continue // created directly, never in the Pool
    const took = c.takeoverDate || null
    const firstCallAfter = (t) => Math.min(...db.calls.filter((x) => x.clientId === c.id && x.at > t).map((x) => x.at), Date.now())

    // 1a. the Pool entry
    if (c.importDate && !acts.some((a) => POOL_ENTRY.test(a.text || ''))) {
      const firstStep = Math.min(...acts.map((a) => a.at), took || Infinity)
      const at = c.importDate < firstStep ? c.importDate : firstStep - 3 * DAY
      c.importDate = at
      add(c, at, null, `Added to the Pool (${c.source || 'Import'} import)`)
    }

    // 1b. an old single "Moved to Lead" / "Moved to Investor Family" becomes Pool -> Prospect -> Lead (-> Investor)
    for (const a of acts) {
      if (a.text !== 'Moved to Lead' && a.text !== 'Moved to Investor Family') continue
      const toFamily = a.text === 'Moved to Investor Family'
      const start = a.at
      a.text = 'moved it from Pool to Prospect'; changed++
      const end = toFamily && c.convertedAt ? Math.min(c.convertedAt, firstCallAfter(start)) : firstCallAfter(start)
      const leadAt = start + Math.max(HOUR, Math.floor((end - start) / 2))
      add(c, leadAt, a.actor, 'moved it from Prospect to Lead')
      if (toFamily && !acts.some((x) => /converted .*to Investor/.test(x.text || ''))) add(c, c.convertedAt && c.convertedAt > leadAt ? c.convertedAt : leadAt + DAY, a.actor, 'converted to Investor. Family moved to Investor Family.')
    }
  }
  // seeded investor families had no Client ID / platform family, so the conversion wizard could not tell a member who
  // registered in a different platform family (separate investor group) from one joining the existing group
  const SEEDED = { 'HND-20250512-0001': ['CID60901', 'PF-20901'], 'HND-20260315-0002': ['CID60902', 'PF-20902'], 'HND-20241104-0003': ['CID60903', 'PF-20903'] }
  for (const c of db.clients) for (const m of c.members || []) {
    const known = m.investor && !m.investor.cid && SEEDED[m.investor.handoverId]
    if (!known) continue
    m.investor.cid = known[0]; m.investor.platformFamilyId = known[1]
    if (!c.platformFamilyId) c.platformFamilyId = known[1]
    changed++
  }
  return changed
}

// Old saved texts (activities, notifications, exceptions...) may still end with the '[wording TBD]' marker, which is
// no longer shown anywhere (product owner, 16 Nov 2026): remove it from every saved string.
function stripWordingMarker(db) {
  const RE = / ?\[wording\b[^\]]*(?:\]|$)/g // also a marker cut short at the end of a text
  let n = 0
  // read the plain data (fast with thousands of records); change a text through its reactive object so it is saved
  const walk = (o) => {
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (typeof v === 'string') { if (v.includes('[wording')) { reactive(o)[k] = v.replace(RE, ''); n++ } } else if (v && typeof v === 'object') walk(v)
    }
  }
  walk(toRaw(db.$state))
  return n
}
