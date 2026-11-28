// Shared helper CODE for the demo services (no shared data). Plain Node, no dependencies.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Reads .env (falls back to .env.example). process.env wins. */
export function loadEnv() {
  const env = {}
  for (const f of ['.env.example', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2]
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k in env)) }
}

export const sha256 = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
/** Atomic write: temp file + rename, so a crash never leaves half a database. */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}
/** Append-only JSON-lines log. */
export function appendJsonl(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, JSON.stringify(obj) + '\n')
}
export function readJsonl(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

export function send(res, status, body, headers = {}) {
  const isText = typeof body === 'string'
  res.writeHead(status, { 'content-type': isText ? (headers['content-type'] || 'text/plain; charset=utf-8') : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(isText ? body : JSON.stringify(body))
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    req.on('data', (c) => { size += c.length; if (size > 150e6) { reject(new Error('too large')); req.destroy() } else chunks.push(c) })
    req.on('end', () => { const s = Buffer.concat(chunks).toString('utf8'); try { resolve(s ? JSON.parse(s) : {}) } catch { reject(new Error('bad json')) } })
    req.on('error', reject)
  })
}

/** Tiny router: routes = [[method, /regex/, handler(req,res,match,url)]] */
export function serve({ name, port, host, routes, onRequest }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    try {
      if (onRequest && (await onRequest(req, res, url)) === false) return
      for (const [method, re, fn] of routes) {
        if (method !== req.method) continue
        const m = url.pathname.match(re)
        if (m) return await fn(req, res, m, url)
      }
      send(res, 404, { error: 'not found' })
    } catch (e) {
      send(res, e.status || 500, { error: e.message })
    }
  })
  server.listen(Number(port), host, () => console.log(`[${name}] listening on http://${host}:${port}`))
  writePid(name)
  return server
}

export function writePid(name) {
  const dir = path.join(ROOT, '.run'); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name + '.pid'), String(process.pid))
  const clean = () => { try { fs.unlinkSync(path.join(dir, name + '.pid')) } catch {} process.exit(0) }
  process.on('SIGINT', clean); process.on('SIGTERM', clean)
}

export const istNow = () => new Date().toISOString()
