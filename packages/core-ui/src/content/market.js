// Market Update: the circular sent three times a day (Morning / Mid-day / Closing) with the market tables
// (product owner, 18-19 Nov 2026). Plain JavaScript with no Vue, so the Content Hub and the import script use it too.
//
// Free per update, like the Data Fields layout: any number of TABLES, each with its own COLUMNS (optionally under a
// group heading, e.g. "Returns" over 1D ... 15Y, or "FII" / "DII"), GROUPS of rows (Index, Sectoral, Metals ...)
// and ROWS. Filled by hand, or by the market automation itself
// (POST /content/market/feed, published straight away). Internal only: the team uses it on calls.
//
// market = {
//   v: 2, session: 'Morning' | 'Mid-day' | 'Closing', asOf: <ms, "as on" time of the figures>, source: 'manual' | 'excel' | 'auto',
//   tables: [{
//     title, note (footnote), firstLabel (heading of the name column, e.g. 'Date'),
//     columns: [{ key, label, group, type, of }],   type: num | pct | text | diff (auto: a - b) | chgpct (auto: % a vs b)
//     sections: [{ name, rows: [{ name, v: { [key]: '82031.81' | 'n/a' }, unit: 'bps'?, src?, asOf? }] }],
//   }],
// }
// Values are kept as typed (strings); 'n/a' and other text show as they are. Percent values are in percent (-0.61).
// A row with unit 'bps' (10 Year G-sec yield) shows its percent columns in basis points.

export const MARKET = 'Market Update'
export const SESSIONS = ['Morning', 'Mid-day', 'Closing']
export const isMarket = (c) => c?.type === MARKET && !!c.market

/** Which update is due at this time of day: before 11:30 Morning, before 15:30 Mid-day, then Closing. */
export function sessionAt(t = Date.now()) {
  const d = new Date(t); const m = d.getHours() * 60 + d.getMinutes()
  return m < 690 ? 'Morning' : m < 930 ? 'Mid-day' : 'Closing'
}

export const COLUMN_TYPES = [
  { value: 'num', label: 'Number' },
  { value: 'pct', label: 'Percent (%)' },
  { value: 'text', label: 'Text' },
  { value: 'diff', label: 'Auto: difference (a − b)' },
  { value: 'chgpct', label: 'Auto: % change (a vs b)' },
]
export const isAuto = (c) => c.type === 'diff' || c.type === 'chgpct'
export const isPct = (c) => c.type === 'pct' || c.type === 'chgpct'
export const inputColumns = (t) => t.columns.filter((c) => !isAuto(c))

