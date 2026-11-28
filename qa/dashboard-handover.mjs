// DB-12 (docs/DASHBOARD_TESTS.md): a new F1 handover carrying the source "Facebook Ad" arrives in Investor DMS with it
// as Original Source (Admin only), and the Admin Sources card counts it. It creates an investor, so it must run on a
// THROWAWAY copy of the data: the GitHub Pages build (npm run build:pages), whose services run inside this test
// browser and are discarded with it. The live demo data is never touched.
//   node qa/dashboard-handover.mjs http://localhost:8300/Data-management-system---DMS/
import { launch, ROLES, check } from './lib.mjs'

const base = process.argv[2]; if (!base) { console.error('Give the address of the served pages-dist/ folder.'); process.exit(1) }
const P = base + 'prospect/#'; const I = base + 'investor/#'
const results = []; const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
async function login(p, site, mhf) {
  await p.goto(site + '/login'); await p.waitForSelector('input[autocomplete=username]', { timeout: 60000 })
  await p.fill('input[autocomplete=username]', mhf); await p.click('button[type=submit]'); await p.waitForTimeout(2500)
}
const d = new Date(); const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
const key = `HND-${day}-${Math.floor(Math.random() * 900000) + 100000}`
const fam = `FAM-9${Math.floor(Math.random() * 9000) + 1000}`
const pan = `ZQ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}PS${Math.floor(Math.random() * 9000) + 1000}Q`

// 1. Prospect DMS sends a handover through the bridge (as the conversion wizard does), with the source name
const p = await ctx.newPage(); await login(p, P, ROLES.Admin)
const sent = await p.evaluate(async ({ key, fam, pan }) => {
  const body = { handoverId: key, idempotencyKey: key, contractVersion: '1.1.0', createdAt: new Date().toISOString(), familyId: fam,
    convertingAdvisorMhfId: 'MHF500007', convertingAdvisorName: 'John', actedByMhfId: null, convertedFromStage: 'Lead', investorPrimary: 'P1', sourceName: 'Facebook Ad',
    members: [{ personRef: 'P1', firstName: 'Source', middleName: '', lastName: 'Test', gender: 'Male', dateOfBirth: '1990-01-01', language: 'Hindi', nationality: 'Indian', relationship: 'Primary',
      pan, cid: 'CID9' + pan.slice(5, 9), platformFamilyId: 'PF-9' + pan.slice(5, 9), mobiles: [{ type: 'Residence', mobile: '98' + pan.slice(5, 9) + '7711', isWhatsapp: false }], emails: [], addresses: [], productInterest: [] }] }
  const r = await fetch('/bridge/handover', { method: 'POST', headers: { 'content-type': 'application/json', 'x-actor': 'QA' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}, { key, fam, pan })
check(results, 'DB-12 bridge accepts the handover and keeps sourceName (contract 1.1.0)', sent.status === 200 && !(sent.body.stripped || []).some((x) => /sourceName/.test(x)), JSON.stringify(sent.body).slice(0, 160))

// 2. Investor DMS picks it up (its inbox job runs every 10 seconds while the website is open)
const i = await ctx.newPage(); await login(i, I, ROLES.Admin)
let inv = null
for (let n = 0; n < 12 && !inv; n++) {
  await i.waitForTimeout(5000)
  inv = await i.evaluate(async (fam) => { const s = await (await fetch('/api/state')).json(); return (s.state?.clients || []).find((c) => c.familyId === fam) || null }, fam)
}
check(results, 'DB-12 Investor DMS stores Original Source on the new investor', inv?.originalSource === 'Facebook Ad', inv ? `originalSource = ${inv.originalSource}` : 'investor did not arrive')

if (inv) {
  // 3. shown to Admin on the record (Ownership), not to a team leader
  await i.goto(`${I}/record/${inv.id}`); await i.waitForTimeout(2000)
  const own = i.locator('button:has-text("Ownership")'); if (await own.count() && !(await i.locator('[data-testid=original-source]').count())) { await own.first().click(); await i.waitForTimeout(300) }
  const shown = await i.locator('[data-testid=original-source]').innerText().catch(() => '')
  check(results, 'DB-12 Admin sees Original Source on the record', shown.trim() === 'Facebook Ad', shown)
  // 4. counted by the Sources card
  await i.goto(`${I}/dashboard`); await i.waitForTimeout(2500); await i.keyboard.press('Escape')
  const row = await i.locator('[data-testid=dash-card-sourceAum] tr', { hasText: 'Facebook Ad' }).innerText().catch(() => '')
  check(results, 'DB-12 Sources card counts it under Facebook Ad', /Facebook Ad\s+1\b/.test(row.replace(/\s+/g, ' ')), row.replace(/\s+/g, ' '))
  // a team leader does not see Original Source
  const t = await ctx.newPage(); await login(t, I, ROLES.TL)
  await t.goto(`${I}/record/${inv.id}`); await t.waitForTimeout(2000)
  const ownT = t.locator('button:has-text("Ownership")'); if (await ownT.count() && !(await t.locator('dt:has-text("Data Code")').count())) { await ownT.first().click(); await t.waitForTimeout(300) }
  check(results, 'DB-12 a team leader does not see Original Source', (await t.locator('[data-testid=original-source]').count()) === 0)
}
await b.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} DB-12 checks passed`)
process.exitCode = failed.length ? 1 : 0
