// bridge: the ONLY door between Prospect DMS and Investor DMS. Five flows, nothing more:
//   F1 Investor handover (P -> I), F1-ack (I -> P), F2 Family log (I -> P), F3 Number check (P asks; I and tp-sim answer),
//   F4 Busy blocks (both ways).
// Every message: own Admin switch, content stripped to the allowed fields (and the stripping logged), append-only
// audit log with a SHA-256 hash of the content and a hash chain so an edited line is detectable.
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnv, serve, send, readBody, readJson, writeJson, appendJsonl, readJsonl, sha256 } from '../lib/common.mjs'

const env = loadEnv()
const DIR = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(DIR, 'data')
const STATE = path.join(DATA, 'bridge-state.json')
const AUDIT = path.join(DATA, 'audit.jsonl')
const FAMLOG = path.join(DATA, 'family-log.jsonl')
const CONTRACT = path.join(DIR, 'contract', 'handover-contract.json')
fs.mkdirSync(DATA, { recursive: true })

const FLOWS = {
  F1: 'F1 Investor handover', F1_ACK: 'F1-ack Handover acknowledgement', F2: 'F2 Family log', F3: 'F3 Number check', F4: 'F4 Busy blocks',
}
const onOff = (v) => String(v || 'on').toLowerCase() !== 'off'
function freshState() {
  const switches = {}
  for (const k of Object.keys(FLOWS)) switches[k] = { on: onOff(env['FLOW_' + k]), status: 'Pending compliance sign-off', changedAt: null, changedBy: null }
  return { switches, handovers: {}, busy: { prospect: [], investor: [] }, famSeq: 0, auditSeq: 0, lastChain: '' }
}
let S = readJson(STATE, null) || freshState()
let famLog = readJsonl(FAMLOG)
const save = () => writeJson(STATE, S)
save()

// ---------------- audit ----------------
function audit(e) {
  const entry = { seq: ++S.auditSeq, at: new Date().toISOString(), ...e }
  entry.prevChain = S.lastChain
  entry.chain = sha256(S.lastChain + JSON.stringify(entry))
  S.lastChain = entry.chain
  appendJsonl(AUDIT, entry)
  save()
  return entry
}
/** Re-computes the chain; any edited, removed or reordered line breaks it. */
function verifyChain() {
  let prev = ''
  for (const e of readJsonl(AUDIT)) {
    const { chain, ...rest } = e
    if (rest.prevChain !== prev || sha256(prev + JSON.stringify(rest)) !== chain) return { ok: false, brokenAt: e.seq }
    prev = chain
  }
  return { ok: true }
}

// ---------------- callers ----------------
const callerOf = (req) => (req.headers['x-api-key'] === env.P_API_KEY ? 'P' : req.headers['x-api-key'] === env.I_API_KEY ? 'I' : null)
const actorOf = (req) => String(req.headers['x-actor'] || 'unknown').slice(0, 60)
// DECISION-26 (default, confirm): in the demo the website states the user's role; in production the bridge takes it
// from the company directory / SSO token. The website key still limits each caller to its own routes.
const isAdmin = (req) => req.headers['x-actor-role'] === 'Admin'
const SITE = { P: 'Prospect DMS', I: 'Investor DMS' }

function deny(req, res, url, why) {
  audit({ flow: '-', direction: '-', route: `${req.method} ${url.pathname}`, caller: SITE[callerOf(req)] || 'unknown', actor: actorOf(req), hash: null, result: 'forbidden', note: why })
  send(res, 403, { error: 'Forbidden: ' + why })
}
function flowOff(req, res, url, flow) {
  audit({ flow, direction: '-', route: `${req.method} ${url.pathname}`, caller: SITE[callerOf(req)], actor: actorOf(req), hash: null, result: 'blocked: flow switched off' })
  send(res, 503, { error: `${FLOWS[flow]} is switched off by Admin.`, flowOff: true })
}

// ---------------- stripping ----------------
const contract = () => JSON.parse(fs.readFileSync(CONTRACT, 'utf8'))
function pick(obj, allowed, where, stripped) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) { if (allowed.includes(k)) out[k] = v; else stripped.push(where + k) }
  return out
}
function stripHandover(body) {
  const c = contract(); const stripped = []
  const out = pick(body, [...c.meta, ...c.group], '', stripped)
  out.members = (Array.isArray(out.members) ? out.members : []).map((m, i) => {
    const p = pick(m, c.person, `members[${i}].`, stripped)
    for (const [list, fields] of Object.entries(c.personLists)) if (Array.isArray(p[list])) p[list] = p[list].map((x, j) => pick(x, fields, `members[${i}].${list}[${j}].`, stripped))
    return p
  })
  out.contractVersion = c.contractVersion
  return { out, stripped }
}
const FAM_FIELDS = ['familyId', 'advisorMhfId', 'status', 'investedLast18Months', 'updatedAt']
const BUSY_FIELDS = ['userMhfId', 'start', 'end', 'allDay']
const ACK_FIELDS = ['status', 'reasonCode', 'at']

