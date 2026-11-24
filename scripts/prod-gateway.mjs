// Production gateway: the only public part of an online deployment (started by scripts/start-prod.mjs).
// It does online what each website's Vite proxy does on a developer's PC (apps/*/vite.config.js):
//   - serves the built website (apps/<app>/dist)
//   - forwards /api, /bridge, /tp and /content to the back-end services on 127.0.0.1, adding THAT website's key on the
//     server side. The browser never holds a key; any key a browser sends is removed first.
// Never forwarded: the TP Simulator console (/, /console/*), tp-sim's lookup, the bridge and Content Hub reset routes.
// Everything else still passes each service's own key checks. Plain Node, no dependencies.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ROOT, loadEnv } from '../services/lib/common.mjs'

const env = loadEnv()
const svc = (port) => ({ host: '127.0.0.1', port: Number(port) })

// one entry per website: its files, its key, and where each path prefix goes
const SITES = {
  prospect: { name: 'Prospect DMS', dist: path.join(ROOT, 'apps', 'prospect-dms', 'dist'), key: env.P_API_KEY, api: svc(env.P_API_PORT) },
  investor: { name: 'Investor DMS', dist: path.join(ROOT, 'apps', 'investor-dms', 'dist'), key: env.I_API_KEY, api: svc(env.I_API_PORT) },
}
// [prefix, service, path rewrite, allowed paths after the rewrite]
const ROUTES = [
  ['/api/', (s) => s.api, (p) => p, /^\/api\//],
  ['/bridge/', () => svc(env.BRIDGE_PORT), (p) => p.replace(/^\/bridge/, ''), /^\/(?!reset$)/], // the bridge refuses unknown routes itself
  ['/tp/', () => svc(env.TP_SIM_PORT), (p) => p, /^\/tp\/(verify|registrations|investments|profile\/[^/]+)$/],
  ['/content/', () => svc(env.CONTENT_PORT || 4105), (p) => p, /^\/content\/(?!reset$)/],
]

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=15552000',
  'permissions-policy': 'camera=(), geolocation=()',
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' }
const deny = (res, code, msg) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY }); res.end(JSON.stringify({ error: msg })) }

// ---------------------------------------------------------------- static files (kept in memory, gzipped once)
const cache = new Map()
function file(site, urlPath) {
  let rel = decodeURIComponent(urlPath); if (rel === '/' || rel === '') rel = '/index.html'
  const full = path.normalize(path.join(site.dist, rel))
  if (!full.startsWith(site.dist + path.sep)) return null
  if (cache.has(full)) return cache.get(full)
  let body; try { if (!fs.statSync(full).isFile()) return null; body = fs.readFileSync(full) } catch { return null }
  const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream'
  const f = { body, type, gz: /text|javascript|json|svg/.test(type) && body.length > 1024 ? zlib.gzipSync(body) : null,
    // hashed build files never change; index.html must always be fresh so a new deploy is picked up
    cacheControl: rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' }
  cache.set(full, f); return f
}
function sendFile(req, res, f) {
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  res.writeHead(200, { 'content-type': f.type, 'cache-control': f.cacheControl, vary: 'accept-encoding', ...(gz ? { 'content-encoding': 'gzip' } : {}), ...SECURITY })
  res.end(req.method === 'HEAD' ? undefined : gz ? f.gz : f.body)
}

// ---------------------------------------------------------------- forwarding to a service
function forward(req, res, site, target, pathAndQuery) {
  const headers = { ...req.headers }
  delete headers['x-api-key']; delete headers.host; delete headers.connection
  headers['x-api-key'] = site.key
  const up = http.request({ ...target, method: req.method, path: pathAndQuery, headers }, (r) => {
    res.writeHead(r.statusCode, { ...r.headers, ...SECURITY }); r.pipe(res)
  })
  up.on('error', () => { if (!res.headersSent) deny(res, 502, 'This part of the DMS is not available right now.'); else res.destroy() })
  req.pipe(up)
}

function handler(siteKey) {
  return (req, res) => {
    // optional: one public port for both websites, chosen by domain name
    const host = String(req.headers.host || '').split(':')[0].toLowerCase()
    const site = SITES[host && host === (process.env.IDMS_HOSTNAME || '').toLowerCase() ? 'investor' : host && host === (process.env.PDMS_HOSTNAME || '').toLowerCase() ? 'prospect' : siteKey]
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end('{"ok":true}') } // platform health check (no data)
    const route = ROUTES.find(([prefix]) => url.pathname.startsWith(prefix))
    if (route) {
      const [, target, rewrite, allowed] = route
      const p = rewrite(url.pathname)
      if (!allowed.test(p)) return deny(res, 404, 'Not found.')
      return forward(req, res, site, target(site), p + url.search)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return deny(res, 405, 'Method not allowed.')
    const f = file(site, url.pathname)
    if (!f) return deny(res, 404, 'Not found.')
    sendFile(req, res, f)
  }
}

const P_PORT = Number(process.env.PORT || 8080)
const I_PORT = Number(process.env.IDMS_PUBLIC_PORT || 8081)
for (const [key, port] of [['prospect', P_PORT], ['investor', I_PORT]]) {
  const server = http.createServer(handler(key))
  server.requestTimeout = 120000; server.headersTimeout = 60000
  server.listen(port, '0.0.0.0', () => console.log(`${SITES[key].name} on port ${port}`))
}
