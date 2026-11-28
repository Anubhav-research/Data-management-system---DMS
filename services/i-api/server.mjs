// i-api: the Investor DMS back end and its own JSON database (data/idms-db.json).
// Accepts only the Investor DMS key, plus TWO routes for the bridge: the Yes/No number check (flow F3) and the
// dashboard figures per person, counts and amounts only (flow F5, figures.mjs).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv, send, readBody, appendJsonl, readJsonl } from '../lib/common.mjs'
import { startStateServer } from '../lib/state-server.mjs'
import { investorFigures } from './figures.mjs'

const env = loadEnv()
const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data')
const F3LOG = path.join(DATA, 'f3-answers.jsonl')
const digits = (v) => String(v || '').replace(/\D/g, '').slice(-10)

/** F3 answer: for each mobile / PAN, does it exist anywhere in Investor DMS? Yes/No only, nothing else. */
async function lookup(req, res, m, url, { getState }) {
  const body = await readBody(req)
  const s = getState()
  const mobiles = new Set(), pans = new Set()
  for (const c of s?.clients || []) for (const p of c.members || []) {
    for (const x of p.contacts || []) if (x.mobile) mobiles.add(digits(x.mobile))
    if (p.pan) pans.add(String(p.pan).toUpperCase())
  }
  const answers = (body.items || []).map((v) => {
    const t = String(v || '').trim().toUpperCase()
    const hit = /^[A-Z]{5}\d{4}[A-Z]$/.test(t) ? pans.has(t) : mobiles.has(digits(t))
    return { item: v, exists: hit ? 'Yes' : 'No' }
  })
  // logged for the Data Boundary page: counts only, never the numbers themselves
  appendJsonl(F3LOG, { at: new Date().toISOString(), count: answers.length, yes: answers.filter((a) => a.exists === 'Yes').length })
  send(res, 200, { answers })
}

startStateServer({
  name: 'i-api', port: env.I_API_PORT, host: env.HOST, key: env.I_API_KEY,
  dataDir: path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'), dbFile: 'idms-db.json',
  extraKeys: { [env.BRIDGE_LOOKUP_KEY]: [/^\/lookup$/, /^\/figures$/] },
  extraRoutes: [
    ['POST', /^\/lookup$/, lookup],
    // F5: numbers per employee ID for the Prospect DMS dashboard
    ['POST', /^\/figures$/, async (req, res, m, url, { getState }) => send(res, 200, investorFigures(getState(), await readBody(req)))],
    // F3 answers given (counts only) for the Data Boundary page of Investor DMS
    ['GET', /^\/api\/f3-answers$/, (req, res) => send(res, 200, { items: readJsonl(F3LOG).reverse().slice(0, 300) })],
  ],
})
