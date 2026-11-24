// npm start - production start for an online server (Railway, Render or a VPS). Starts the five back-end services on
// 127.0.0.1 only (never reachable from the internet) and the public gateway (scripts/prod-gateway.mjs), which serves
// both websites and is the only way in. Business logic is unchanged: these are the same services as `npm run dev:all`.
//
// Production environment (set on the hosting platform, never in the repository):
//   P_API_KEY, I_API_KEY, BRIDGE_LOOKUP_KEY, MARKET_FEED_KEY  long random secrets (the start refuses the demo values)
//   DATA_DIR             persistent disk, e.g. /data: every service keeps its JSON database and files there
//   PORT                 public port of Prospect DMS (set by the platform; default 8080)
//   IDMS_PUBLIC_PORT     public port of Investor DMS (default 8081)
//   PDMS_HOSTNAME / IDMS_HOSTNAME  optional: route by domain name instead of by port (one public port for both)
//   FLOW_F1 ... FLOW_F4, FLOW_F1_ACK, INVESTOR_DATA_IN_PDMS  as in .env.example
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, loadEnv } from '../services/lib/common.mjs'

const SERVICES = ['p-api', 'i-api', 'tp-sim', 'bridge', 'content']
const log = (...a) => console.log('[start-prod]', ...a)

// 1. secrets: a public deployment must not run with the demo keys from .env.example
const env = loadEnv()
const SECRETS = ['P_API_KEY', 'I_API_KEY', 'BRIDGE_LOOKUP_KEY', 'MARKET_FEED_KEY']
const weak = SECRETS.filter((k) => !env[k] || /demo/i.test(env[k]) || env[k].length < 24)
if (weak.length && process.env.ALLOW_DEMO_KEYS !== '1') {
  console.error(`[start-prod] Refusing to start: set long random values for ${weak.join(', ')} (at least 24 characters).`)
  process.exit(1)
}
if (new Set(SECRETS.map((k) => env[k])).size !== SECRETS.length) { console.error('[start-prod] Refusing to start: every key must be different.'); process.exit(1) }

// 2. data on the persistent disk: services/<name>/data -> $DATA_DIR/<name>
const DATA_DIR = process.env.DATA_DIR
if (DATA_DIR) {
  for (const s of SERVICES) {
    const target = path.join(DATA_DIR, s); fs.mkdirSync(target, { recursive: true })
    const link = path.join(ROOT, 'services', s, 'data')
    let st = null; try { st = fs.lstatSync(link) } catch {}
    if (st?.isSymbolicLink()) { if (fs.readlinkSync(link) === target) continue; fs.unlinkSync(link) }
    else if (st) { console.error(`[start-prod] ${link} is a real folder; move it into ${target} first (nothing was changed).`); process.exit(1) }
    fs.symlinkSync(target, link, 'junction')
  }
  log(`data folder: ${DATA_DIR}`)
} else log('DATA_DIR is not set: data stays in services/*/data (lost on redeploy unless that folder is on a persistent disk)')

// 3. the websites must be built
for (const app of ['prospect-dms', 'investor-dms']) {
  if (!fs.existsSync(path.join(ROOT, 'apps', app, 'dist', 'index.html'))) { console.error(`[start-prod] apps/${app}/dist is missing: run npm run build:all first.`); process.exit(1) }
}

// 4. start everything; a service that stops is started again (after 1 s, then up to 30 s between tries)
const childEnv = { ...process.env, HOST: '127.0.0.1' } // services listen on this machine only
const procs = [...SERVICES.map((s) => ({ name: s, file: `services/${s}/server.mjs` })), { name: 'gateway', file: 'scripts/prod-gateway.mjs' }]
const children = new Map()
let stopping = false
function start(p, delay = 1000) {
  const child = spawn(process.execPath, [p.file], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  const pipe = (s) => s.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${p.name}] ${l}`)))
  pipe(child.stdout); pipe(child.stderr)
  const t0 = Date.now()
  child.on('exit', (code) => {
    children.delete(p.name); if (stopping) return
    const next = Date.now() - t0 > 60000 ? 1000 : Math.min(delay * 2, 30000)
    log(`${p.name} stopped (${code ?? 'signal'}); starting again in ${Math.round(next / 1000)} s`)
    setTimeout(() => start(p, next), next)
  })
  children.set(p.name, child)
}
procs.forEach((p) => start(p))
function stopAll() { stopping = true; for (const c of children.values()) c.kill('SIGTERM'); setTimeout(() => process.exit(0), 3000).unref() }
process.on('SIGTERM', stopAll); process.on('SIGINT', stopAll)
