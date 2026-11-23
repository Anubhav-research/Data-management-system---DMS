// Generic "one website = one database" state server, used by p-api and i-api (each with its own file and key).
// The website loads the whole state, edits it in the browser (business rules live in the app's src/services),
// and saves it back with an optimistic version number. A stale version gets 409 and the browser reloads.
import path from 'node:path'
import fs from 'node:fs'
import { serve, send, readBody, readJson, writeJson, appendJsonl } from './common.mjs'

export function startStateServer({ name, port, host, key, dataDir, dbFile, extraRoutes = [], extraKeys = {} }) {
  const file = path.join(dataDir, dbFile)
  const metaFile = path.join(dataDir, dbFile.replace(/\.json$/, '.meta.json'))
  const accessLog = path.join(dataDir, 'access-denied.jsonl')
  let meta = readJson(metaFile, { version: 0 })
  let state = readJson(file, null)

  const MAX_FILE = 10 * 1024 * 1024
  const filesDir = path.join(dataDir, 'files'); const filesIndex = path.join(dataDir, 'files.json')
  const files = readJson(filesIndex, {})
  const save = () => { writeJson(file, state); writeJson(metaFile, meta) }

  const guard = (req, res, url) => {
    const k = req.headers['x-api-key']
    if (url.pathname === '/health') return true
    // extra keys may call only their own routes (e.g. the bridge's Yes/No lookup)
    for (const [extraKey, allowed] of Object.entries(extraKeys)) if (k === extraKey && allowed.some((r) => r.test(url.pathname))) return true
    if (k === key && url.pathname.startsWith('/api/')) return true
    appendJsonl(accessLog, { at: new Date().toISOString(), method: req.method, path: url.pathname, reason: k ? 'wrong key for this service' : 'no key' })
    send(res, 403, { error: 'Forbidden: this service accepts only its own website key.' })
    return false
  }

  const routes = [
    ['GET', /^\/health$/, (req, res) => send(res, 200, { ok: true, service: name })],
    ['GET', /^\/api\/state$/, (req, res) => send(res, 200, { version: meta.version, state })],
    ['GET', /^\/api\/state\/version$/, (req, res) => send(res, 200, { version: meta.version })],
    ['PUT', /^\/api\/state$/, async (req, res) => {
      const body = await readBody(req)
      if (Number(body.version) !== meta.version) return send(res, 409, { error: 'version conflict', version: meta.version })
      state = body.state
      meta = { version: meta.version + 1, savedAt: new Date().toISOString(), savedBy: body.savedBy || null }
      save()
      send(res, 200, { version: meta.version })
    }],
    ['POST', /^\/api\/reset$/, (req, res) => {
      // The next browser that loads finds no state and writes the website's fresh seed (first writer wins on version).
      state = null; meta = { version: meta.version + 1, savedAt: new Date().toISOString(), savedBy: 'reset' }
      save(); send(res, 200, { version: meta.version })
    }],
    // A file the advisor attaches from their computer to a client's WhatsApp / email (product owner, 20 Nov 2026).
    // It is client data, so it stays in this website's own back end (data/files), never in the Content Hub.
    ['POST', /^\/api\/files$/, async (req, res) => {
      const b = await readBody(req)
      const buf = Buffer.from(String(b.data || ''), 'base64')
      if (!b.name || !buf.length) return send(res, 400, { error: 'The file is empty.' })
      if (buf.length > MAX_FILE) return send(res, 413, { error: 'The file is larger than 10 MB.' })
      const id = `FILE-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase()
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(b.mime || '')) ? String(b.mime) : 'application/octet-stream'
      fs.mkdirSync(filesDir, { recursive: true }); fs.writeFileSync(path.join(filesDir, id), buf)
      files[id] = { name: String(b.name).slice(0, 200), mime, size: buf.length, clientId: b.clientId || null, by: b.by || null, at: Date.now() }
      writeJson(filesIndex, files)
      send(res, 200, { id, ...files[id] })
    }],
    ['GET', /^\/api\/files\/([\w-]+)$/, (req, res, m, url) => {
      const f = files[m[1]]; const file = path.join(filesDir, m[1])
      if (!f || !fs.existsSync(file)) return send(res, 404, { error: 'File not found.' })
      // shown in the page only for types that cannot run code; everything else downloads
      const safe = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(f.mime)
      const disp = url.searchParams.get('download') === '1' || !safe ? 'attachment' : 'inline'
      res.writeHead(200, { 'content-type': f.mime, 'content-length': fs.statSync(file).size, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300',
        'content-disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(f.name)}` })
      fs.createReadStream(file).pipe(res)
    }],
    ...extraRoutes.map(([m, re, fn]) => [m, re, (req, res, match, url) => fn(req, res, match, url, { getState: () => state })]),
  ]
  fs.mkdirSync(dataDir, { recursive: true })
  return serve({ name, port, host, routes, onRequest: guard })
}
