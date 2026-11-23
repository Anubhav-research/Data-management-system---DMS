// Content Hub: the ONE place for company content shown in every DMS website - the Document Repository (a folder tree
// of files), Circulars and Quizzes. Admin publishes from any website and it shows in all of them (product owner, 17 Nov 2026).
//
// It holds company content only, never client data, so it is outside the Prospect / Investor separation: each website
// reaches it through its own Vite proxy with its own key, and the key tells the hub which website and which team
// (B2C / B2B) is asking. Every item has an audience: All, B2C or B2B; a website sees only what is meant for its team.
// Admin sees everything (to manage it). Every change is written to an append-only log.
//
// Demo limits (as for the other services): the user and role come from the website (header x-dms-user) and are
// trusted; files are kept on this server's disk.
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadEnv, serve, send, readBody, readJson, writeJson, appendJsonl } from '../lib/common.mjs'
import { FOLDERS, DOCS, CIRCULARS, CIRCULAR_TYPES, QUIZZES, QUIZ_ATTEMPTS, marketSeed, ago } from './seed.mjs'
import { parseMarketXlsx, upgradeMarket, fillLayout, COLUMN_TYPES, SESSIONS } from '../../packages/core-ui/src/content/market.js'

const env = loadEnv()
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, 'data'); const FILES = path.join(DATA, 'files'); const DB = path.join(DATA, 'content-db.json')
const LOG = path.join(DATA, 'content-log.jsonl')
const MAX_FILE = 10 * 1024 * 1024 // 10 MB a file (WhatsApp sends documents up to 100 MB; 10 MB keeps the demo light)

// Which website a key belongs to, and its team. Future B2B websites add their key here.
const SITES = {
  [env.P_API_KEY]: { site: 'Prospect DMS', team: 'B2C' },
  [env.I_API_KEY]: { site: 'Investor DMS', team: 'B2C' },
}
const AUDIENCES = ['All', 'B2C', 'B2B']
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8' }
const extOf = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase()
const id = (p) => `${p}-${crypto.randomBytes(4).toString('hex')}`
// The market automation publishes Market Updates with this key (not a website key): POST /content/market/feed
const FEED_KEY = env.MARKET_FEED_KEY || 'market-feed-demo-key'
const FEED_USER = { mhfId: 'AUTO-MARKET', name: 'Market feed (automatic)' }
const MARKET_BASE = await parseMarketXlsx(fs.readFileSync(path.join(HERE, 'seed-files', 'market-update.xlsx')))