// ---------------- routes ----------------
const P = ['P'], I = ['I'], BOTH = ['P', 'I']
const route = (method, re, who, flow, fn) => [method, re, async (req, res, m, url) => {
  const caller = callerOf(req)
  if (!caller || !who.includes(caller)) return deny(req, res, url, `${SITE[caller] || 'this caller'} may not call ${method} ${url.pathname}`)
  if (flow && !S.switches[flow].on) return flowOff(req, res, url, flow)
  return fn(req, res, m, url, caller)
}]
const adminRoute = (method, re, fn) => [method, re, async (req, res, m, url) => {
  if (!callerOf(req) || !isAdmin(req)) return deny(req, res, url, 'Admin of either website only')
  return fn(req, res, m, url)
}]

async function forward(url, items) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.BRIDGE_LOOKUP_KEY }, body: JSON.stringify({ items }), signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`${url} answered ${r.status}`)
  return (await r.json()).answers
}

const routes = [
  ['GET', /^\/health$/, (req, res) => send(res, 200, { ok: true, service: 'bridge' })],

  // ---- F1 Investor handover ----
  route('POST', /^\/handover$/, P, 'F1', async (req, res, m, url) => {
    const body = await readBody(req)
    const key = String(body.idempotencyKey || '')
    if (!/^HND-\d{8}-\d+$/.test(key)) return send(res, 400, { error: 'idempotencyKey must look like HND-yyyymmdd-seq' })
    const existing = S.handovers[key]
    if (existing && !(existing.status === 'Rejected' && req.headers['x-retry'] === '1')) {
      audit({ flow: 'F1', direction: 'Prospect DMS → bridge', route: 'POST /handover', caller: 'Prospect DMS', actor: actorOf(req), hash: existing.hash, result: 'duplicate: first result returned', ref: key })
      return send(res, 200, { handoverId: key, status: existing.status, reasonCode: existing.reasonCode || null, duplicate: true })
    }
    const { out, stripped } = stripHandover(body)
    out.handoverId = key
    const hash = sha256(out)
    S.handovers[key] = { handoverId: key, payload: out, hash, status: 'Delivered', reasonCode: null, receivedAt: new Date().toISOString(), ackAt: null, attempts: (existing?.attempts || 0) + 1, members: out.members.length, contractVersion: out.contractVersion }
    save()
    audit({ flow: 'F1', direction: 'Prospect DMS → bridge', route: 'POST /handover', caller: 'Prospect DMS', actor: actorOf(req), hash, result: existing ? 'accepted for retry' : 'accepted', ref: key, stripped: stripped.length ? stripped : undefined, members: out.members.length })
    send(res, 200, { handoverId: key, status: 'Delivered', hash, stripped })
  }),
  route('GET', /^\/handover\/inbox$/, I, 'F1', (req, res) => {
    const items = Object.values(S.handovers).filter((h) => h.status === 'Delivered').map((h) => ({ ...h.payload, _hash: h.hash, _attempts: h.attempts }))
    if (items.length) audit({ flow: 'F1', direction: 'bridge → Investor DMS', route: 'GET /handover/inbox', caller: 'Investor DMS', actor: actorOf(req), hash: sha256(items.map((i) => i._hash).join()), result: `delivered ${items.length}`, ref: items.map((i) => i.handoverId).join(' ') })
    send(res, 200, { items })
  }),
  route('GET', /^\/handover\/([^/]+)\/status$/, P, 'F1_ACK', (req, res, m) => {
    const h = S.handovers[decodeURIComponent(m[1])]
    if (!h) return send(res, 404, { error: 'unknown handover' })
    send(res, 200, { handoverId: h.handoverId, status: h.status, reasonCode: h.reasonCode, at: h.ackAt })
  }),
  route('POST', /^\/handover\/([^/]+)\/ack$/, I, 'F1_ACK', async (req, res, m, url) => {
    const id = decodeURIComponent(m[1]); const h = S.handovers[id]
    if (!h) return send(res, 404, { error: 'unknown handover' })
    const stripped = []; const ack = pick(await readBody(req), ACK_FIELDS, '', stripped)
    if (!['Accepted', 'Rejected'].includes(ack.status)) return send(res, 400, { error: 'status must be Accepted or Rejected' })
    const hash = sha256({ handoverId: id, ...ack })
    if (h.status === ack.status) { audit({ flow: 'F1_ACK', direction: 'Investor DMS → bridge', route: 'POST /handover/:id/ack', caller: 'Investor DMS', actor: actorOf(req), hash, result: 'duplicate ack', ref: id }); return send(res, 200, { ok: true, duplicate: true }) }
    h.status = ack.status; h.reasonCode = ack.reasonCode || null; h.ackAt = ack.at || new Date().toISOString()
    // DECISION-24 (default, confirm): data minimisation - once Investor DMS has answered, the bridge keeps only the hash.
    h.payload = null
    save()
    audit({ flow: 'F1_ACK', direction: 'Investor DMS → bridge', route: 'POST /handover/:id/ack', caller: 'Investor DMS', actor: actorOf(req), hash, result: ack.status + (ack.reasonCode ? ` (${ack.reasonCode})` : ''), ref: id, stripped: stripped.length ? stripped : undefined })
    send(res, 200, { ok: true })
  }),

  // ---- F2 Family log ----
  route('POST', /^\/family-log$/, I, 'F2', async (req, res) => {
    const body = await readBody(req)
    const mode = body.mode === 'snapshot' ? 'snapshot' : 'change'
    const stripped = []
    const entries = (body.entries || []).map((e, i) => pick(e, FAM_FIELDS, `entries[${i}].`, stripped))
      .filter((e) => e.familyId && ['Assigned', 'Unassigned'].includes(e.status))
    const snapshotId = mode === 'snapshot' ? 'SNAP-' + Date.now() : null
    const added = entries.map((e) => ({ seq: ++S.famSeq, mode, snapshotId, ...e, investedLast18Months: e.investedLast18Months === 'Yes' ? 'Yes' : 'No' }))
    for (const a of added) appendJsonl(FAMLOG, a)
    famLog.push(...added); save()
    audit({ flow: 'F2', direction: 'Investor DMS → bridge', route: 'POST /family-log', caller: 'Investor DMS', actor: actorOf(req), hash: sha256(added), result: `${mode}: ${added.length} entr${added.length === 1 ? 'y' : 'ies'}`, ref: added.length === 1 ? added[0].familyId : snapshotId || undefined, stripped: stripped.length ? stripped : undefined })
    send(res, 200, { ok: true, count: added.length, lastSeq: S.famSeq })
  }),
  route('GET', /^\/family-log$/, P, 'F2', (req, res, m, url) => {
    const since = Number(url.searchParams.get('since') || 0)
    const items = famLog.filter((e) => e.seq > since)
    if (items.length) audit({ flow: 'F2', direction: 'bridge → Prospect DMS', route: 'GET /family-log', caller: 'Prospect DMS', actor: actorOf(req), hash: sha256(items), result: `delivered ${items.length}` })
    send(res, 200, { items, lastSeq: S.famSeq })
  }),

  // ---- F3 Number check ----
  route('POST', /^\/number-check$/, P, 'F3', async (req, res) => {
    const body = await readBody(req)
    const items = [...new Set((body.items || []).map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 20000)
    let a1, a2
    try { [a1, a2] = await Promise.all([forward(`http://127.0.0.1:${env.I_API_PORT}/lookup`, items), forward(`http://127.0.0.1:${env.TP_SIM_PORT}/tp/lookup`, items)]) } catch (e) {
      audit({ flow: 'F3', direction: 'Prospect DMS → bridge', route: 'POST /number-check', caller: 'Prospect DMS', actor: actorOf(req), hash: sha256(items), result: 'failed: an answering system is unreachable', count: items.length })
      return send(res, 502, { error: 'Number check is not available right now.' })
    }
    const answers = items.map((item, i) => ({ item, exists: a1[i]?.exists === 'Yes' || a2[i]?.exists === 'Yes' ? 'Yes' : 'No' }))
    const yes = answers.filter((a) => a.exists === 'Yes').length
    audit({ flow: 'F3', direction: 'Prospect DMS ⇄ Investor DMS + tp-sim', route: 'POST /number-check', caller: 'Prospect DMS', actor: actorOf(req), hash: sha256(answers), result: `answered ${items.length} (${yes} Yes)`, count: items.length })
    send(res, 200, { answers })
  }),

  // ---- F4 Busy blocks ----
  ...[['prospect', P, 'Prospect DMS'], ['investor', I, 'Investor DMS']].flatMap(([side, who, site]) => [
    route('PUT', new RegExp(`^/busy/${side}$`), who, 'F4', async (req, res) => {
      const body = await readBody(req); const stripped = []
      const blocks = (body.blocks || []).map((b, i) => pick(b, BUSY_FIELDS, `blocks[${i}].`, stripped)).filter((b) => b.userMhfId && b.start && b.end)
      S.busy[side] = blocks; save()
      audit({ flow: 'F4', direction: `${site} → bridge`, route: `PUT /busy/${side}`, caller: site, actor: actorOf(req), hash: sha256(blocks), result: `published ${blocks.length} block(s)`, stripped: stripped.length ? stripped.slice(0, 20) : undefined })
      send(res, 200, { ok: true, count: blocks.length })
    }),
  ]),
  ...[['investor', P], ['prospect', I]].map(([side, who]) => route('GET', new RegExp(`^/busy/${side}$`), who, 'F4', (req, res, m, url) => {
    const user = url.searchParams.get('user'); const from = Number(url.searchParams.get('from') || 0); const to = Number(url.searchParams.get('to') || 8e15)
    send(res, 200, { blocks: S.busy[side].filter((b) => (!user || b.userMhfId === user) && b.end >= from && b.start <= to) })
  })),

  // ---- read-only for both websites: DECISION-25 (default, confirm) - switch states and the contract are not secret,
  // every screen needs them (manual fallback page, field list in the wizard). Changing a switch and the audit log stay Admin-only.
  route('GET', /^\/switches$/, BOTH, null, (req, res) => send(res, 200, { switches: S.switches, flows: FLOWS })),
  route('GET', /^\/contract$/, BOTH, null, (req, res) => send(res, 200, contract())),

  // ---- Admin of either website ----
  adminRoute('PUT', /^\/switches$/, async (req, res) => {
    const b = await readBody(req)
    const sw = S.switches[b.flow]; if (!sw) return send(res, 400, { error: 'unknown flow' })
    const before = { ...sw }
    if (typeof b.on === 'boolean') sw.on = b.on
    if (['Pending compliance sign-off', 'Approved'].includes(b.status)) sw.status = b.status
    sw.changedAt = new Date().toISOString(); sw.changedBy = actorOf(req); save()
    audit({ flow: b.flow, direction: '-', route: 'PUT /switches', caller: SITE[callerOf(req)], actor: actorOf(req), hash: sha256(sw), result: `switch ${before.on ? 'on' : 'off'} → ${sw.on ? 'on' : 'off'}; ${before.status} → ${sw.status}` })
    send(res, 200, { switches: S.switches })
  }),
  adminRoute('GET', /^\/audit$/, (req, res, m, url) => {
    const flow = url.searchParams.get('flow')
    const items = readJsonl(AUDIT).filter((e) => !flow || e.flow === flow).reverse()
    send(res, 200, { items, chain: verifyChain() })
  }),
  adminRoute('GET', /^\/audit\.csv$/, (req, res) => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Seq', 'Date Time (UTC)', 'Flow', 'Direction', 'Route', 'Caller', 'Actor', 'Result', 'Reference', 'Content SHA-256', 'Stripped fields', 'Chain hash']
    const rows = readJsonl(AUDIT).map((e) => [e.seq, e.at, e.flow, e.direction, e.route, e.caller, e.actor, e.result, e.ref, e.hash, (e.stripped || []).join(' '), e.chain])
    send(res, 200, '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n'), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="bridge-audit-log.csv"' })
  }),
  adminRoute('GET', /^\/handovers$/, (req, res) => send(res, 200, { items: Object.values(S.handovers).map(({ payload, ...h }) => h) })),
  adminRoute('GET', /^\/family-log\/all$/, (req, res) => send(res, 200, { items: famLog.slice().reverse() })),
  ['POST', /^\/reset$/, (req, res) => {
    // demo reset (npm run reset:all); audit history is archived, never edited
    if (fs.existsSync(AUDIT)) fs.renameSync(AUDIT, path.join(DATA, `audit-archived-${Date.now()}.jsonl`))
    if (fs.existsSync(FAMLOG)) fs.renameSync(FAMLOG, path.join(DATA, `family-log-archived-${Date.now()}.jsonl`))
    S = freshState(); famLog = []; save()
    send(res, 200, { ok: true })
  }],
]

// Anything else: 403 and logged
for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) routes.push([method, /.*/, (req, res, m, url) => deny(req, res, url, 'route not allowed')])

serve({ name: 'bridge', port: env.BRIDGE_PORT, host: env.HOST, routes, onRequest: (req, res, url) => {
  // /reset only from this machine
  if (url.pathname === '/reset' && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { send(res, 403, { error: 'local only' }); return false }
  return true
} })
