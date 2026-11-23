// Publish a Market Update from the market automation, straight away (product owner, 19 Nov 2026).
//   npm run market:feed -- "D:/CRM/DMS 2/Market Update.xlsx" [Morning|Mid-day|Closing]
//   npm run market:feed -- figures.json [Morning|Mid-day|Closing]
// figures.json is the simplest shape for a web scraper, row name -> column -> value:
//   { "Sensex": { "CMP": "82111.4", "Prev. close": "81974.4", "Returns 1W": "0.21" }, "Dow Jones": { "CMP": "44210.5" } }
// The figures go into the latest update's rows and columns (what Admin set in the form), matched by name (21 Nov
// 2026). Rows the latest update has but the file does not keep their last figure, shown with a clock. Rows in the
// file that the latest update does not have are left out and listed below. The automation can also call
// POST /content/market/feed itself with { values } / { market } / { xlsx } and the x-feed-key header.
import fs from 'node:fs'
import { loadEnv } from '../services/lib/common.mjs'

const env = loadEnv()
const [file, session] = process.argv.slice(2)
if (!file || !fs.existsSync(file)) { console.error('Usage: npm run market:feed -- "<Market Update.xlsx | figures.json>" [Morning|Mid-day|Closing]'); process.exit(1) }
let body
if (/\.json$/i.test(file)) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); body = j.values || j.market ? j : { values: j } } catch (e) { console.error(`${file} is not valid JSON: ${e.message}`); process.exit(1) }
} else body = { xlsx: fs.readFileSync(file).toString('base64') }
const url = `http://localhost:${env.CONTENT_PORT || 4105}/content/market/feed`
const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-feed-key': env.MARKET_FEED_KEY || 'market-feed-demo-key' },
  body: JSON.stringify({ ...body, ...(session ? { session } : {}) }),
}).catch((e) => { console.error(`The Content Hub is not reachable at ${url} (${e.message}). Is "npm run dev:all" running?`); process.exit(1) })
const j = await r.json().catch(() => ({}))
if (!r.ok) { console.error(`Not published: ${j.error || r.status}`); process.exit(1) }
console.log(`Published "${j.title}" (${j.id}). It shows in every DMS now.`)
console.log(`  ${j.filled} figures filled, ${j.kept} kept from the last update (shown with a clock).`)
if (j.rowsNotFound?.length) console.log(`  Not in this file (last figure kept): ${j.rowsNotFound.join(', ')}`)
if (j.notInLayout?.length) console.log(`  Left out (not in the Market Update layout; add the row in the form to show it): ${j.notInLayout.join(', ')}`)