// ---------------------------------------------------------------- data
let db = readJson(DB, null)
const save = () => writeJson(DB, db)
function seed() {
  fs.rmSync(FILES, { recursive: true, force: true }); fs.mkdirSync(FILES, { recursive: true })
  const admin = { mhfId: 'MHF500001', name: 'James Wilson' }
  const folders = []; const byName = {}
  FOLDERS.forEach(([name, parent, audience], i) => {
    const f = { id: `FO-${String(i + 1).padStart(3, '0')}`, name, parentId: parent ? byName[parent].id : null, audience, createdAt: ago(1300 - i * 40), createdBy: admin, site: 'Prospect DMS' }
    folders.push(f); byName[name] = f
  })
  const docs = DOCS.map(([file, folder, title, description, audience, days], i) => {
    const docId = `DOC-${String(i + 1).padStart(3, '0')}`
    fs.copyFileSync(path.join(HERE, 'seed-files', file), path.join(FILES, docId))
    const ext = extOf(file)
    return { id: docId, folderId: byName[folder].id, name: `${title}.${ext}`, description, audience, mime: MIME[ext], size: fs.statSync(path.join(FILES, docId)).size,
      uploadedAt: ago(days), uploadedBy: admin, site: i % 3 ? 'Prospect DMS' : 'Investor DMS', deletedAt: null }
  })
  const circulars = CIRCULARS.map(([type, title, days, audience, html, file], i) => {
    const doc = file && docs.find((d) => DOCS[docs.indexOf(d)][0] === file)
    return { id: `CIR-${String(i + 1).padStart(3, '0')}`, type, title, html, audience, publishedAt: ago(days), by: admin, site: i % 2 ? 'Investor DMS' : 'Prospect DMS',
      attachment: doc ? { docId: doc.id, name: doc.name, mime: doc.mime, size: doc.size } : null, updatedAt: null, deletedAt: null }
  })
  seedMarkets(circulars, admin)
  // the demo IS has read the older circulars; the four newest are unread (Market Updates are never counted as unread)
  const reads = { MHF500007: circulars.slice(4).map((c) => c.id), MHF500011: circulars.slice(2).map((c) => c.id) }
  // quizzes: the file sits in the file store (no folder); attempts[quizId][mhfId] = one person, however many times
  const quizzes = QUIZZES.map(([file, title, topic, days, audience], i) => {
    const docId = `DOC-Q${i + 1}`; fs.copyFileSync(path.join(HERE, 'seed-files', file), path.join(FILES, docId))
    const ext = extOf(file)
    docs.push({ id: docId, folderId: null, name: `${title}.${ext}`, description: `Quiz: ${title}`, audience, mime: MIME[ext], size: fs.statSync(path.join(FILES, docId)).size, uploadedAt: ago(days), uploadedBy: admin, site: 'Prospect DMS', deletedAt: null, quizOnly: true })
    return { id: `QZ-${String(i + 1).padStart(3, '0')}`, title, topic, audience, docId, format: ext === 'pdf' ? 'PDF' : 'HTML', publishedAt: ago(days), by: admin, site: 'Prospect DMS', deletedAt: null }
  })
  const PEOPLE = { MHF500007: ['John Smith', 'IS'], MHF500011: ['Emily Davis', 'IS'], MHF500004: ['David Miller', 'TL'], MHF500031: ['Tom Harris', 'IS'], MHF500051: ['Anna White', 'IS'], MHF500005: ['Sarah Lee', 'TL'] }
  const attempts = {}
  for (const [mhfId, list] of Object.entries(QUIZ_ATTEMPTS)) for (const [qi, times, days] of list) {
    attempts[quizzes[qi].id] ||= {}
    attempts[quizzes[qi].id][mhfId] = { name: PEOPLE[mhfId][0], role: PEOPLE[mhfId][1], site: days % 2 ? 'Investor DMS' : 'Prospect DMS', first: ago(days), last: ago(Math.max(0.2, days - times + 1)), times }
  }
  db = { folders, docs, circulars, reads, quizzes, attempts, marketV: 2 }
  save()
}
function seedMarkets(circulars, admin) {
  marketSeed(MARKET_BASE).forEach((u, i) => circulars.push({ id: `CIR-M${String(i + 1).padStart(2, '0')}`, type: 'Market Update', title: u.title, html: u.html, audience: 'All', publishedAt: u.at,
    by: u.market.source === 'auto' ? FEED_USER : admin, site: 'Prospect DMS', attachment: null, market: u.market, updatedAt: null, deletedAt: null }))
}
if (!db || !db.quizzes) seed()
// Market Update in tables (19 Nov 2026): the demo updates are made again from the Excel; any other is converted.
if (db.marketV !== 2) {
  db.circulars = db.circulars.filter((c) => !String(c.id).startsWith('CIR-M'))
  db.circulars.forEach((c) => { if (c.market) c.market = upgradeMarket(c.market) })
  seedMarkets(db.circulars, { mhfId: 'MHF500001', name: 'James Wilson' }); db.marketV = 2; save()
}

// ---------------------------------------------------------------- who is asking
function who(req) {
  const site = SITES[req.headers['x-api-key']]
  let user = null
  try { user = JSON.parse(Buffer.from(String(req.headers['x-dms-user'] || ''), 'base64').toString('utf8')) } catch {}
  return { ...site, user: user && user.mhfId ? { mhfId: String(user.mhfId), name: String(user.name || ''), role: String(user.role || '') } : null }
}
const isAdmin = (w) => w.user?.role === 'Admin'
const fail = (status, msg) => Object.assign(new Error(msg), { status })
const needAdmin = (w) => { if (!isAdmin(w)) throw fail(403, 'Only Admin can change documents and circulars.') }
const log = (w, action, what) => appendJsonl(LOG, { at: new Date().toISOString(), site: w.site, by: w.user?.mhfId || null, action, ...what })