// ---------------------------------------------------------------- tables to start from
export const RETURN_PERIODS = ['1W', '15D', '1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '10Y', '15Y']
const key = (s) => `c${Math.random().toString(36).slice(2, 7)}`
export function pricesTable(sections = [['Index', ['Sensex', 'NIFTY 50']]]) {
  return {
    title: '', note: 'Returns: absolute for periods up to 1Y, CAGR beyond 1Y. Indices = price returns. 10Y yield change in bps.', firstLabel: '',
    columns: [
      { key: 'cmp', label: 'CMP', group: '', type: 'num' },
      { key: 'prev', label: 'Prev. close', group: '', type: 'num' },
      { key: 'chg', label: 'Change', group: '', type: 'diff', of: ['cmp', 'prev'] },
      { key: 'r1d', label: '1D', group: 'Returns', type: 'chgpct', of: ['cmp', 'prev'] },
      ...RETURN_PERIODS.map((p) => ({ key: `r${p.toLowerCase()}`, label: p, group: 'Returns', type: 'pct' })),
    ],
    sections: sections.map(([name, rows]) => ({ name, rows: rows.map((r) => ({ name: r, v: {}, ...(/yield/i.test(r) ? { unit: 'bps' } : {}) })) })),
  }
}
export function flowsTable() {
  return {
    title: 'FII / DII trading activity on NSE, BSE and MSEI · capital market segment (Rs crore)', note: '', firstLabel: 'Date',
    columns: [
      { key: 'fb', label: 'Gross purchase', group: 'FII', type: 'num' }, { key: 'fs', label: 'Gross sales', group: 'FII', type: 'num' }, { key: 'fn', label: 'Net', group: 'FII', type: 'diff', of: ['fb', 'fs'] },
      { key: 'db', label: 'Gross purchase', group: 'DII', type: 'num' }, { key: 'ds', label: 'Gross sales', group: 'DII', type: 'num' }, { key: 'dn', label: 'Net', group: 'DII', type: 'diff', of: ['db', 'ds'] },
    ],
    sections: [{ name: '', rows: [] }],
  }
}
export function blankTable() {
  return { title: 'New table', note: '', firstLabel: '', columns: [{ key: key(), label: 'Value', group: '', type: 'num' }], sections: [{ name: 'New group', rows: [{ name: '', v: {} }] }] }
}
export const newColumnKey = key
export function blankMarket(session = sessionAt()) {
  return { v: 2, session, asOf: Date.now(), source: 'manual', tables: [pricesTable([['Index', ['Sensex', 'NIFTY 50', 'Nifty Bank']], ['Metals', ['Gold ($ per troy ounce)', 'Silver ($ per ounce)']], ['Currency', ['$ / Rs']], ['Government Bonds', ['10 Year G-sec yield']]]), flowsTable()] }
}
const clone = (x) => JSON.parse(JSON.stringify(x))

/**
 * A manual update starts from the last one: same tables, groups, rows and columns. CMP is emptied to type in (the
 * last CMP shows as a hint); previous close stays during a day, and the next day the last CMP becomes the previous
 * close. Other figures (returns, FII / DII) are kept, to change where needed.
 */
export function fromLast(last, session = sessionAt()) {
  if (!last?.market) return blankMarket(session)
  const m = upgradeMarket(clone(last.market))
  const newDay = new Date(last.market.asOf || last.publishedAt).toDateString() !== new Date().toDateString()
  for (const t of m.tables) {
    const cmp = t.columns.find((c) => c.key === 'cmp'); const prev = t.columns.find((c) => c.key === 'prev')
    if (!cmp) continue
    for (const s of t.sections) for (const r of s.rows) { r.was = r.v.cmp; if (prev && newDay) r.v.prev = r.v.cmp ?? r.v.prev; r.v.cmp = ''; delete r.asOf; delete r.src }
  }
  return { ...m, session, asOf: Date.now(), source: 'manual' }
}

// ---------------------------------------------------------------- the automation fills the layout (by name)
// Product owner, 21 Nov 2026: Admin decides WHAT is shown (tables, groups, rows, columns) by editing the update in
// the form; the latest update is the layout. The automation only brings values, matched by NAME:
//   table  - same title, else the next table of the same kind (a "Date" table or not)
//   row    - same name (case, spaces and punctuation ignored), in any group of that table
//   column - group + label ("Returns 1W"), or the label alone ("1W", "CMP") when no other column has it
// A value the automation does not bring keeps the last figure, marked old (r.old[key] = day it is from), and shows
// a clock. Rows or columns the automation sends that are not in the layout are left out (and reported back).
// A table whose name column is headed "Date" (FII / DII) is a running list: its rows come from the automation.
export const isSeries = (t) => /^date$/i.test(String(t?.firstLabel || '').trim())
const nm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9$%₹]+/g, ' ').trim()
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const blank = (x) => x == null || String(x).trim() === ''

