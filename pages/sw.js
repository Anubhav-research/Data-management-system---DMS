// GitHub Pages demo: the five back-end services (p-api, i-api, tp-sim, content, bridge) running INSIDE the visitor's
// browser, in this service worker. GitHub Pages can only serve files, so instead of a server, this worker answers the
// websites' /api, /bridge, /tp and /content requests with the real service code (bundled by pages/build.mjs), exactly
// as scripts/prod-gateway.mjs routes them online. Both websites share this one worker, so the bridge works between them.
// Data: starts from the published demo data (demo-data.json) and is kept in this browser (IndexedDB); every visitor has
// their own copy. Nothing is sent anywhere.
import { Buffer } from './shims/buffer.js'
import { loadAll, seedFiles, flush, wipe } from './shims/node-fs.js'
import fs from './shims/node-fs.js'
import { servers } from './shims/node-misc.js'
import { loadEnv } from '../services/lib/common.mjs'
import { __start as startP } from '../services/p-api/server.mjs'
import { __start as startI } from '../services/i-api/server.mjs'
import { __start as startTp } from '../services/tp-sim/server.mjs'
import { __start as startContent } from '../services/content/server.mjs'
import { __start as startBridge } from '../services/bridge/server.mjs'

globalThis.Buffer = Buffer
globalThis.process = globalThis.process || { env: {}, argv: [], pid: 1, platform: 'browser', on() {}, exit() {}, cwd: () => '/app' }

const BASE = new URL(self.registration.scope).pathname // e.g. /Data-management-system---DMS/
const VERSION_FILE = '/app/.demo-version'
const realFetch = self.fetch.bind(self)
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

// ---------------------------------------------------------------- calling a service like an HTTP server would
async function call(port, method, url, headers, body) {
  const handler = servers.get(Number(port)); if (!handler) return json(502, { error: 'This part of the DMS is not available right now.' })
  const h = {}; for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v)
  const bytes = body == null ? null : Buffer.from(typeof body === 'string' ? Buffer.from(body) : new Uint8Array(body))
  let ended = false; const listeners = { data: [], end: [], error: [] }
  const req = {
    method, url, headers: h, socket: { remoteAddress: '10.0.0.2' }, // never "local": the bridge's local-only reset stays closed
    on(ev, fn) { if (ended) { if (ev === 'data' && bytes) fn(bytes); if (ev === 'end') fn() } else listeners[ev]?.push(fn); return req },
    destroy() {},
  }
  return new Promise((resolve) => {
    let status = 200; const rh = {}
    const res = {
      headersSent: false,
      writeHead(s, hh = {}) { status = s; Object.assign(rh, hh); res.headersSent = true; return res },
      setHeader(k, v) { rh[k] = v }, getHeader: (k) => rh[k], write() {},
      end(data) {
        const hdr = new Headers(); for (const [k, v] of Object.entries(rh)) if (!/^(content-length|transfer-encoding|connection)$/i.test(k)) hdr.set(k, String(v))
        resolve(new Response([204, 304].includes(status) || data == null ? null : data, { status, headers: hdr }))
      },
      destroy() { resolve(json(400, { error: 'Request refused.' })) },
    }
    Promise.resolve().then(() => handler(req, res)).catch((e) => resolve(json(500, { error: e.message })))
    queueMicrotask(() => { ended = true; if (bytes) listeners.data.forEach((f) => f(bytes)); listeners.end.forEach((f) => f()) })
  })
}
// the bridge asks i-api and tp-sim at http://127.0.0.1:<port>: answer inside the worker too
self.fetch = (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url, self.location.href)
  if (u.hostname === '127.0.0.1') return call(u.port, init.method || 'GET', u.pathname + u.search, init.headers, init.body)
  return realFetch(input, init)
}

// ---------------------------------------------------------------- start: load the data, then start the services
let ready = null
async function installDemoData(version) {
  const snap = await (await realFetch(BASE + 'demo-data.json', { cache: 'no-store' })).json()
  await wipe()
  seedFiles(Object.entries(snap.files).map(([p, b64]) => [p, Buffer.from(b64, 'base64')]))
  fs.writeFileSync(VERSION_FILE, version || snap.version)
  await flush()
}
function boot() {
  if (!ready) ready = (async () => {
    const have = await loadAll()
    const published = (await (await realFetch(BASE + 'demo-version.txt', { cache: 'no-store' })).text()).trim()
    const mine = have && fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8').trim() : ''
    if (!have || mine !== published) await installDemoData(published) // first visit, or new demo data published
    servers.clear()
    for (const start of [startP, startI, startTp, startContent, startBridge]) await start()
    await flush()
  })().catch((e) => { ready = null; throw e })
  return ready
}

// ---------------------------------------------------------------- which website is asking
async function siteOf(e) {
  let url = ''
  if (e.clientId) url = (await self.clients.get(e.clientId))?.url || ''
  if (!url) url = e.request.referrer || ''
  return url.includes(BASE + 'investor/') ? 'investor' : url.includes(BASE + 'prospect/') ? 'prospect' : null
}

// ---------------------------------------------------------------- the same routing as the production gateway
async function api(e, u, site) {
  await boot()
  const env = loadEnv()
  const key = site === 'investor' ? env.I_API_KEY : env.P_API_KEY
  let port; let p = u.pathname
  if (p.startsWith('/api/')) port = site === 'investor' ? env.I_API_PORT : env.P_API_PORT
  else if (p.startsWith('/bridge/')) { p = p.slice('/bridge'.length); if (p === '/reset') return json(404, { error: 'Not found.' }); port = env.BRIDGE_PORT }
  else if (p.startsWith('/tp/')) { if (!/^\/tp\/(verify|registrations|investments|profile\/[^/]+)$/.test(p)) return json(404, { error: 'Not found.' }); port = env.TP_SIM_PORT }
  else { if (p === '/content/reset') return json(404, { error: 'Not found.' }); port = env.CONTENT_PORT || 4105 }
  const headers = Object.fromEntries(e.request.headers.entries()); headers['x-api-key'] = key
  const body = ['GET', 'HEAD'].includes(e.request.method) ? null : await e.request.arrayBuffer()
  const resp = await call(port, e.request.method, p + u.search, headers, body)
  await flush()
  return resp
}

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url)
  if (u.origin !== self.location.origin) return
  const isApi = /^\/(api|bridge|tp|content)\//.test(u.pathname)
  if (!isApi && u.pathname.startsWith(BASE)) return // an ordinary file of the site
  e.respondWith((async () => {
    const site = await siteOf(e)
    if (!site) return json(404, { error: 'Not found.' })
    // a file the websites ask for from the domain root (e.g. /assets/mh-logo.png): serve it from that website's folder
    if (!isApi) return realFetch(BASE + site + u.pathname + u.search)
    try { return await api(e, u, site) } catch (err) { return json(500, { error: String(err?.message || err) }) }
  })())
})

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(boot()) })
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
// "Start over" on the demo's home page: back to the published demo data
self.addEventListener('message', (e) => {
  if (e.data !== 'start-over') return
  e.waitUntil((async () => {
    try { await ready } catch {}
    const published = (await (await realFetch(BASE + 'demo-version.txt', { cache: 'no-store' })).text()).trim()
    await installDemoData(published); ready = null; await boot()
    e.source?.postMessage('started-over')
  })())
})