// ---------------------------------------------------------------- visibility
const fits = (aud, team) => aud === 'All' || aud === team
const folderOk = (folderId, team) => {
  for (let f = db.folders.find((x) => x.id === folderId); f; f = db.folders.find((x) => x.id === f.parentId)) if (!fits(f.audience, team)) return false
  return true
}
const docOk = (d, w) => !d.deletedAt && (isAdmin(w) || (fits(d.audience, w.team) && folderOk(d.folderId, w.team)))
const visibleFolders = (w) => db.folders.filter((f) => !f.deletedAt && (isAdmin(w) || folderOk(f.id, w.team)))
const circularOk = (c, w) => !c.deletedAt && (isAdmin(w) || fits(c.audience, w.team))
const quizOk = (q, w) => !q.deletedAt && (isAdmin(w) || fits(q.audience, w.team))

/** Each team's quiz takers (from the websites' rosters), for the participation %. */
const SITE_TEAM = Object.fromEntries(Object.values(SITES).map((x) => [x.site, x.team]))
function teamLists() {
  return ['B2C', 'B2B'].map((team) => {
    const rs = Object.entries(db.rosters || {}).filter(([, r]) => r.team === team)
    const people = new Map(); for (const [, r] of rs) for (const p of r.people) people.set(p.mhfId, p)
    return { team, takerRole: rs[0]?.[1].takerRole || (team === 'B2B' ? 'RM' : 'IS'), sites: rs.map(([site]) => site), people: [...people.values()] }
  })
}
const teamOfAttempt = (a) => a.team || SITE_TEAM[a.site] || 'B2C'
function checkAudience(a) { if (!AUDIENCES.includes(a)) throw fail(400, 'Audience must be All, B2C or B2B.') }
function storeFile({ name, data }) {
  if (!name || !data) throw fail(400, 'File missing.')
  const buf = Buffer.from(String(data), 'base64')
  if (!buf.length) throw fail(400, 'The file is empty.')
  if (buf.length > MAX_FILE) throw fail(413, 'The file is larger than 10 MB.')
  const docId = id('DOC'); fs.writeFileSync(path.join(FILES, docId), buf)
  return { id: docId, mime: MIME[extOf(name)] || 'application/octet-stream', size: buf.length }
}