/** One table of the automation's data as: rows by name -> values by column name. */
function indexTable(t) {
  const labels = {}; for (const c of t.columns || []) labels[nm(c.label)] = (labels[nm(c.label)] || 0) + 1
  const rows = new Map(); const order = []
  for (const s of t.sections || []) for (const r of s.rows || []) {
    const vals = new Map()
    for (const c of t.columns || []) {
      if (isAuto(c) || blank(r.v?.[c.key])) continue
      vals.set(nm(`${c.group || ''} ${c.label}`), r.v[c.key]); if (labels[nm(c.label)] === 1) vals.set(nm(c.label), r.v[c.key])
    }
    rows.set(nm(r.name), { name: r.name, vals, src: r.src, asOf: r.asOf, unit: r.unit }); order.push(r.name)
  }
  return { title: nm(t.title), series: isSeries(t), rows, order, used: new Set() }
}
/** The automation's data in either shape: { tables } (as the website keeps it) or { values: { row: { column: value } } }. */
function indexFeed(feed) {
  if (feed?.values && typeof feed.values === 'object') {
    const rows = new Map(); const order = []
    for (const [name, cols] of Object.entries(feed.values)) {
      const vals = new Map(); for (const [k, x] of Object.entries(cols || {})) if (!blank(x)) vals.set(nm(k), String(x))
      rows.set(nm(name), { name, vals }); order.push(name)
    }
    return { flat: { title: '', series: false, rows, order, used: new Set() }, tables: [] }
  }
  return { flat: null, tables: (feed?.tables || []).map(indexTable) }
}

/**
 * The next update: the layout of `last` (the latest Market Update circular) filled with the automation's `feed`.
 * Returns { market, report: { filled, kept, rowsNotFound: [...], notInLayout: [...] } }.
 */
export function fillLayout(last, feed) {
  const asOf = Number(feed?.asOf) || Date.now()
  const session = SESSIONS.includes(feed?.session) ? feed.session : sessionAt(asOf)
  const report = { filled: 0, kept: 0, rowsNotFound: [], notInLayout: [] }
  if (!last?.market) return { market: { ...feed, v: 2, session, asOf, source: 'auto' }, report }
  const m = upgradeMarket(clone(last.market))
  const lastDay = isoDay(last.market.asOf || last.publishedAt); const newDay = lastDay !== isoDay(asOf)
  const fi = indexFeed(feed); const taken = new Set()
  m.tables.forEach((t, ti) => {
    const series = isSeries(t)
    let ft = fi.flat
    if (!ft) {
      ft = (nm(t.title) && fi.tables.find((x, i) => !taken.has(i) && x.title === nm(t.title))) || fi.tables.find((x, i) => !taken.has(i) && x.series === series) || null
      if (ft) taken.add(fi.tables.indexOf(ft))
    }
    const cols = inputColumns(t)
    const labels = {}; for (const c of t.columns) labels[nm(c.label)] = (labels[nm(c.label)] || 0) + 1
    const pick = (fr, c) => { const a = fr.vals.get(nm(`${c.group || ''} ${c.label}`)); return a !== undefined ? a : labels[nm(c.label)] === 1 ? fr.vals.get(nm(c.label)) : undefined }
    if (series) { // a running list (dates): the automation's rows, in the layout's columns
      if (ft && !fi.flat && ft.rows.size) {
        t.sections = [{ name: t.sections[0]?.name || '', rows: ft.order.map((name) => { const fr = ft.rows.get(nm(name)); ft.used.add(nm(name)); const v = {}; for (const c of cols) { const x = pick(fr, c); if (x !== undefined) { v[c.key] = String(x); report.filled++ } } return { name, v } }) }]
      } else for (const s of t.sections) for (const r of s.rows) for (const c of cols) if (!blank(r.v[c.key])) { r.old = { ...(r.old || {}), [c.key]: r.old?.[c.key] || lastDay }; report.kept++ }
      return
    }
    for (const s of t.sections) for (const r of s.rows) {
      const fr = ft?.rows.get(nm(r.name)); if (fr) ft.used.add(nm(r.name)); else report.rowsNotFound.push(r.name)
      const before = r.v || {}; const v = {}; const old = {}
      const cmpCol = cols.find((c) => c.key === 'cmp'); const newCmp = !!(fr && cmpCol && pick(fr, cmpCol) !== undefined)
      for (const c of cols) {
        const x = fr ? pick(fr, c) : undefined
        if (x !== undefined) { v[c.key] = String(x); report.filled++; continue }
        // no previous close sent but a new price: the previous close is the last price of an earlier day. Without a
        // new price the row keeps its last move (price and previous close), marked old, rather than showing 0.00%.
        if (c.key === 'prev' && newDay && newCmp && !blank(before.cmp)) { v.prev = before.cmp; continue }
        if (!blank(before[c.key])) { v[c.key] = before[c.key]; old[c.key] = r.old?.[c.key] || lastDay; report.kept++ }
      }
      r.v = v; if (Object.keys(old).length) r.old = old; else delete r.old
      delete r.was
      if (fr?.src) r.src = fr.src
      if (fr) { if (fr.asOf) r.asOf = fr.asOf; else if (Object.keys(v).length > Object.keys(old).length) r.asOf = isoDay(asOf) }
    }
  })
  for (const x of fi.flat ? [fi.flat] : fi.tables) for (const name of x.order) if (!x.used.has(nm(name))) report.notInLayout.push(name)
  return { market: { ...m, session, asOf, source: 'auto' }, report }
}

