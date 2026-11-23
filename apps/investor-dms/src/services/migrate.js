// One-time data fixes for data already on the server (safe to run on every start: only old-format entries change).
// No "handover" in anything a user reads: the record source and the "Received from Prospect DMS" activity.
import { useDb } from '@/stores/db'
import { clientName } from './lifecycle'

export function migrateData() {
  const db = useDb()
  let changed = 0
  changed += stripWordingMarker(db)
  // quiz notifications that reached Admin by mistake (21 Nov 2026): Admin is never notified of quizzes
  { const admins = new Set(db.users.filter((x) => x.role === 'Admin').map((x) => x.id)); const before = db.notifications.length; db.notifications = db.notifications.filter((n) => !(n.code === 'QUIZ' && admins.has(n.to))); changed += before - db.notifications.length }
  // new switch 'WhatsApp: Send Documents' (as in Prospect DMS, 17 Nov 2026): on for advisors, off for Admin
  for (const u of db.users) if (u.switches && u.switches.wa_document === undefined) { u.switches.wa_document = u.role !== 'Admin'; changed++ }
  for (const c of db.clients) if (c.source === 'Prospect DMS handover') { c.source = 'Prospect DMS'; changed++ }
  for (const a of db.activities) {
    if (/ Handover HND-\S+?\./.test(a.text || '')) { a.text = a.text.replace(/ Handover HND-\S+?\./, ''); changed++ }
  }
  // junked investors seeded without an investment history although they are Inactive (invested before): fill it from
  // the previous Data Code's specialist, a fixed per-record value, so the Junk list shows AUM and last investment
  const CODE_OWNER = { INS500038: 'u_is2', INS500031: 'u_is4' }
  for (const c of db.clients) {
    if (c.stage !== 'Junk' || c.invStatus !== 'Inactive' || c.lastInvDate || c.aum) continue
    const n = Number(String(c.cid || '').replace(/\D/g, '')) || 1
    c.sourceIs = c.sourceIs || CODE_OWNER[c.prevDataCode] || null
    c.lastInvDate = Date.now() - (560 + (n * 37) % 300) * 86400000
    c.lastInvProduct = ['MF Equity', 'MF Debt', 'FD'][n % 3]; c.lastInvAmount = (2 + (n % 15)) * 25000; c.aum = (1 + (n * 7) % 20) * 100000 + c.lastInvAmount // AUM includes the last investment
    changed++
  }
  changed += fillInvestorHistory(db)
  // invested value (21 Nov 2026): the money in the investments held now; AUM is what they are worth. Fixed per record:
  // most investors between 8% down and 24% up on what they put in.
  for (const c of db.clients) {
    if (!c.aum || c.investedV === 2) continue // investedV 2: worked out with the fixed per-record spread
    const n = Number(String(c.cid || c.id).replace(/\D/g, '')) || 1
    c.investedV = 2
    c.invested = Math.round(c.aum / (1 + (((n * 37) % 33) - 8) / 100) / 1000) * 1000
    changed++
  }
  changed += seedJunkLog(db)
  return changed
}

// Demo investors (Investors, Unassigned, Junk): the lifetime amount invested (in production it comes from the Transaction Platform) and the
// specialists who held the Unassigned and junked ones before, the last one owning their previous Data Code. Fixed per record.
function fillInvestorHistory(db) {
  let changed = 0
  const IS = ['u_is1', 'u_is2', 'u_is4', 'u_is5']
  for (const c of db.clients) {
    if (!['Investor', 'Unassigned', 'Junk'].includes(c.stage)) continue
    const n = Number(String(c.cid || '').replace(/\D/g, '')) || 1
    if (c.totalInvested == null && c.lastInvAmount) {
      // a third still hold more than they put in (market gain), the rest took part of it out
      c.totalInvested = Math.max(c.lastInvAmount, Math.round((c.aum || 0) * [0.85, 1.6, 3.2][n % 3] / 25000) * 25000)
      changed++
    }
    if (c.stage !== 'Investor' && !c.ownershipHistory?.length) {
      const last = db.users.find((u) => u.dataCodes?.includes(c.prevDataCode))?.id || c.sourceIs
      const before = IS.filter((u) => u !== last).slice(0, n % 3) // 0-2 earlier specialists
      const start = (c.lastInvDate || Date.now()) - 400 * 86400000
      const ids = [...before, last].filter(Boolean)
      c.ownershipHistory = ids.map((userId, i) => ({ userId, dataCode: db.users.find((u) => u.id === userId)?.dataCodes?.[0] || null,
        from: start + i * 200 * 86400000, to: i < ids.length - 1 ? start + (i + 1) * 200 * 86400000 : c.unassignedSince || c.movedOn || null }))
      changed++
    }
  }
  return changed
}