// ---------------------------------------------------------------- routes
const routes = [
  ['GET', /^\/health$/, (req, res) => send(res, 200, { ok: true, service: 'content' })],

  // Document Repository: folders + documents this website may see
  ['GET', /^\/content\/library$/, (req, res) => {
    const w = who(req)
    send(res, 200, { site: w.site, team: w.team, admin: isAdmin(w), folders: visibleFolders(w), docs: db.docs.filter((d) => !d.circularOnly && !d.quizOnly && docOk(d, w)) })
  }],
  ['POST', /^\/content\/folders$/, async (req, res) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const name = String(b.name || '').trim(); if (!name) throw fail(400, 'Folder name is required.')
    checkAudience(b.audience || 'All')
    if (b.parentId && !db.folders.some((f) => f.id === b.parentId && !f.deletedAt)) throw fail(400, 'Parent folder not found.')
    if (db.folders.some((f) => !f.deletedAt && f.parentId === (b.parentId || null) && f.name.toLowerCase() === name.toLowerCase())) throw fail(409, 'A folder with this name is already here.')
    const f = { id: id('FO'), name, parentId: b.parentId || null, audience: b.audience || 'All', createdAt: Date.now(), createdBy: w.user, site: w.site }
    db.folders.push(f); save(); log(w, 'folder created', { id: f.id, name }); send(res, 200, f)
  }],
  ['PATCH', /^\/content\/folders\/([\w-]+)$/, async (req, res, m) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const f = db.folders.find((x) => x.id === m[1] && !x.deletedAt); if (!f) throw fail(404, 'Folder not found.')
    if (b.name != null) { const n = String(b.name).trim(); if (!n) throw fail(400, 'Folder name is required.'); f.name = n }
    if (b.audience != null) { checkAudience(b.audience); f.audience = b.audience }
    if (b.parentId !== undefined) {
      for (let p = db.folders.find((x) => x.id === b.parentId); p; p = db.folders.find((x) => x.id === p.parentId)) if (p.id === f.id) throw fail(400, 'A folder cannot go inside itself.')
      f.parentId = b.parentId || null
    }
    save(); log(w, 'folder changed', { id: f.id, name: f.name, audience: f.audience }); send(res, 200, f)
  }],
  ['DELETE', /^\/content\/folders\/([\w-]+)$/, (req, res, m) => {
    const w = who(req); needAdmin(w)
    const f = db.folders.find((x) => x.id === m[1] && !x.deletedAt); if (!f) throw fail(404, 'Folder not found.')
    if (db.folders.some((x) => !x.deletedAt && x.parentId === f.id) || db.docs.some((d) => !d.deletedAt && d.folderId === f.id)) throw fail(409, 'Only an empty folder can be deleted. Move or delete what is inside first.')
    f.deletedAt = Date.now(); save(); log(w, 'folder deleted', { id: f.id, name: f.name }); send(res, 200, { ok: true })
  }],
  ['POST', /^\/content\/docs$/, async (req, res) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    if (!db.folders.some((f) => f.id === b.folderId && !f.deletedAt)) throw fail(400, 'Choose a folder.')
    checkAudience(b.audience || 'All')
    const file = storeFile(b)
    const d = { id: file.id, folderId: b.folderId, name: String(b.name).trim(), description: String(b.description || '').trim(), audience: b.audience || 'All', mime: file.mime, size: file.size,
      uploadedAt: Date.now(), uploadedBy: w.user, site: w.site, deletedAt: null }
    db.docs.push(d); save(); log(w, 'document uploaded', { id: d.id, name: d.name, audience: d.audience }); send(res, 200, d)
  }],
  ['PATCH', /^\/content\/docs\/([\w-]+)$/, async (req, res, m) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const d = db.docs.find((x) => x.id === m[1] && !x.deletedAt); if (!d) throw fail(404, 'Document not found.')
    if (b.name != null) { const n = String(b.name).trim(); if (!n) throw fail(400, 'Name is required.'); d.name = n }
    if (b.description != null) d.description = String(b.description).trim()
    if (b.audience != null) { checkAudience(b.audience); d.audience = b.audience }
    if (b.folderId != null) { if (!db.folders.some((f) => f.id === b.folderId && !f.deletedAt)) throw fail(400, 'Folder not found.'); d.folderId = b.folderId }
    d.updatedAt = Date.now(); d.updatedBy = w.user
    save(); log(w, 'document changed', { id: d.id, name: d.name, audience: d.audience, folderId: d.folderId }); send(res, 200, d)
  }],
  // deleting hides the document everywhere; the file is kept (it may already have been sent to clients)
  ['DELETE', /^\/content\/docs\/([\w-]+)$/, (req, res, m) => {
    const w = who(req); needAdmin(w)
    const d = db.docs.find((x) => x.id === m[1] && !x.deletedAt); if (!d) throw fail(404, 'Document not found.')
    d.deletedAt = Date.now(); d.deletedBy = w.user; save(); log(w, 'document deleted', { id: d.id, name: d.name }); send(res, 200, { ok: true })
  }],
  // the file itself: shown in the browser (preview) or downloaded (?download=1)
  ['GET', /^\/content\/files\/([\w-]+)$/, (req, res, m, url) => {
    const w = who(req)
    const d = db.docs.find((x) => x.id === m[1])
    const viaCircular = db.circulars.some((c) => c.attachment?.docId === m[1] && circularOk(c, w)) || db.quizzes.some((q) => q.docId === m[1] && quizOk(q, w))
    const sent = url.searchParams.get('sent') === '1' // a copy already sent to a client stays readable in the chat
    if (!d || (!docOk(d, w) && !viaCircular && !sent)) return send(res, 404, { error: 'Document not found.' })
    const file = path.join(FILES, d.id); if (!fs.existsSync(file)) return send(res, 404, { error: 'File missing.' })
    const disp = url.searchParams.get('download') === '1' ? 'attachment' : 'inline'
    if (disp === 'attachment') log(w, 'document downloaded', { id: d.id, name: d.name })
    res.writeHead(200, { 'content-type': d.mime, 'content-length': fs.statSync(file).size, 'cache-control': 'private, max-age=300',
      'content-disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(d.name)}` })
    fs.createReadStream(file).pipe(res)
  }],
  // a document sent to a client on WhatsApp (logged here; the message itself is saved by the website)
  ['POST', /^\/content\/docs\/([\w-]+)\/sent$/, async (req, res, m) => {
    const w = who(req); const b = await readBody(req)
    const d = db.docs.find((x) => x.id === m[1]); if (!d || !docOk(d, w)) throw fail(404, 'Document not found.')
    log(w, 'document sent on WhatsApp', { id: d.id, name: d.name, clientRef: b.clientRef || null }); send(res, 200, { ok: true })
  }],

  // Circulars
  ['GET', /^\/content\/circulars$/, (req, res) => {
    const w = who(req)
    const read = new Set(db.reads[w.user?.mhfId] || [])
    // Admin also sees who has read each circular (MHF IDs; the website knows the names and roles)
    const readers = (cid) => Object.entries(db.reads).filter(([, list]) => list.includes(cid)).map(([mhf]) => mhf)
    const items = db.circulars.filter((c) => circularOk(c, w)).sort((a, b) => b.publishedAt - a.publishedAt).map((c) => ({ ...c, read: read.has(c.id), ...(isAdmin(w) && !c.market ? { readBy: readers(c.id) } : {}) }))
    send(res, 200, { site: w.site, team: w.team, admin: isAdmin(w), types: CIRCULAR_TYPES, items })
  }],
  ['POST', /^\/content\/circulars$/, async (req, res) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const c = circularFrom(b, w); c.id = id('CIR'); c.publishedAt = Date.now(); c.by = w.user; c.site = w.site; c.deletedAt = null; c.updatedAt = null
    db.circulars.push(c); db.reads[w.user.mhfId] = [...(db.reads[w.user.mhfId] || []), c.id]
    save(); log(w, 'circular published', { id: c.id, title: c.title, audience: c.audience }); send(res, 200, c)
  }],
  ['PATCH', /^\/content\/circulars\/([\w-]+)$/, async (req, res, m) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const c = db.circulars.find((x) => x.id === m[1] && !x.deletedAt); if (!c) throw fail(404, 'Circular not found.')
    Object.assign(c, circularFrom({ ...c, ...b, attachment: b.attachment === undefined ? c.attachment : b.attachment }, w), { updatedAt: Date.now(), updatedBy: w.user })
    save(); log(w, 'circular changed', { id: c.id, title: c.title }); send(res, 200, c)
  }],
  ['DELETE', /^\/content\/circulars\/([\w-]+)$/, (req, res, m) => {
    const w = who(req); needAdmin(w)
    const c = db.circulars.find((x) => x.id === m[1] && !x.deletedAt); if (!c) throw fail(404, 'Circular not found.')
    c.deletedAt = Date.now(); c.deletedBy = w.user; save(); log(w, 'circular deleted', { id: c.id, title: c.title }); send(res, 200, { ok: true })
  }],
  ['POST', /^\/content\/circulars\/read$/, async (req, res) => {
    const w = who(req); if (!w.user) throw fail(400, 'No user.'); const b = await readBody(req)
    const ids = (b.all ? db.circulars.filter((c) => circularOk(c, w)).map((c) => c.id) : [b.id]).filter(Boolean)
    db.reads[w.user.mhfId] = [...new Set([...(db.reads[w.user.mhfId] || []), ...ids])]
    save(); send(res, 200, { ok: true })
  }],

  // The market automation: figures arrive and are published straight away (product owner, 19 Nov 2026).
  // Body: { market } (same shape as the website sends), { values: { "<row name>": { "<column>": "<value>" } } }, or
  // { xlsx: <base64 of the Market Update Excel> }; optional { html, session, asOf }.
  // 21 Nov 2026: the figures go into the LATEST update's layout (rows and columns Admin set in the form), matched by
  // name; what the automation does not bring keeps its last figure, marked old. The answer says what matched.
  ['POST', /^\/content\/market\/feed$/, async (req, res) => {
    const b = await readBody(req)
    let market = b.market
    if (b.xlsx) { try { market = await parseMarketXlsx(Buffer.from(String(b.xlsx), 'base64')) } catch (e) { throw fail(400, e.message) } }
    if (b.values) market = { values: b.values }
    if (!market || (!market.tables && !market.values)) throw fail(400, 'Send { market }, { values } or { xlsx }.')
    if (b.session) market = { ...market, session: b.session }
    if (b.asOf) market = { ...market, asOf: Number(b.asOf) || Date.parse(b.asOf) || Date.now() }
    if (!market.asOf) market = { ...market, asOf: Date.now() }
    const last = db.circulars.filter((x) => !x.deletedAt && x.type === 'Market Update' && x.market).sort((a, z) => (z.market.asOf || z.publishedAt) - (a.market.asOf || a.publishedAt))[0]
    const { market: filled, report } = fillLayout(last, market)
    const w = { site: 'Market feed', team: null, user: FEED_USER }
    const c = { ...circularFrom({ type: 'Market Update', title: `Market Update · ${filled.session}`, audience: 'All', html: b.html || '', market: filled }, w),
      id: id('CIR'), publishedAt: Date.now(), by: FEED_USER, site: 'Market feed', deletedAt: null, updatedAt: null }
    db.circulars.push(c); save(); log(w, 'market update published by the feed', { id: c.id, rows: c.market.tables.reduce((n, t) => n + t.sections.reduce((m, s) => m + s.rows.length, 0), 0) })
    send(res, 200, { ok: true, id: c.id, title: c.title, layoutFrom: last?.id || null, ...report })
  }],

  // Quizzes (team only). Everyone sees their own attempt; Admin also sees who attempted each quiz.
  ['GET', /^\/content\/quizzes$/, (req, res) => {
    const w = who(req); const me = w.user?.mhfId
    const items = db.quizzes.filter((q) => quizOk(q, w)).sort((a, b) => b.publishedAt - a.publishedAt).map((q) => {
      const doc = db.docs.find((d) => d.id === q.docId); const all = db.attempts[q.id] || {}
      return { ...q, mime: doc?.mime, size: doc?.size, fileName: doc?.name, mine: (me && all[me]) || null, attemptCount: Object.keys(all).length,
        attempts: isAdmin(w) ? Object.entries(all).map(([mhfId, a]) => ({ mhfId, ...a, team: teamOfAttempt(a) })) : undefined }
    })
    send(res, 200, { site: w.site, team: w.team, admin: isAdmin(w), items, ...(isAdmin(w) ? { teams: teamLists() } : {}) })
  }],
  // A website tells the hub who its quiz takers are (sent when Admin opens Quiz): the team list behind the % per team
  // (21 Nov 2026). The B2C list is every B2C website's takers together (the same person in two websites counts once).
  ['POST', /^\/content\/quizzes\/roster$/, async (req, res) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const takerRole = String(b.takerRole || '').slice(0, 20); if (!takerRole) throw fail(400, 'takerRole is required.')
    const people = (Array.isArray(b.people) ? b.people : []).filter((p) => p?.mhfId && p.role !== 'Admin').slice(0, 5000).map((p) => ({ mhfId: String(p.mhfId).slice(0, 20), name: String(p.name || '').slice(0, 80), role: String(p.role || '').slice(0, 20) }))
    db.rosters ||= {}; db.rosters[w.site] = { team: w.team, takerRole, people, at: Date.now() }
    save(); send(res, 200, { ok: true, people: people.length })
  }],
  ['POST', /^\/content\/quizzes$/, async (req, res) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const title = String(b.title || '').trim(); if (!title) throw fail(400, 'Title is required.')
    checkAudience(b.audience || 'All')
    const ext = extOf(b.file?.name); if (!['html', 'htm', 'pdf'].includes(ext)) throw fail(400, 'A quiz must be an HTML or PDF file.')
    const f = storeFile(b.file)
    db.docs.push({ id: f.id, folderId: null, name: String(b.file.name), description: `Quiz: ${title}`, audience: b.audience || 'All', mime: f.mime, size: f.size, uploadedAt: Date.now(), uploadedBy: w.user, site: w.site, deletedAt: null, quizOnly: true })
    const q = { id: id('QZ'), title, topic: String(b.topic || '').trim(), audience: b.audience || 'All', docId: f.id, format: ext === 'pdf' ? 'PDF' : 'HTML', publishedAt: Date.now(), by: w.user, site: w.site, deletedAt: null }
    db.quizzes.push(q); save(); log(w, 'quiz published', { id: q.id, title }); send(res, 200, q)
  }],
  ['PATCH', /^\/content\/quizzes\/([\w-]+)$/, async (req, res, m) => {
    const w = who(req); needAdmin(w); const b = await readBody(req)
    const q = db.quizzes.find((x) => x.id === m[1] && !x.deletedAt); if (!q) throw fail(404, 'Quiz not found.')
    if (b.title != null) { const t = String(b.title).trim(); if (!t) throw fail(400, 'Title is required.'); q.title = t }
    if (b.topic != null) q.topic = String(b.topic).trim()
    if (b.audience != null) { checkAudience(b.audience); q.audience = b.audience }
    save(); log(w, 'quiz changed', { id: q.id, title: q.title }); send(res, 200, q)
  }],
  ['DELETE', /^\/content\/quizzes\/([\w-]+)$/, (req, res, m) => {
    const w = who(req); needAdmin(w)
    const q = db.quizzes.find((x) => x.id === m[1] && !x.deletedAt); if (!q) throw fail(404, 'Quiz not found.')
    q.deletedAt = Date.now(); save(); log(w, 'quiz deleted', { id: q.id, title: q.title }); send(res, 200, { ok: true })
  }],
  // an attempt: a person counts once per quiz; taking it again only raises their own 'times'
  ['POST', /^\/content\/quizzes\/([\w-]+)\/attempt$/, (req, res, m) => {
    const w = who(req); if (!w.user) throw fail(400, 'No user.')
    const q = db.quizzes.find((x) => x.id === m[1]); if (!q || !quizOk(q, w)) throw fail(404, 'Quiz not found.')
    if (isAdmin(w)) return send(res, 200, { mine: null, attemptCount: Object.keys(db.attempts[q.id] || {}).length, preview: true }) // Admin checks quizzes, does not take them
    db.attempts[q.id] ||= {}
    const all = db.attempts[q.id]; const a = all[w.user.mhfId]
    if (a) { a.times++; a.last = Date.now() } else all[w.user.mhfId] = { name: w.user.name, role: w.user.role, site: w.site, team: w.team, first: Date.now(), last: Date.now(), times: 1 }
    save(); log(w, 'quiz attempted', { id: q.id }); send(res, 200, { mine: all[w.user.mhfId], attemptCount: Object.keys(all).length })
  }],

  ['POST', /^\/content\/reset$/, (req, res) => { seed(); send(res, 200, { ok: true }) }],
]