// ---------------------------------------------------------------- numbers
export const num = (s) => { const t = String(s ?? '').replace(/,/g, '').trim(); return t === '' || isNaN(t) ? null : Number(t) }
export const fmtNum = (v, d = 0) => (v == null ? '' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }))
/** Decimals by size: 82,032 · 93.44 · 3.213 */
export const dpFor = (x) => { const a = Math.abs(x ?? 0); return a >= 1000 ? 0 : a >= 10 ? 2 : 3 }
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '')
export const signed = (v, d = 0) => (v == null ? '' : `${sign(+v.toFixed(d))}${fmtNum(Math.abs(v), d)}`)
export const pctText = (p, bps = false) => (p == null ? '' : bps ? `${sign(+p.toFixed(1))}${Math.abs(p).toFixed(1)} bps` : `${sign(+p.toFixed(2))}${Math.abs(p).toFixed(2)}%`)
export const tone = (v) => (v == null ? 'text-ink-gray-5' : v > 0 ? 'text-ink-green-7' : v < 0 ? 'text-ink-red-7' : 'text-ink-gray-6')

/** The value of a cell: a number (typed or worked out), or null. */
export function cellValue(row, col) {
  if (isAuto(col)) {
    const a = num(row.v?.[col.of?.[0]]); const b = num(row.v?.[col.of?.[1]]); if (a == null || b == null) return null
    if (col.type === 'diff') return a - b
    return row.unit === 'bps' ? (a - b) * 100 : b ? ((a - b) / b) * 100 : null
  }
  return num(row.v?.[col.key])
}
/** What a cell shows, and its colour. */
export function cell(row, col) {
  const raw = row.v?.[col.key]
  if (!isAuto(col) && raw != null && raw !== '' && num(raw) == null) return { text: String(raw), cls: 'text-ink-gray-4', v: null } // n/a, text
  const v = cellValue(row, col)
  if (v == null) return { text: col.type === 'text' ? String(raw ?? '') : '', cls: 'text-ink-gray-7', v: null }
  if (isPct(col)) return { text: pctText(v, row.unit === 'bps'), cls: tone(v), v }
  if (col.type === 'diff') return { text: signed(v, dpFor(num(row.v?.[col.of?.[0]]))), cls: tone(v), v }
  return { text: fmtNum(v, dpFor(v)), cls: '', v }
}

