// Split tests TS-01 .. TS-23 (split prompt §13). Needs `npm run dev:all` running. Starts from a full reset.
// UI where the behaviour is visual; each website's own services (dev-only window.__qa hook) where a rule is exercised;
// the website databases and the bridge read through their own APIs to check results.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { launch, openAs, go, P, I, env, api, check, SHOTS, QA_DIR } from './lib.mjs'

const results = []
const problems = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PAPI = `http://127.0.0.1:${env.P_API_PORT}`, IAPI = `http://127.0.0.1:${env.I_API_PORT}`, BR = `http://127.0.0.1:${env.BRIDGE_PORT}`, TPS = `http://127.0.0.1:${env.TP_SIM_PORT}`
const pState = async () => (await api(PAPI, 'GET', '/api/state', null, { 'x-api-key': env.P_API_KEY })).data.state
const iState = async () => (await api(IAPI, 'GET', '/api/state', null, { 'x-api-key': env.I_API_KEY })).data.state
const admin = (method, p, body) => api(BR, method, p, body, { 'x-api-key': env.P_API_KEY, 'x-actor-role': 'Admin', 'x-actor': 'QA script' })
async function waitFor(fn, ms = 40000, step = 1000) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step) } return null }
/** Call one of the page's own services and save: call(page, 'lifecycle', 'adminAssign', [ids], 'u_is2') */
async function call(page, mod, fn, ...args) {
  return page.evaluate(async ({ mod, fn, args }) => {
    await window.__qa.reload() // act on the latest data: other tabs and the other website's jobs may have saved meanwhile
    const r = await window.__qa.s[`./services/${mod}.js`][fn](...args)
    await window.__qa.flush()
    try { return JSON.parse(JSON.stringify(r ?? null)) } catch { return null }
  }, { mod, fn, args })
}
async function callErr(page, mod, fn, ...args) {
  return page.evaluate(async ({ mod, fn, args }) => { await window.__qa.reload(); try { await window.__qa.s[`./services/${mod}.js`][fn](...args); return null } catch (e) { return e.message } }, { mod, fn, args })
}
const service = (action, name) => execFileSync(process.execPath, [path.join(QA_DIR, '..', 'scripts', 'service.mjs'), action, name], { stdio: 'ignore' })
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/split_${name}.png` })

execFileSync(process.execPath, [path.join(QA_DIR, '..', 'scripts', 'reset-all.mjs')], { stdio: 'ignore' })
await sleep(500)
const browser = await launch()
const iA = await openAs(browser, I, 'MHF500001', problems, 'I-Admin') // seeds Investor DMS
const pp = await openAs(browser, P, 'MHF500007', problems, 'P-Anubhav') // seeds Prospect DMS
const pA = await openAs(browser, P, 'MHF500001', problems, 'P-Admin')
await go(iA, I, '/investors', 1500); await go(pp, P, '/prospects', 1500); await go(pA, P, '/prospects', 1500)

async function wizard(page, id, { pick = true, verifyAll = true } = {}) {
  await go(page, P, `/record/${id}`, 800)
  await page.evaluate(() => window.__qa.reload()); await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Convert', exact: true }).click(); await page.waitForTimeout(500)
  if (pick) await page.getByText('Convert to Investor', { exact: true }).click()
  await page.getByRole('button', { name: 'SUBMIT' }).click(); await page.waitForTimeout(1200)
  if (verifyAll) { await page.getByRole('button', { name: 'Verify all' }).click(); await page.waitForTimeout(2500) }
}
async function confirmWizard(page) {
  await page.getByRole('button', { name: 'Convert', exact: true }).click(); await page.waitForTimeout(2500)
}
const P_PL = (s, u) => s.clients.filter((c) => c.assignedTo === u && ['Prospect', 'Lead'].includes(c.stage)).length

// ---------------- TS-19 cross-address and key separation ----------------
await go(pp, P, '/investors', 900); const inv1 = await pp.locator('text=Invalid page or not permitted to access').count()
await go(iA, I, '/pool', 900); const inv2 = await iA.locator('text=Invalid page or not permitted to access').count()
const k1 = await api(PAPI, 'GET', '/api/state/version', null, { 'x-api-key': env.I_API_KEY })
const k2 = await api(IAPI, 'GET', '/api/state/version', null, { 'x-api-key': env.P_API_KEY })
const k3 = await api(BR, 'GET', '/handover/inbox', null, { 'x-api-key': env.P_API_KEY })
check(results, 'TS-19', inv1 && inv2 && k1.status === 403 && k2.status === 403 && k3.status === 403, `invalid pages ${inv1}/${inv2}; p-api with I key ${k1.status}; i-api with P key ${k2.status}; P key on inbox ${k3.status}`)

// ---------------- TS-20 no Release to Pool in Investor DMS ----------------
await go(iA, I, '/investors', 1500)
await iA.locator('tbody input[type=checkbox], tbody [role=checkbox]').first().click(); await iA.waitForTimeout(400)
await iA.getByRole('button', { name: 'Bulk actions' }).click(); await iA.waitForTimeout(500)
const menu = await iA.locator('[role=menu]').innerText().catch(() => '')
check(results, 'TS-20', menu.includes('Assign to') && !menu.includes('Release to Pool'), `bulk menu: ${menu.replace(/\s+/g, ' ').trim()}`)
await iA.keyboard.press('Escape')

// ---------------- TS-17 pending approval blocks conversion ----------------
await api(TPS, 'POST', '/console/register', { name: 'Himanshu Kumar', pan: 'ABKPK1234F', mobile: '7862171615', platformFamilyId: 'PF-30014', advisorMhfId: 'MHF500007' })
await wizard(pp, 'CRM-LEAD-2026-00014', { pick: true })
await pp.getByRole('button', { name: 'Convert', exact: true }).click(); await pp.waitForTimeout(1500)
const e17 = await pp.locator('[data-testid=wizard-error]').innerText().catch(() => '')
check(results, 'TS-17', /Resolve the pending approval request/.test(e17), e17)
await pp.keyboard.press('Escape'); await pp.waitForTimeout(300)

// ---------------- TS-01 / TS-02 / TS-03 / TS-05 / TS-06 conversion of Ramesh Kumar's family ----------------
const before = await pState()
await wizard(pp, 'CRM-LEAD-2026-00021')
const states = await pp.locator('[data-testid=row-state]').allInnerTexts()
await shot(pp, 'TS01_step1')
await pp.getByRole('button', { name: 'Convert', exact: true }).click(); await pp.waitForTimeout(2500)
await call(iA, 'inbox', 'processInbox')
const iGroup = await waitFor(async () => (await iState()).clients.find((c) => c.id === 'CID60001'))
await call(pp, 'handover', 'processOutbox')
const p1 = await waitFor(async () => { const s = await pState(); const c = s.clients.find((x) => x.id === 'CRM-LEAD-2026-00021'); return c.members.filter((m) => m.investor?.status === 'Accepted').length === 2 ? s : null })
const rc = p1?.clients.find((x) => x.id === 'CRM-LEAD-2026-00021')
check(results, 'TS-01', states.join('|') === 'Verified ✓|Verified ✓|No match found|No match found' && iGroup?.members.length === 2 && iGroup?.assignedTo === 'u_is1' && rc?.stage === 'Investor Family' && rc.members.filter((m) => m.investor).length === 2 && before.activities.filter((a) => a.clientId === rc.id).every((a) => p1.activities.some((b) => b.id === a.id)),
  `rows: ${states.join(', ')}; Investor DMS group ${iGroup?.id} with ${iGroup?.members.length} under ${iGroup?.assignedTo}; Prospect DMS ${rc?.id} = ${rc?.stage}, ${rc?.members.filter((m) => m.investor).length} Investor tags, history kept`)
// TS-02: investor members show name + tag only, and are not reachable
await go(pp, P, '/record/CRM-LEAD-2026-00021', 1500)
const masked = await pp.locator('[data-testid=masked-mobile]').innerText().catch(() => '')
const book = await pp.evaluate(() => { const db = window.__qa.db; const c = db.clientById('CRM-LEAD-2026-00021'); const calls = window.__qa.s['./services/calls.js']; return { book: calls.phoneBook(c).map((b) => b.name), wa: calls.waNumbers(c).map((x) => x.name) } })
const inv = rc.members.filter((m) => m.investor)
check(results, 'TS-02', masked === '••••' && inv.every((m) => !m.contacts.length && !m.emails.length && !m.pan) && !book.book.includes('Ramesh Kumar') && !book.wa.includes('Sunita Kumar'),
  `side panel mobile "${masked}"; phone book: ${book.book.join(', ')}; WhatsApp: ${book.wa.join(', ')}; investor data left: ${JSON.stringify(inv.map((m) => Object.keys(m).filter((k) => !['key', 'first_name', 'middle_name', 'last_name', 'relationship', 'investor', 'contacts', 'emails', 'addresses', 'product', 'extra'].includes(k))))}`)
// TS-03
await go(pA, P, '/investor-family', 1500)
const heads = await pA.locator('thead').innerText()
const releaseErr = await callErr(pA, 'lifecycle', 'releaseToPool', await pA.evaluate(() => window.__qa.db.clientById('CRM-LEAD-2026-00021')))
check(results, 'TS-03', !/Rem\. Days/.test(heads) && /Members/.test(heads) && P_PL(p1, 'u_is1') === P_PL(before, 'u_is1') - 1 && /never goes to the Pool/.test(releaseErr || '') && (await pA.locator('tbody input[type=checkbox]').count()) === 0,
  `columns: ${heads.replace(/\s+/g, ' ')}; 1500 count ${P_PL(before, 'u_is1')} -> ${P_PL(p1, 'u_is1')}; release: ${releaseErr}`)
// TS-05: contract fields only + hash logged
const contract = JSON.parse(fs.readFileSync(path.join(QA_DIR, '..', 'services', 'bridge', 'contract', 'handover-contract.json'), 'utf8'))
const strip = await api(BR, 'POST', '/handover', { handoverId: 'HND-20261112-9999', idempotencyKey: 'HND-20261112-9999', familyId: 'FAM-QA', convertingAdvisorMhfId: 'MHF500007', investorPrimary: 'P1', notes: 'secret note', callLogs: [1], members: [{ personRef: 'P1', firstName: 'QA', lastName: 'Probe', pan: 'QAQAQ0000Q', recording: 'x', mobiles: [{ type: 'Residence', mobile: '9000000000', isWhatsapp: false, comment: 'x' }] }] }, { 'x-api-key': env.P_API_KEY, 'x-actor': 'QA script' })
const audit = (await admin('GET', '/audit')).data
const f1 = audit.items.find((e) => e.flow === 'F1' && e.ref === 'HND-20261112-0001' && e.route === 'POST /handover')
check(results, 'TS-05', !!f1?.hash && (contract.neverSent || []).some((x) => /Pool Source/.test(x)) && ['notes', 'callLogs', 'members[0].recording', 'members[0].mobiles[0].comment'].every((k) => strip.data.stripped.includes(k)) && contract.person.includes('pan'),
  `F1 hash ${f1?.hash?.slice(0, 16)}…; extra fields stripped and logged: ${strip.data.stripped.join(', ')}`)
// the probe handover must not create anything: reject it from Investor DMS side by acking it
await api(BR, 'POST', '/handover/HND-20261112-9999/ack', { status: 'Rejected', reasonCode: 'QA_PROBE', at: new Date().toISOString() }, { 'x-api-key': env.I_API_KEY, 'x-actor': 'QA script' })
// TS-06
const is = await iState()
const acts = is.activities.filter((a) => a.clientId === 'CID60001')
const hist = ['calls', 'notes', 'events', 'wa', 'emails'].map((k) => is[k].filter((x) => x.clientId === 'CID60001').length)
check(results, 'TS-06', acts.length === 1 && /Received from Prospect DMS/.test(acts[0].text) && hist.every((n) => n === 0) && !(iGroup.documents || []).length, `Activity: ${acts.map((a) => a.text).join(' | ')}; calls/notes/events/WhatsApp/emails: ${hist.join('/')}`)

// ---------------- TS-04 a third member registers later ----------------
await api(TPS, 'POST', '/console/register', { name: 'Priya Kumar', pan: 'LMNOP4567Q', mobile: '9876501003', platformFamilyId: 'PF-30001', advisorMhfId: 'MHF500007' })
await wizard(pp, 'CRM-LEAD-2026-00021', { pick: false })
const rows4 = await pp.locator('[data-testid=row-state]').allInnerTexts()
await shot(pp, 'TS04_step1')
await confirmWizard(pp)
const err4 = await pp.locator('[data-testid=wizard-error]').innerText().catch(() => '')
await shot(pp, 'TS04_after')
await call(iA, 'inbox', 'processInbox')
const g4 = await waitFor(async () => { const c = (await iState()).clients.find((x) => x.id === 'CID60001'); return c?.members.length === 3 ? c : null })
check(results, 'TS-04', !!g4 && (await iState()).clients.filter((c) => c.familyId === 'FAM-00021').length === 1, `wizard rows: ${rows4.join(', ')}${err4 ? ' – ' + err4 : ''}; group CID60001 members: ${g4?.members.map((m) => m.first_name).join(', ')}`)

// ---------------- TS-07 Admin reassigns in Investor DMS -> family follows ----------------
await iA.reload(); await iA.waitForTimeout(1500)
await call(iA, 'lifecycle', 'adminAssign', ['CID60001'], 'u_is2')
await call(iA, 'familyLog', 'sendFamilyLog')
await call(pA, 'familyLog', 'pullFamilyLog')
const p7 = await waitFor(async () => { const s = await pState(); return s.clients.find((c) => c.id === 'CRM-LEAD-2026-00021').assignedTo === 'u_is2' ? s : null })
const n7 = p7?.notifications.filter((n) => n.code === 'FAM-ASSIGNED' && n.to === 'u_is2').length && p7?.notifications.filter((n) => n.code === 'FAM-MOVED' && n.to === 'u_is1').length
await pp.evaluate(() => window.__qa.reload())
await go(pp, P, '/investor-family', 1500)
const anubhavSees = await pp.locator('text=FAM-00021').count() // the list shows the Family ID, not the investor primary's name
check(results, 'TS-07', !!p7 && !!n7 && anubhavSees === 0, `Prospect DMS family owner now ${p7?.clients.find((c) => c.id === 'CRM-LEAD-2026-00021').assignedTo}; both advisors notified: ${!!n7}; Anubhav still sees it: ${anubhavSees}`)

// ---------------- TS-08 investor moves to Unassigned -> family stays with its advisor (no Unassigned Family, 13 Nov 2026) ----------------
const daily = await call(iA, 'jobs', 'runDailyJobs')
await call(pA, 'familyLog', 'pullFamilyLog')
const p8 = await waitFor(async () => { const s = await pState(); const c = s.clients.find((x) => x.familyId === 'FAM-00901'); return c.investorUnassigned ? s : null })
const f8 = p8?.clients.find((c) => c.familyId === 'FAM-00901')
await pp.evaluate(() => window.__qa.reload())
await go(pp, P, '/record/CRM-LEAD-2026-00901', 1200)
const lost = await pp.locator('text=Invalid page or not permitted to access').count()
check(results, 'TS-08', daily.moved.includes('CID60901') && !!p8 && f8?.stage === 'Investor Family' && f8?.assignedTo === 'u_is1' && lost === 0, `moved: ${daily.moved.join(', ')}; family stage ${f8?.stage}, advisor ${f8?.assignedTo}; old advisor access: ${lost ? 'lost' : 'still there'}`)
await shot(pA, 'TS08_unassigned_family')

// ---------------- TS-09 assigned from Unassigned -> family returns ----------------
await call(iA, 'lifecycle', 'assignUnassigned', ['CID60901'], 'u_is2', 'INS500038')
await call(iA, 'familyLog', 'sendFamilyLog')
await call(pA, 'familyLog', 'pullFamilyLog')
const p9 = await waitFor(async () => { const s = await pState(); const c = s.clients.find((x) => x.familyId === 'FAM-00901'); return c.stage === 'Investor Family' && c.assignedTo === 'u_is2' ? s : null })
check(results, 'TS-09', !!p9, `family FAM-00901 back in Investor Family under ${p9?.clients.find((x) => x.familyId === 'FAM-00901').assignedTo}`)

// ---------------- TS-10 IS Mapping of a Data Code ----------------
await call(iA, 'lifecycle', 'executeTransfer', 'u_is2', { codes: { INS500038: 'u_is3' } })
await call(iA, 'familyLog', 'sendFamilyLog')
await call(pA, 'familyLog', 'pullFamilyLog')
const p10 = await waitFor(async () => { const s = await pState(); return ['FAM-00901', 'FAM-00902'].every((f) => s.clients.find((c) => c.familyId === f).assignedTo === 'u_is3') ? s : null })
check(results, 'TS-10', !!p10, `families FAM-00901, FAM-00902 now with ${p10 ? 'u_is3 (Mark Taylor)' : '?'}`)

// ---------------- TS-11 F2 switched off ----------------
await admin('PUT', '/switches', { flow: 'F2', on: false })
await call(iA, 'bridge', 'refreshSwitches'); await call(pA, 'bridge', 'refreshSwitches')
await call(iA, 'lifecycle', 'adminAssign', ['CID60902'], 'u_is5')
await call(iA, 'familyLog', 'sendFamilyLog')
await call(pA, 'familyLog', 'pullFamilyLog')
await sleep(1500)
const p11 = await pState()
const unchanged = p11.clients.find((c) => c.familyId === 'FAM-00902').assignedTo === 'u_is3'
await go(pA, P, '/settings/profile', 1500)
const fallbackShown = await pA.locator('[data-page=family-advisor]').count()
const manual = await call(pA, 'familyLog', 'manualFamilyAdvisor', 'FAM-00902', 'MHF500051', 'QA: F2 is off')
const p11b = await pState()
await admin('PUT', '/switches', { flow: 'F2', on: true })
await call(iA, 'bridge', 'refreshSwitches'); await call(pA, 'bridge', 'refreshSwitches')
await go(pA, P, '/settings/profile', 1200)
const fallbackHidden = (await pA.locator('[data-page=family-advisor]').count()) === 0
check(results, 'TS-11', unchanged && fallbackShown === 1 && p11b.clients.find((c) => c.familyId === 'FAM-00902').assignedTo === 'u_is5' && fallbackHidden, `while off: family unchanged ${unchanged}, manual page shown ${fallbackShown}, manual change -> ${manual?.action}; page hidden again when on: ${fallbackHidden}`)
await call(iA, 'familyLog', 'sendFamilyLog') // the queued change goes out once F2 is back on
await call(pA, 'familyLog', 'pullFamilyLog')

// ---------------- TS-12 import ----------------
await pA.evaluate(() => window.__qa.reload())
await go(pA, P, '/settings/import', 1500)
await pA.getByRole('button', { name: 'Import New File' }).click(); await pA.waitForTimeout(500)
const csv = path.join(SHOTS, 'split_demo_import.csv')
fs.writeFileSync(csv, ['First Name,Middle Name,Last Name,Mobile,Email,City,State,PAN', 'Priya,,Kumar,9876501003,,Lucknow,Uttar Pradesh,', 'Lakshmi,,Iyer,9876506001,,Chennai,Tamil Nadu,', 'Kiran,,Desai,9811122233,,Surat,Gujarat,', 'Neha,,Kapoor,9811100001,,Pune,Maharashtra,', 'Rahul,,Shetty,9811100002,,Mangaluru,Karnataka,', 'Rahul,,Shetty,9811100002,,Mangaluru,Karnataka,', ',,Unknown,12345,,Delhi,Delhi,'].join('\n') + '\n')
await pA.locator('[data-testid=import-file]').setInputFiles(csv); await pA.waitForTimeout(600)
await pA.getByRole('button', { name: 'Continue' }).click(); await pA.waitForTimeout(400)
await pA.getByText('New source', { exact: true }).click()
await pA.getByPlaceholder('e.g. Campaign Q4').fill('QA split import')
await pA.getByRole('button', { name: 'Import', exact: true }).click()
const imp = await waitFor(async () => { const s = await pState(); const e = s.imports.find((x) => x.file === 'split_demo_import.csv'); return e?.status === 'Completed' ? e : null }, 20000)
await go(pA, P, '/settings/import', 1200); await shot(pA, 'TS12_import_history')
check(results, 'TS-12', imp && imp.existing === 3 && imp.imported + imp.duplicates + imp.invalid + imp.existing === imp.total, `imported ${imp?.imported}, duplicates ${imp?.duplicates}, invalid ${imp?.invalid}, existing client or family ${imp?.existing}, total ${imp?.total}`)

// ---------------- TS-13 manual Prospect with a family number ----------------
const e13 = await callErr(pp, 'numberCheck', 'assertCreatable', [{ contacts: [{ mobile: '9876501003' }], pan: '' }])
const e13b = await callErr(pp, 'numberCheck', 'assertCreatable', [{ contacts: [{ mobile: '9811122233' }], pan: '' }])
check(results, 'TS-13', /existing client family/.test(e13 || '') && /existing client family/.test(e13b || ''), `family number: ${e13}; platform number: ${e13b}`)

// ---------------- TS-14 Pool batch ----------------
const s14 = await pState()
const vinod = s14.clients.find((c) => c.id === 'CRM-LEAD-2026-00025')
const famNums = new Set(s14.clients.filter((c) => ['Investor Family', 'Unassigned Family'].includes(c.stage)).flatMap((c) => c.members.flatMap((m) => (m.contacts || []).map((x) => x.mobile))))
const batches = s14.clients.filter((c) => c.stage === 'Pool' && c.batchOf)
check(results, 'TS-14', !!vinod.poolHold && !vinod.batchOf && !batches.some((c) => c.members.some((m) => (m.contacts || []).some((x) => famNums.has(x.mobile)))), `Vinod Shah (holds Meera Shah's number): ${vinod.poolHold ? 'held, out of the Pool' : 'NOT held'}; ${batches.length} records in batches, none with a family number`)

// ---------------- TS-15 bridge down at Confirm (also DECISION-21 self-registration) ----------------
await api(TPS, 'POST', '/console/register', { name: 'Arjun Reddy', pan: 'ARJPR5555R', mobile: '9876504001', platformFamilyId: 'PF-30040', advisorMhfId: null, selfRegistered: true })
await call(pp, 'jobs', 'pullRegistrations')
const sr = await waitFor(async () => (await pState()).clients.find((c) => c.id === 'CRM-LEAD-2026-00024').selfRegistration, 15000)
service('stop', 'bridge')
await pp.evaluate(() => window.__qa.reload())
await go(pp, P, '/record/CRM-LEAD-2026-00024?selfreg=p', 2500)
const pre = await pp.locator('[data-testid=row-state]').allInnerTexts()
await confirmWizard(pp)
await call(pp, 'handover', 'processOutbox')
const pend = (await pState()).handovers.find((h) => h.clientId === 'CRM-LEAD-2026-00024')
// a one-person family is now "Fully converted": it stays in Prospect DMS, read-only (product owner, 13 Nov 2026)
await go(pA, P, '/record/CRM-LEAD-2026-00024', 800); await pA.evaluate(() => window.__qa.reload()); await pA.waitForTimeout(1200)
const chip15 = await pA.locator('[data-testid=handover-pending]').count()
await shot(pA, 'TS15_pending')
service('start', 'bridge'); await sleep(1500)
await call(pp, 'handover', 'processOutbox'); await call(pp, 'handover', 'processOutbox') // duplicate send attempts
await call(iA, 'inbox', 'processInbox')
await call(pp, 'handover', 'processOutbox')
const d15 = await waitFor(async () => { const s = await pState(); const h = s.handovers.find((x) => x.clientId === 'CRM-LEAD-2026-00024'); return h?.status === 'Delivered' ? h : null })
const arjunCount = (await iState()).clients.filter((c) => c.members.some((m) => m.pan === 'ARJPR5555R')).length
check(results, 'TS-15', !!sr && pre.includes('Verified ✓') && pend?.status === 'Pending' && /not reachable/.test(pend?.lastError || '') && chip15 === 1 && !!d15 && arjunCount === 1, `chip while down: ${chip15}; self-registration flagged: ${!!sr} (wizard opened verified: ${pre.join(', ')}); while down: ${pend?.status} – ${pend?.lastError}; after restart: ${d15?.status}; Arjun in Investor DMS ${arjunCount} time(s)`)

// ---------------- TS-16 duplicate PAN ----------------
await wizard(pp, 'CRM-LEAD-2026-00026', { pick: true })
await confirmWizard(pp)
await call(iA, 'inbox', 'processInbox')
await call(pp, 'handover', 'processOutbox')
const f16 = await waitFor(async () => { const h = (await pState()).handovers.find((x) => x.clientId === 'CRM-LEAD-2026-00026'); return h?.status === 'Failed' ? h : null })
const exc16 = (await iState()).exceptions.find((e) => e.type === 'Duplicate investor')
await pA.reload(); await pA.waitForTimeout(1500)
await call(pA, 'handover', 'retryHandover', f16?.id)
await call(iA, 'inbox', 'processInbox'); await call(pA, 'handover', 'processOutbox')
const r16 = await waitFor(async () => { const s = await iState(); return s.inbox.filter((x) => x.handoverId === f16?.id).length === 2 ? s : null })
await call(pA, 'handover', 'processOutbox')
await waitFor(async () => (await pState()).handovers.find((x) => x.id === f16?.id)?.status === 'Failed')
await pA.reload(); await pA.waitForTimeout(1500)
await call(pA, 'handover', 'revertHandover', f16?.id)
const v16 = (await pState()).clients.find((c) => c.id === 'CRM-LEAD-2026-00026')
check(results, 'TS-16', f16?.reasonCode === 'DUPLICATE_INVESTOR' && !!exc16 && !!r16 && v16.stage === 'Prospect' && !v16.members.some((m) => m.investor), `rejected: ${f16?.reasonCode}; Admin exception: ${exc16?.type}; retry delivered again (attempt 2): ${!!r16}; after revert: ${v16.stage}`)

// ---------------- TS-18 busy blocks ----------------
const t0 = new Date(); t0.setDate(t0.getDate() + 2); t0.setHours(11, 0, 0, 0)
await iA.reload(); await iA.waitForTimeout(1500)
const iIS = await openAs(browser, I, 'MHF500007', problems, 'I-Anubhav')
await call(iIS, 'work', 'createEvent', { type: 'In-Person Meeting', title: 'QA secret portfolio review', allDay: false, start: t0.getTime(), end: t0.getTime() + 3600000, clientId: 'CID60902', clientNames: ['Lakshmi Iyer'], attendees: ['u_is1'] })
await call(iIS, 'busy', 'publishBusy', true)
const blocks = await call(pp, 'busy', 'loadOtherBusy', 'u_is1')
await go(pp, P, '/calendar', 1500)
const cursorWeek = await pp.locator('text=Busy (other DMS)').count()
await shot(pp, 'TS18_calendar')
const overlap = await pp.evaluate((t) => window.__qa.s['./services/busy.js'].overlapsBusy(t, t + 1800000), t0.getTime())
check(results, 'TS-18', blocks.some((b) => b.start === t0.getTime()) && blocks.every((b) => Object.keys(b).sort().join() === 'allDay,end,start,userMhfId') && overlap && cursorWeek > 0 && !(await pp.locator('text=QA secret').count()),
  `${blocks.length} block(s) for Anubhav, fields: ${Object.keys(blocks[0] || {}).join(', ')}; overlap warning: ${overlap}; shown on calendar: ${cursorWeek}`)

// ---------------- TS-21 dashboards match the lists and the audit log ----------------
async function listTotal(page, base, route) { await go(page, base, route, 1500); const t = await page.locator('footer').last().innerText(); const m = t.match(/of\s+([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : (await page.locator('tbody tr').count()) }
async function dashValue(page, id) { const t = await page.locator(`[data-testid=${id}] [data-value]`).innerText(); return Number(t.replace(/[^\d]/g, '')) }
await pA.evaluate(() => window.__qa.reload()); await iA.evaluate(() => window.__qa.reload())
await go(pA, P, '/dashboard', 2000)
const d21 = { prospects: await dashValue(pA, 'dash-prospects'), leads: await dashValue(pA, 'dash-leads'), fam: await dashValue(pA, 'dash-investor-family'), delivered: await dashValue(pA, 'dash-h-delivered'), people: await dashValue(pA, 'dash-conv-people') }
await shot(pA, 'TS21_P_dashboard')
const l21 = { prospects: await listTotal(pA, P, '/prospects'), leads: await listTotal(pA, P, '/leads'), fam: await listTotal(pA, P, '/investor-family') }
await go(iA, I, '/dashboard', 2000)
const di = { investors: await dashValue(iA, 'dash-investors'), unassigned: await dashValue(iA, 'dash-unassigned'), accepted: await dashValue(iA, 'dash-rec-accepted'), rejected: await dashValue(iA, 'dash-rec-rejected') }
await shot(iA, 'TS21_I_dashboard')
const li = { investors: await listTotal(iA, I, '/investors'), unassigned: await listTotal(iA, I, '/unassigned') }
const a21 = (await admin('GET', '/audit')).data.items
const ps21 = await pState()
const deliveredPeople = ps21.handovers.filter((h) => h.status !== 'Reverted').reduce((s, h) => s + h.memberCount, 0)
const auditAcks = a21.filter((e) => e.flow === 'F1_ACK' && e.route === 'POST /handover/:id/ack' && e.caller === 'Investor DMS' && /^(Accepted|Rejected)/.test(e.result) && e.actor !== 'QA script')
const ok21 = d21.prospects === l21.prospects && d21.leads === l21.leads && d21.fam === l21.fam && d21.people === deliveredPeople && d21.delivered === ps21.handovers.filter((h) => h.status === 'Delivered').length
  && di.investors === li.investors && di.unassigned === li.unassigned && di.accepted + di.rejected === auditAcks.length
check(results, 'TS-21', ok21, `Prospect DMS dashboard ${JSON.stringify(d21)} vs lists ${JSON.stringify(l21)} (people handed over in outbox ${deliveredPeople}); Investor DMS dashboard ${JSON.stringify(di)} vs lists ${JSON.stringify(li)}, acks in audit log ${auditAcks.length}`)

// ---------------- TS-22 two admins on one website ----------------
const pA2 = await openAs(browser, P, 'MHF500001', problems, 'P-Admin-2')
await go(pA2, P, '/notes', 1200); await go(pA, P, '/notes', 1200)
await pA.evaluate(() => window.__qa.reload()); await pA2.evaluate(() => window.__qa.reload())
await pA.evaluate(() => { window.__qa.db.notes.push({ id: 'NT-QA-A', clientId: null, title: 'Admin A', content: 'A', createdBy: 'u_admin', createdAt: Date.now(), updatedAt: Date.now(), pins: { home: [], client: [] } }) })
await pA.evaluate(() => window.__qa.flush())
await pA2.evaluate(() => { window.__qa.db.notes.push({ id: 'NT-QA-B', clientId: null, title: 'Admin B', content: 'B', createdBy: 'u_admin', createdAt: Date.now(), updatedAt: Date.now(), pins: { home: [], client: [] } }) })
await pA2.evaluate(() => window.__qa.flush())
await pA2.waitForTimeout(800)
const toast22 = await pA2.locator('text=Data changed by another user').count()
const s22 = await pState()
check(results, 'TS-22', toast22 > 0 && s22.notes.some((n) => n.id === 'NT-QA-A') && !s22.notes.some((n) => n.id === 'NT-QA-B'), `second save got the reload message: ${toast22 > 0}; first change kept, second not silently written: ${s22.notes.some((n) => n.id === 'NT-QA-A')}/${!s22.notes.some((n) => n.id === 'NT-QA-B')}`)

// ---------------- TS-23 audit log ----------------
const a23 = (await admin('GET', '/audit')).data
const flows = new Set(a23.items.map((e) => e.flow))
const put = await api(BR, 'PUT', '/audit', { items: [] }, { 'x-api-key': env.P_API_KEY, 'x-actor-role': 'Admin' })
const del = await api(BR, 'DELETE', '/audit', null, { 'x-api-key': env.I_API_KEY, 'x-actor-role': 'Admin' })
check(results, 'TS-23', ['F1', 'F1_ACK', 'F2', 'F3', 'F4'].every((f) => flows.has(f)) && a23.items.filter((e) => e.flow !== '-').every((e) => e.result) && a23.items.filter((e) => /^F/.test(e.flow) && !/blocked|duplicate|switch/.test(e.result)).every((e) => e.hash) && a23.chain.ok && put.status === 403 && del.status === 403,
  `${a23.items.length} entries, flows ${[...flows].join(' ')}; chain intact ${a23.chain.ok}; PUT/DELETE on the log: ${put.status}/${del.status}`)

await browser.close()
const report = { at: new Date().toISOString(), suite: 'split', results, problems }
fs.writeFileSync(path.join(QA_DIR, 'results-split.json'), JSON.stringify(report, null, 2))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`)
console.log(problems.length ? 'Console problems:\n' + problems.join('\n') : 'No console errors')
process.exitCode = results.every((r) => r.ok) ? 0 : 1