function circularFrom(b, w) {
  const title = String(b.title || '').trim(); if (!title) throw fail(400, 'Title is required.')
  if (!CIRCULAR_TYPES.includes(b.type)) throw fail(400, 'Choose a circular type.')
  checkAudience(b.audience || 'All')
  let attachment = b.attachment || null
  if (attachment?.data) { // a new file: kept in the hub's file store, not in any folder
    const f = storeFile(attachment)
    const d = { id: f.id, folderId: null, name: String(attachment.name).trim(), description: `Attachment of the circular "${title}"`, audience: b.audience || 'All', mime: f.mime, size: f.size,
      uploadedAt: Date.now(), uploadedBy: w.user, site: w.site, deletedAt: null, circularOnly: true }
    db.docs.push(d); attachment = { docId: d.id, name: d.name, mime: d.mime, size: d.size }
  }
  if (b.type === 'Market Update') return { type: b.type, title, html: String(b.html || ''), audience: b.audience || 'All', attachment: null, market: marketFrom(b.market) }
  return { type: b.type, title, html: String(b.html || ''), audience: b.audience || 'All', attachment, market: null, page: pageFrom(b.page) }
}
// An uploaded HTML page shown inside the circular (product owner, 23 Nov 2026). Kept with the circular; the websites
// show it in a frame where its scripts cannot run, so it cannot touch the DMS page around it.
function pageFrom(p) {
  if (!p?.html) return null
  const html = String(p.html)
  if (html.length > 8 * 1024 * 1024) throw fail(413, 'The HTML page is larger than 8 MB.')
  return { name: String(p.name || 'page.html').trim(), html, size: Buffer.byteLength(html) }
}