// ---------------------------------------------------------------- summaries
const firstOf = (t, type) => t?.columns.find((c) => c.type === type)
/** Headline figures (pinned strip, list): Sensex, NIFTY 50 and the first metal. */
export function headline(market, n = 3) {
  const t = market?.tables?.[0]; if (!t) return []
  const val = firstOf(t, 'num'); const pc = firstOf(t, 'chgpct')
  const rows = t.sections.flatMap((s) => s.rows).filter((r) => num(r.v?.[val?.key]) != null)
  const metal = t.sections.find((s) => /metal|gold/i.test(s.name))?.rows.find((r) => num(r.v?.[val?.key]) != null)
  const pick = [...new Set([...rows.slice(0, metal ? n - 1 : n), metal].filter(Boolean))]
  return pick.map((r) => ({ name: r.name.replace(/\s*\(.*\)$/, ''), value: cell(r, val).text, pct: pc ? cellValue(r, pc) : null, bps: r.unit === 'bps' }))
}
export function summaryText(market) {
  return headline(market, 4).map((h) => `${h.name} ${h.value}${h.pct != null ? ` (${pctText(h.pct, h.bps)})` : ''}`).join(' · ')
}
/** Ready to publish: some CMP is typed (or, with no CMP column anywhere, some table's first typed column). */
export function filled(market) {
  const tables = market?.tables || []
  const has = (t, k) => !!k && t.sections.some((s) => s.rows.some((r) => String(r.v?.[k] ?? '').trim()))
  const withCmp = tables.filter((t) => t.columns.some((c) => c.key === 'cmp'))
  return withCmp.length ? withCmp.some((t) => has(t, 'cmp')) : tables.some((t) => has(t, inputColumns(t)[0]?.key))
}
export const rowCount = (market) => (market?.tables || []).reduce((n, t) => n + t.sections.reduce((m, s) => m + s.rows.length, 0), 0)

/** The first Market Update (sections + flows, 18 Nov 2026) in today's form. */
export function upgradeMarket(m) {
  if (!m || m.tables) return m
  const t = pricesTable(); t.sections = (m.sections || []).map((s) => ({ name: s.name, rows: s.rows.map((r) => ({ name: r.name, v: { cmp: r.cmp, prev: r.prev }, ...(/yield/i.test(r.name) ? { unit: 'bps' } : {}) })) }))
  const f = flowsTable(); f.sections[0].rows = (m.flows?.rows || []).map((r) => ({ name: r.date, v: { fb: r.fiiBuy, fs: r.fiiSell, db: r.diiBuy, ds: r.diiSell } }))
  return { v: 2, session: m.session || 'Closing', asOf: m.asOf || null, source: 'manual', tables: f.sections[0].rows.length ? [t, f] : [t] }
}

// ---------------------------------------------------------------- Excel (the file the market automation writes)
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unxml = (s) => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? _))
async function unzip(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let eocd = -1; for (let i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.')
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = {}
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true); const size = dv.getUint32(p + 20, true); const nameLen = dv.getUint16(p + 28, true)
    const extra = dv.getUint16(p + 30, true); const comment = dv.getUint16(p + 32, true); const local = dv.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen)); p += 46 + nameLen + extra + comment
    if (!/^xl\/(worksheets\/sheet\d+|sharedStrings|workbook)\.xml$/.test(name)) continue
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const data = u8.subarray(start, start + size)
    out[name] = method === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
  }
  return out
}
function sheetRows(xml, strings) {
  const rows = {}
  for (const row of xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r = {}
    for (const c of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const t = /t="(\w+)"/.exec(c[2])?.[1]; const v = /<v>([\s\S]*?)<\/v>/.exec(c[3] || '')?.[1]
      const val = t === 's' ? strings[+v] : t === 'inlineStr' ? [...(c[3] || '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('') : v
      if (val != null && String(val).trim() !== '') r[c[1]] = unxml(val).trim()
    }
    rows[+row[1]] = r
  }
  return rows
}
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const round = (x, d = 4) => String(+Number(x).toFixed(d))
const excelDate = (serial) => new Date(Date.UTC(1899, 11, 30) + Math.round(+serial) * 86400000)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "as on 18-Nov-2026 5:38 PM" -> ms */
function asOnTime(text) {
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(text || ''); if (!m) return null
  let h = +m[4]; if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0)
  return new Date(+m[3], MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()), +m[1], h, +m[5]).getTime()
}
/**
 * Read the Market Update Excel (sheet 1: the tables; sheet 2 "Run Log": source and date of each figure) into a
 * Market Update. Groups are the text-only rows (Sectoral, Thematic, Metals ...); the FII / DII block becomes its own
 * table; the "Returns: ..." line becomes the footnote. Returns in the file are fractions (0.0186 = 1.86%).
 */