// Demo Junk log (only while it is empty): the Admin's move to Junk of each junked investor, with a reason, plus one
// investor that was junked by mistake and restored, so the CSV shows both actions. The saved copy is the record as it
// was just before the action, the same as a real entry.
function seedJunkLog(db) {
  const junk = db.clients.filter((c) => c.stage === 'Junk').sort((a, b) => (a.movedOn || 0) - (b.movedOn || 0))
  if (db.junkLog.length || !junk.length) return 0
  const admin = db.users.find((u) => u.id === 'u_admin'); const by = admin ? `${admin.name} (${admin.mhf_id})` : 'Admin'
  const name = clientName
  const copy = (c, patch) => JSON.stringify({ ...JSON.parse(JSON.stringify(c)), ...patch })
  const REASONS = ['Not reachable for 6 months; both numbers switched off', 'Client asked not to be contacted again', 'Moved abroad; not investing in India any more']
  const log = []
  junk.forEach((c, i) => {
    c.junkComment = c.junkComment || REASONS[i % REASONS.length]
    log.push({ at: c.movedOn || Date.now(), action: 'Moved to Junk', by, clientId: c.id, name: name(c), from: 'Unassigned', comment: c.junkComment,
      record: copy(c, { stage: 'Unassigned', movedFrom: null, movedOn: null, movedBy: null, junkComment: null }) })
  })
  const back = db.clients.find((c) => c.stage === 'Unassigned' && c.cid && c.lastInvDate && c.unassignedSince)
  if (back) {
    const restoredAt = back.unassignedSince; const junkedAt = restoredAt - 12 * 86400000
    log.push({ at: junkedAt, action: 'Moved to Junk', by, clientId: back.id, name: name(back), from: 'Unassigned', comment: 'Number not reachable', record: copy(back, { unassignedSince: junkedAt - 30 * 86400000 }) },
      { at: restoredAt, action: 'Restored to Unassigned', by, clientId: back.id, name: name(back), from: 'Unassigned', comment: '',
        record: copy(back, { stage: 'Junk', movedFrom: 'Unassigned', movedOn: junkedAt, movedBy: 'Admin', junkComment: 'Number not reachable' }) })
    db.activities.push({ id: db.nextId('A'), clientId: back.id, at: junkedAt, actor: 'u_admin', type: 'stage', text: 'Moved to Junk by Admin – “Number not reachable”' },
      { id: db.nextId('A'), clientId: back.id, at: restoredAt, actor: 'u_admin', type: 'stage', text: 'Restored from Junk to Unassigned Investors' })
  }
  db.junkLog.push(...log.sort((a, b) => a.at - b.at))
  return log.length
}

// Old saved texts (activities, notifications, exceptions...) may still end with the '[wording TBD]' marker, which is
// no longer shown anywhere (product owner, 16 Nov 2026): remove it from every saved string.
function stripWordingMarker(db) {
  const RE = / ?\[wording\b[^\]]*(?:\]|$)/g // also a marker cut short at the end of a text
  let n = 0
  const walk = (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of Object.keys(o)) {
      const v = o[k]
      if (typeof v === 'string') { if (v.includes("[wording")) { o[k] = v.replace(RE, ''); n++ } } else if (v && typeof v === 'object') walk(v)
    }
  }
  walk(db.$state)
  return n
}