// Market Update: tables, columns, groups and rows as sent; values are short strings (numbers as typed, or n/a)
function marketFrom(m0) {
  const m = upgradeMarket(m0 || {})
  const txt = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const TYPES = COLUMN_TYPES.map((t) => t.value)
  const tables = (Array.isArray(m?.tables) ? m.tables : []).slice(0, 8).map((t) => {
    const columns = (Array.isArray(t.columns) ? t.columns : []).slice(0, 24).filter((c) => /^\w{1,24}$/.test(c?.key || '')).map((c) => ({ key: c.key, label: txt(c.label, 40), group: txt(c.group, 30), type: TYPES.includes(c.type) ? c.type : 'num', ...(Array.isArray(c.of) ? { of: c.of.slice(0, 2).map(String) } : {}) }))
    const keys = new Set(columns.map((c) => c.key))
    const sections = (Array.isArray(t.sections) ? t.sections : []).slice(0, 40).map((sec) => ({ name: txt(sec.name), rows: (Array.isArray(sec.rows) ? sec.rows : []).slice(0, 300).filter((r) => txt(r.name)).map((r) => ({
      name: txt(r.name), v: Object.fromEntries(Object.entries(r.v || {}).filter(([k, x]) => keys.has(k) && String(x ?? '').trim() !== '').map(([k, x]) => [k, txt(x, 24)])),
      ...(r.unit === 'bps' ? { unit: 'bps' } : {}), ...(r.src ? { src: txt(r.src, 120) } : {}), ...(r.asOf ? { asOf: txt(r.asOf, 20) } : {}),
      ...(r.old && typeof r.old === 'object' && Object.keys(r.old).some((k) => keys.has(k)) ? { old: Object.fromEntries(Object.entries(r.old).filter(([k, d]) => keys.has(k) && /^\d{4}-\d{2}-\d{2}$/.test(d))) } : {}) })) })).filter((sec) => sec.rows.length || sec.name)
    return { title: txt(t.title, 200), note: txt(t.note, 500), firstLabel: txt(t.firstLabel, 30), columns, sections }
  }).filter((t) => t.columns.length && t.sections.some((sec) => sec.rows.length))
  if (!tables.some((t) => t.sections.some((sec) => sec.rows.some((r) => Object.keys(r.v).length)))) throw fail(400, 'The Market Update has no figures.')
  return { v: 2, session: SESSIONS.includes(m.session) ? m.session : 'Closing', asOf: Number(m.asOf) || Date.now(), source: ['manual', 'excel', 'auto'].includes(m.source) ? m.source : 'manual', tables }
}

// only the DMS websites (their keys) may call; /health is open
function guard(req, res, url) {
  if (url.pathname === '/health') return true
  if (SITES[req.headers['x-api-key']] && url.pathname.startsWith('/content/')) return true
  if (url.pathname === '/content/market/feed' && req.headers['x-feed-key'] === FEED_KEY) return true
  send(res, 403, { error: 'Forbidden: only a DMS website can use the Content Hub.' }); return false
}
serve({ name: 'content', port: env.CONTENT_PORT || 4105, host: env.HOST, routes, onRequest: guard })