export async function parseMarketXlsx(buf) {
  const files = await unzip(buf)
  const strings = [...(files['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
  const s1 = sheetRows(files['xl/worksheets/sheet1.xml'] || '', strings)
  const s2 = files['xl/worksheets/sheet2.xml'] ? sheetRows(files['xl/worksheets/sheet2.xml'], strings) : {}
  const log = {}; for (const r of Object.values(s2)) if (r.A && r.E && r.A !== 'Item') log[r.A] = { src: r.E, asOf: r.D || '' }
  const nums = Object.keys(s1).map(Number).sort((a, b) => a - b)
  const head = nums.find((n) => /^CMP$/i.test(s1[n].C || '')); if (!head) throw new Error('Could not find the "CMP" heading in the first sheet.')
  const title = Object.values(s1).find((r) => /market update/i.test(r.B || ''))?.B || ''
  const asOf = asOnTime(title) || Date.now()
  // returns columns: labels in the row under the heading (1D, 1W ... 15Y)
  const sub = s1[head + 1] || {}
  const retCols = COLS.filter((c) => COLS.indexOf(c) >= 5 && sub[c])
  const prices = pricesTable([]); prices.title = ''
  prices.columns = [prices.columns[0], prices.columns[1], prices.columns[2], ...retCols.map((c) => (sub[c] === '1D' ? prices.columns[3] : { key: `r${sub[c].toLowerCase()}`, label: sub[c], group: s1[head].F || 'Returns', type: 'pct' }))]
  prices.note = ''
  let sec = { name: s1[head].B || 'Index', rows: [] }; prices.sections.push(sec)
  const tables = [prices]; let flows = null
  for (const n of nums.filter((x) => x > head + 1)) {
    const r = s1[n]
    if (flows) { // FII / DII block: two heading rows, then dates
      if (r.B && /^\d+(\.\d+)?$/.test(r.B) && r.C) {
        const d = excelDate(r.B); const first = !flows.sections[0].rows.length
        const label = first && d.getUTCDate() === 1 ? `${MON[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)} (month so far)` : `${d.getUTCDate()}-${MON[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`
        flows.sections[0].rows.push({ name: label, v: { fb: round(r.C, 2), fs: round(r.D, 2), db: round(r.F, 2), ds: round(r.G, 2) } })
      }
      continue
    }
    if (!r.B) continue
    const isRow = r.C != null
    if (isRow) {
      const bps = /yield/i.test(r.B)
      const v = { cmp: round(r.C), prev: round(r.D) }
      for (const c of retCols) { if (sub[c] === '1D') continue; const x = r[c]; v[`r${sub[c].toLowerCase()}`] = x == null ? '' : num(x) == null ? x : round(bps ? num(x) : num(x) * 100, 2) }
      sec.rows.push({ name: r.B, v, ...(bps ? { unit: 'bps' } : {}), ...(log[r.B] ? { src: log[r.B].src, asOf: log[r.B].asOf } : {}) })
    } else if (/FII|DII/i.test(r.B)) { flows = flowsTable(); flows.title = r.B.replace(/\s+/g, ' ').trim(); tables.push(flows) }
    else if (/^returns?\s*:/i.test(r.B) || r.B.length > 60) prices.note = r.B.replace(/\s+/g, ' ').trim()
    else { sec = { name: r.B, rows: [] }; prices.sections.push(sec) }
  }
  prices.sections = prices.sections.filter((s) => s.rows.length)
  if (!prices.sections.length) throw new Error('No figures found in the first sheet.')
  return { v: 2, session: sessionAt(asOf), asOf, source: 'excel', tables }
}
