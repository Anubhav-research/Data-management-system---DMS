// tp-sim: Transaction Platform SIMULATOR. Not a real system. Holds registered clients (PAN, CID, platform family,
// mapped advisor, investments). Console page at http://localhost:4103/ .
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadEnv, serve, send, readBody, readJson, writeJson } from '../lib/common.mjs'

const env = loadEnv()
const DIR = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(DIR, 'data', 'tp-db.json')
const DAY = 86400000
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const CID_RE = /^CID\d+$/
const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10)

function freshDb() {
  const seed = JSON.parse(fs.readFileSync(path.join(DIR, 'seed.json'), 'utf8'))
  const now = Date.now()
  let seq = 0
  const db = { advisors: seed.advisors, examples: seed.examples, clients: [], investments: [], registrations: [], seq: 0, cidSeq: 60100 }
  for (const c of seed.clients) {
    const registeredAt = now - c.registeredDaysAgo * DAY
    db.clients.push({ cid: c.cid, pan: c.pan, name: c.name, mobiles: c.mobiles, platformFamilyId: c.platformFamilyId, advisorMhfId: c.advisorMhfId, registeredAt, selfRegistered: c.selfRegistered })
    db.registrations.push({ seq: ++seq, cid: c.cid, pan: c.pan, registeredAt, selfRegistered: c.selfRegistered })
    for (const i of c.investments) db.investments.push({ seq: ++seq, id: 'INV-' + seq, cid: c.cid, date: now - i.daysAgo * DAY, product: i.product, amount: i.amount })
  }
  db.seq = seq
  return db
}
let db = readJson(FILE, null) || freshDb()
const save = () => writeJson(FILE, db)
save()

const advisorName = (mhf) => db.advisors.find((a) => a.mhfId === mhf)?.name || mhf
const byValue = (v) => { const t = String(v || '').trim().toUpperCase(); return db.clients.find((c) => c.pan === t || c.cid === t) }

// Who may call what (keys are added by each website's Vite proxy; the console page is local-only demo UI).
const RULES = [
  [/^\/tp\/verify$/, [env.P_API_KEY]],
  [/^\/tp\/registrations$/, [env.P_API_KEY]],
  [/^\/tp\/investments$/, [env.I_API_KEY]],
  [/^\/tp\/profile\//, [env.I_API_KEY]],
  [/^\/tp\/lookup$/, [env.BRIDGE_LOOKUP_KEY]],
]
function guard(req, res, url) {
  const rule = RULES.find(([re]) => re.test(url.pathname))
  if (!rule) return true
  if (rule[1].includes(req.headers['x-api-key'])) return true
  send(res, 403, { error: 'Forbidden for this key.' }); return false
}

function register({ name, pan, mobile, platformFamilyId, advisorMhfId, selfRegistered }) {
  const p = String(pan || '').trim().toUpperCase()
  if (!PAN_RE.test(p)) throw Object.assign(new Error('PAN format must be AAAAA9999A.'), { status: 400 })
  if (db.clients.some((c) => c.pan === p)) throw Object.assign(new Error('This PAN is already registered on the platform.'), { status: 400 })
  const cid = 'CID' + ++db.cidSeq
  const registeredAt = Date.now()
  const c = { cid, pan: p, name: String(name || '').trim() || 'Unnamed', mobiles: mobile ? [digits(mobile)] : [], platformFamilyId: platformFamilyId || 'PF-' + (30100 + db.cidSeq), advisorMhfId: advisorMhfId || null, registeredAt, selfRegistered: !!selfRegistered }
  db.clients.push(c)
  db.registrations.push({ seq: ++db.seq, cid, pan: p, registeredAt, selfRegistered: !!selfRegistered })
  save(); return c
}

const consoleHtml = () => fs.readFileSync(path.join(DIR, 'console.html'), 'utf8')

serve({
  name: 'tp-sim', port: env.TP_SIM_PORT, host: env.HOST, onRequest: guard,
  routes: [
    ['GET', /^\/$/, (req, res) => send(res, 200, consoleHtml(), { 'content-type': 'text/html; charset=utf-8' })],
    ['GET', /^\/health$/, (req, res) => send(res, 200, { ok: true, service: 'tp-sim' })],
    // ---- console (simulator UI) ----
    ['GET', /^\/console\/state$/, (req, res) => send(res, 200, { ...db, clients: db.clients.map((c) => ({ ...c, advisorName: c.advisorMhfId ? advisorName(c.advisorMhfId) : null, investments: db.investments.filter((i) => i.cid === c.cid) })) })],
    ['POST', /^\/console\/register$/, async (req, res) => send(res, 200, register(await readBody(req)))],
    ['POST', /^\/console\/invest$/, async (req, res) => {
      const b = await readBody(req)
      const c = db.clients.find((x) => x.cid === b.cid); if (!c) return send(res, 400, { error: 'Unknown CID' })
      const amount = Number(b.amount); if (!(amount > 0)) return send(res, 400, { error: 'Amount must be above 0' })
      const inv = { seq: ++db.seq, id: 'INV-' + db.seq, cid: c.cid, date: b.date ? new Date(b.date).getTime() : Date.now(), product: b.product || 'MF Equity', amount }
      db.investments.push(inv); save(); send(res, 200, inv)
    }],
    ['POST', /^\/console\/map$/, async (req, res) => {
      const b = await readBody(req)
      const c = db.clients.find((x) => x.cid === b.cid); if (!c) return send(res, 400, { error: 'Unknown CID' })
      c.advisorMhfId = b.advisorMhfId || null; save(); send(res, 200, c)
    }],
    ['POST', /^\/console\/reset$/, (req, res) => { db = freshDb(); save(); send(res, 200, { ok: true }) }],
    // ---- platform API ----
    /** Verification for the conversion wizard. Returns only what the wizard needs to decide the row state. */
    ['POST', /^\/tp\/verify$/, async (req, res) => {
      const b = await readBody(req)
      const v = String(b.value || '').trim().toUpperCase()
      if (!v) return send(res, 200, { result: 'empty' })
      if (!PAN_RE.test(v) && !CID_RE.test(v)) return send(res, 200, { result: 'invalid' })
      const c = byValue(v)
      if (!c) return send(res, 200, { result: 'nomatch' })
      send(res, 200, { result: 'registered', pan: c.pan, cid: c.cid, platformFamilyId: c.platformFamilyId, advisorMhfId: c.advisorMhfId, advisorName: c.advisorMhfId ? advisorName(c.advisorMhfId) : null })
    }],
    /** F3 helper for the bridge: Yes/No per mobile or PAN, nothing else. */
    ['POST', /^\/tp\/lookup$/, async (req, res) => {
      const b = await readBody(req)
      const pans = new Set(db.clients.map((c) => c.pan)); const mobiles = new Set(db.clients.flatMap((c) => c.mobiles.map(digits)))
      send(res, 200, { answers: (b.items || []).map((v) => { const t = String(v || '').trim().toUpperCase(); return { item: v, exists: (PAN_RE.test(t) ? pans.has(t) : mobiles.has(digits(t))) ? 'Yes' : 'No' } }) })
    }],
    /** Read by Prospect DMS: who registered since a sequence number (self-registration alerts). PAN + CID + date only. */
    ['GET', /^\/tp\/registrations$/, (req, res, m, url) => {
      const since = Number(url.searchParams.get('since') || 0)
      send(res, 200, { last: db.seq, items: db.registrations.filter((r) => r.seq > since) })
    }],
    /** Read by Investor DMS. */
    ['GET', /^\/tp\/investments$/, (req, res, m, url) => {
      const since = Number(url.searchParams.get('since') || 0)
      send(res, 200, { last: db.seq, items: db.investments.filter((i) => i.seq > since) })
    }],
    ['GET', /^\/tp\/profile\/([^/]+)$/, (req, res, m) => {
      const c = db.clients.find((x) => x.cid === decodeURIComponent(m[1])); if (!c) return send(res, 404, { error: 'Unknown CID' })
      const inv = db.investments.filter((i) => i.cid === c.cid).sort((a, b) => b.date - a.date)
      send(res, 200, { cid: c.cid, pan: c.pan, platformFamilyId: c.platformFamilyId, advisorMhfId: c.advisorMhfId, investments: inv, aum: inv.reduce((s, i) => s + i.amount, 0), lastInvestment: inv[0] || null })
    }],
  ],
})
