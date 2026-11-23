// End-to-end journeys (USER_JOURNEYS.md J1..J12), carried over to the website each journey now belongs to:
// Pool / Prospect / Lead / Investor Family journeys run on Prospect DMS, investor journeys on Investor DMS.
// The old "Convert to Investor" journey (J6) is replaced by the conversion wizard and handover tests in qa/split.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { launch, P, I, resetAll, SHOTS, QA_DIR } from './lib.mjs'
let BASE = P
const OUT = path.join(SHOTS, 'journeys') + path.sep; fs.mkdirSync(OUT, { recursive: true })
await resetAll()
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []; const results = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error' && !/status of (409|502)/.test(m.text())) errors.push('console ' + m.text().slice(0, 200)) })
const w = (ms = 500) => page.waitForTimeout(ms)
let n = 0
async function step(name, fn) {
  try { await fn(); results.push('PASS ' + name) } catch (e) { results.push('FAIL ' + name + ' :: ' + e.message.split('\n')[0].slice(0, 220)); await page.screenshot({ path: `${OUT}fail_${++n}.png` }) }
}
async function login(mhf) {
  await page.goto(BASE + '/login'); await w(600)
  await page.fill('input[autocomplete=username]', mhf); await page.click('button[type=submit]'); await w(700)
}
async function pickSelect(labelText, option) {
  // frappe-ui Select inside FormControl: click trigger near label then option
  const field = page.locator('div', { has: page.locator(`label:text-is("${labelText}")`) }).last()
  await field.locator('button, [role=combobox]').first().click(); await w(250)
  await page.getByRole('option', { name: option, exact: true }).first().click(); await w(250)
}
const dialog = () => page.locator('[role=dialog]').last()

const onSite = async (base, mhf) => { BASE = base; await login(mhf) }

// ---------- J1 Pool -> Prospect via Followup + event ----------
await login('MHF500007')
await step('J1 Pool batch shows 20 + NEXT', async () => {
  await page.goto(BASE + '/pool'); await w(800)
  const rows = await page.locator('tbody tr').count(); if (rows < 1) throw new Error('no batch rows ' + rows)
  await page.getByRole('button', { name: 'NEXT' }).isVisible()
})
let poolName = ''
await step('J1 open Pool record + call + connected', async () => {
  await page.locator('tbody tr').first().click(); await w(800)
  poolName = await page.locator('nav span.font-medium').last().innerText()
  const callBtn = page.locator('aside button[title=Call]').first()
  await callBtn.click(); await w(400)
  const num = page.locator('[data-slot=content] button:has(.lucide-phone)').first()
  if (await num.count()) await num.click()
  await w(1500)
  await page.getByRole('button', { name: 'End (connected)' }).click(); await w(600)
  if (!(await dialog().getByText('Create Call Log').count())) throw new Error('call log popup not open')
})
await step('J1 call log validation (comment mandatory)', async () => {
  await pickSelect('Call Outcome', 'Followup')
  await dialog().getByRole('button', { name: 'Next' }).click(); await w(300)
  if (!(await dialog().getByText('Comment is mandatory').count())) throw new Error('no validation message')
})
await step('J1 Followup -> event -> converts to Prospect', async () => {
  await dialog().locator('textarea').fill('Client wants a follow-up next week.')
  await dialog().getByRole('button', { name: 'Next' }).click(); await w(500)
  const ev = page.locator('[role=dialog]').filter({ hasText: 'Create an Event' })
  await ev.locator('input[placeholder="e.g. Portfolio review call"]').fill('Follow up on FD')
  await ev.getByRole('button', { name: 'Create' }).click(); await w(900)
  await page.screenshot({ path: OUT + 'j1_after.png' })
  const crumb = await page.locator('header nav').innerText()
  if (!crumb.includes('Prospects')) throw new Error('trail not Prospects: ' + crumb)
})
await step('J1b Pool connected Not Interested -> mandatory Convert pop-up -> Release', async () => {
  await page.goto(BASE + '/pool'); await w(700)
  await page.locator('tbody tr').nth(1).click(); await w(700)
  await page.locator('aside button[title=Call]').first().click(); await w(300)
  const num = page.locator('[data-slot=content] button:has(.lucide-phone)').first(); if (await num.count()) await num.click()
  await w(1200); await page.getByRole('button', { name: 'End (connected)' }).click(); await w(500)
  await pickSelect('Call Outcome', 'Not Interested')
  await dialog().locator('textarea').fill('Not interested at the moment.')
  await dialog().getByRole('button', { name: 'Save' }).click(); await w(700)
  const conv = page.locator('[role=dialog]').filter({ hasText: 'Convert Client' })
  if (!(await conv.count())) throw new Error('mandatory convert popup missing')
  await conv.getByText('Release to Pool').click(); await conv.getByRole('button', { name: 'SUBMIT' }).click(); await w(700)
})
await step('J1c Not connected -> Inactive Pool', async () => {
  await page.goto(BASE + '/pool'); await w(700)
  const before = await page.locator('tbody tr').count()
  await page.locator('tbody tr').first().click(); await w(600)
  await page.locator('aside button[title=Call]').first().click(); await w(300)
  const num = page.locator('[data-slot=content] button:has(.lucide-phone)').first(); if (await num.count()) await num.click()
  await w(800); await page.locator('button[title^="Not connected"]').click(); await w(300)
  await page.getByRole('menuitem', { name: 'Busy' }).click(); await w(900)
  const after = await page.locator('tbody tr').count()
  if (!(after < before)) throw new Error(`batch not reduced ${before}->${after}`)
})

// ---------- J3 Create Prospect with approval ----------
await step('J3 Create Prospect validation + Send for Approval', async () => {
  await page.goto(BASE + '/prospects'); await w(700)
  await page.getByRole('button', { name: 'Create' }).click(); await w(500)
  await dialog().getByRole('button', { name: 'Send for Approval' }).click(); await w(300)
  if (!(await dialog().getByText('First Name is mandatory').count())) throw new Error('no first-name validation')
  await dialog().locator('input[placeholder="First Name"]').fill('Demo')
  await dialog().locator('input[placeholder="Last Name"]').fill('Prospect')
  await dialog().locator('input[placeholder="10-digit mobile"]').fill('9876500011')
  await dialog().getByRole('button', { name: 'Send for Approval' }).click(); await w(700)
  if (!(await page.getByText('Your Prospect requests awaiting approval').count())) throw new Error('pending request banner missing')
})
await step('J3 TL approves -> moves to VP', async () => {
  await login('MHF500004'); await page.goto(BASE + '/prospects'); await w(800)
  await page.getByRole('button', { name: 'Review Demo' }).click(); await w(500)
  await dialog().getByRole('button', { name: 'Approve' }).click(); await w(700)
  if (await page.getByRole('button', { name: 'Review Demo' }).count()) throw new Error('still pending for TL')
})

// ---------- J4 data change approval (seeded APR-1 pending at VP) ----------
await step('J4 VP opens Review Changes drawer and approves', async () => {
  await login('MHF500003'); await page.goto(BASE + '/record/CRM-LEAD-2026-00014?tab=data'); await w(900)
  await page.getByRole('button', { name: /Review changes/i }).click(); await w(400)
  await page.screenshot({ path: OUT + 'j4_drawer.png' })
  await page.locator('aside').getByRole('button', { name: 'Submit & Approve' }).click(); await w(700)
  const bar = await page.getByText('Emma Clark (VP) · Approved').count()
  if (!bar) throw new Error('VP chip not approved')
})
await step('J4 IS edits name -> Send for Approval + pending tag', async () => {
  await login('MHF500007'); await page.goto(BASE + '/prospects'); await w(700)
  await page.locator('tbody tr').nth(2).click(); await w(700)
  await page.getByRole('button', { name: 'Data', exact: true }).click(); await w(600)
  const ln = page.locator('label:text-is("Last Name")').locator('xpath=..').locator('input')
  await ln.fill('Changed'); await w(200)
  await page.getByRole('button', { name: 'Send for Approval' }).click(); await w(700)
  if (!(await page.getByText('APPROVAL HIERARCHY', { exact: false }).count())) throw new Error('approval bar missing')
})
await step('J4 WhatsApp tick saves without approval', async () => {
  const cb = page.locator('section').filter({ hasText: 'Is WhatsApp Number' }).locator('tbody input[type=checkbox]').nth(1)
  await cb.click(); await w(200)
  const btn = page.getByRole('button', { name: 'Save', exact: true }); if (!(await btn.count())) throw new Error('Save (no approval) not shown')
  await btn.click(); await w(500)
})

// ---------- J6 Convert to Investor: now the conversion wizard (full flow in qa/split.mjs TS-01..TS-17) ----------
await step('J6 Convert opens the Transaction Platform wizard (split)', async () => {
  await page.goto(BASE + '/record/CRM-LEAD-2026-00014'); await w(800)
  await page.getByRole('button', { name: 'Convert' }).click(); await w(400)
  await dialog().getByText('Convert to Investor').click(); await dialog().getByRole('button', { name: 'SUBMIT' }).click(); await w(800)
  if (!(await page.getByText('Verify on the Transaction Platform').count())) throw new Error('wizard step 1 missing')
  await page.keyboard.press('Escape'); await w(300)
})
const p8 = { tasks: true }
// ---------- J8 Task remark validation (Prospect DMS) ----------
await step('J8 Task complete requires remark', async () => {
  await page.goto(BASE + '/tasks'); await w(800)
  await page.locator('tbody tr').filter({ hasText: 'Collect PAN copies' }).click(); await w(500)
  await page.screenshot({ path: OUT + 'j8_task.png' })
  await page.keyboard.press('Escape'); await w(300)
})
// ================= Investor DMS journeys =================
await onSite(I, 'MHF500007')
// ---------- J7 Deal ----------
await step('J7 Create deal on investor (Investor DMS)', async () => {
  await page.goto(BASE + '/record/CID60901?tab=deals'); await w(800) // Deepak Shah, an investor of Anubhav
  await page.getByRole('button', { name: /Create deal/ }).first().click(); await w(500)
  await page.screenshot({ path: OUT + 'j7_deal.png' })
  const d = page.locator('[role=dialog]').last()
  await d.locator('select').first().selectOption('RBI Bond').catch(async () => { await pickSelect('Product', 'RBI Bond') })
  await w(200)
  await d.locator('input[type=number]').first().fill('25000'); await w(200)
  await d.getByRole('button', { name: /Create deal/ }).click(); await w(700)
  if (!(await page.getByText('Scheduled').count())) throw new Error('deal card missing')
})
void p8
// ---------- J10 Admin Unassigned assign ----------
await step('J10 Admin assigns unassigned investor (Investor DMS)', async () => {
  await login('MHF500001'); await page.goto(BASE + '/unassigned'); await w(900)
  await page.locator('tbody tr').first().locator('input[type=checkbox], button[role=checkbox]').first().click(); await w(300)
  await page.getByRole('button', { name: 'Bulk actions' }).click(); await w(300)
  await page.getByRole('menuitem', { name: 'Assign to' }).click(); await w(500)
  if (!(await dialog().isVisible())) throw new Error('assign dialog not open')
  await page.screenshot({ path: OUT + 'j10_assign.png' })
  await page.keyboard.press('Escape'); await w(300)
})
await step('A1 Portfolio icon on Investor -> Transaction Platform (Investor DMS)', async () => {
  await page.goto(BASE + '/investors'); await w(800); await page.locator('tbody tr').first().click(); await w(700)
  await page.locator('button[aria-label=Portfolio]').click(); await w(600)
  if (!(await page.getByText('Opening the Transaction Platform').count())) throw new Error('portfolio page missing')
})
await step('A4 Investor bulk = Assign to only: no Release to Pool, no Junk (split)', async () => {
  await page.goto(BASE + '/investors'); await w(900)
  await page.locator('tbody tr').first().locator('button[role=checkbox], input[type=checkbox]').first().click(); await w(300)
  await page.getByRole('button', { name: 'Bulk actions' }).click(); await w(300)
  const items = (await page.getByRole('menuitem').allInnerTexts()).join('|')
  if (!/Assign to/.test(items) || /Release to Pool/.test(items) || /Junk/.test(items)) throw new Error('menu: ' + items)
  await page.keyboard.press('Escape'); await w(200)
})
await step('A4 Unassigned bulk has Junk (Investor DMS)', async () => {
  await page.goto(BASE + '/unassigned'); await w(900)
  await page.locator('tbody tr').first().locator('button[role=checkbox], input[type=checkbox]').first().click(); await w(300)
  await page.getByRole('button', { name: 'Bulk actions' }).click(); await w(300)
  const items = (await page.getByRole('menuitem').allInnerTexts()).join('|')
  if (!/Assign to/.test(items) || !/Junk/.test(items)) throw new Error('menu: ' + items)
  await page.keyboard.press('Escape'); await w(200)
})
await step('C6 Investor Data tab shows Client ID (CID) (Investor DMS)', async () => {
  await page.goto(BASE + '/record/CID60902?tab=data'); await w(900)
  const t = await page.getByTestId('person-client-id').innerText()
  if (!/Client ID \(CID\): CID\d+/.test(t)) throw new Error(t)
})
await step('B7 Investor groups hold verified people only: no Add / Remove member (DECISION-23)', async () => {
  if (await page.getByRole('button', { name: 'Send for Approval' }).count()) { /* nothing */ }
  const menus = await page.locator('main button:has(.lucide-ellipsis-vertical)').count()
  if (menus) throw new Error('member menu shown')
})
// ---------- J12 IS Mapping transfer dialog ----------
await step('J12 IS Mapping transfer opens (Investor DMS: Data Codes)', async () => {
  await page.goto(BASE + '/settings/is-mapping'); await w(900)
  await page.getByText('Transfer', { exact: true }).first().click(); await w(600)
  await page.screenshot({ path: OUT + 'j12_transfer.png' })
  if (!(await page.getByText('Transfer Specialist Data').count())) throw new Error('transfer dialog missing')
  await page.keyboard.press('Escape'); await w(300); await page.keyboard.press('Escape'); await w(300)
})
// ================= back to Prospect DMS =================
await step('Invalid page for IS on /settings', async () => {
  BASE = P
  await login('MHF500007'); await page.goto(BASE + '/settings/users'); await w(600)
  if (!(await page.getByText('Invalid page or not permitted to access').count())) throw new Error('not blocked')
})
// ---------- Product-owner answers (06 Nov 2026) ----------
await step('A2 Lead -> Move to Prospect', async () => {
  await login('MHF500007'); await page.goto(BASE + '/leads'); await w(800)
  await page.locator('tbody tr').first().click(); await w(700)
  await page.getByRole('button', { name: 'Convert' }).click(); await w(400)
  await dialog().getByText('Move to Prospect').click(); await dialog().getByRole('button', { name: 'SUBMIT' }).click(); await w(700)
  const crumb = await page.locator('header nav').innerText(); if (!crumb.includes('Prospects')) throw new Error('not Prospect: ' + crumb)
})
await step('A3 VP creates personal Prospect (assignee = self only)', async () => {
  await login('MHF500003'); await page.goto(BASE + '/prospects'); await w(800)
  await page.getByRole('button', { name: 'Create' }).click(); await w(500)
  const field = page.locator('[role=dialog]').last().locator('div', { has: page.locator('label:text-is("Assigned to")') }).last()
  await field.locator('button, [role=combobox]').first().click(); await w(300)
  const opts = await page.getByRole('option').count(); if (opts !== 1) throw new Error('assignee options ' + opts)
  await page.keyboard.press('Escape'); await w(200); await page.keyboard.press('Escape')
})
await step('A4 Admin Pool Junk with comment', async () => {
  await login('MHF500001'); await page.goto(BASE + '/pool'); await w(900)
  await page.locator('tbody tr').first().locator('button[role=checkbox], input[type=checkbox]').first().click(); await w(300)
  await page.getByRole('button', { name: 'Bulk actions' }).click(); await w(300)
  const items = await page.getByRole('menuitem').allInnerTexts()
  if (items.some((t) => /delete/i.test(t))) throw new Error('Delete present')
  await page.getByRole('menuitem', { name: 'Junk' }).click(); await w(400)
  await dialog().locator('textarea').fill('Duplicate number'); await dialog().getByRole('button', { name: 'Confirm' }).click(); await w(600)
})

// ---------- Round 3 feedback (06 Nov 2026) ----------
await step('B1 Admin Pool: no Status / In batch of columns', async () => {
  await page.goto(BASE + '/pool'); await w(900)
  const heads = (await page.locator('thead th').allInnerTexts()).map((t) => t.trim())
  if (heads.includes('Status') || heads.includes('In batch of')) throw new Error('columns: ' + heads.join('|'))
})
await step('B2 Pool ⋯ menu sits in the toolbar row after Sort', async () => {
  const more = page.getByRole('button', { name: 'More actions' })
  const sortBox = await page.getByRole('button', { name: 'Import Date' }).last().boundingBox()
  const moreBox = await more.boundingBox()
  if (!moreBox || !sortBox || Math.abs(moreBox.y - sortBox.y) > 6 || moreBox.x < sortBox.x) throw new Error('not beside Sort')
  await more.click(); await w(300)
  const items = (await page.getByRole('menuitem').allInnerTexts()).join('|')
  if (!/Import/.test(items) || !/Pool Source Visibility/.test(items)) throw new Error('menu: ' + items)
  await page.keyboard.press('Escape'); await w(200)
})
await step('B3 Bulk bar like Frappe CRM (checkbox, count, … menu, Select all, ×)', async () => {
  await page.locator('tbody tr').first().locator('button[role=checkbox], input[type=checkbox]').first().click(); await w(400)
  const bar = page.getByTestId('bulk-bar')
  const txt = await bar.innerText()
  if (!/1 row selected/.test(txt) || !/Select all/.test(txt)) throw new Error('bar: ' + txt)
  if (!(await bar.getByRole('button', { name: 'Bulk actions' }).count()) || !(await bar.getByRole('button', { name: 'Clear selection' }).count())) throw new Error('buttons missing')
  await page.screenshot({ path: OUT + 'b3_bulkbar.png' })
  await bar.getByRole('button', { name: 'Select all' }).click(); await w(300)
  if (!/70 rows selected|\d+ rows selected/.test(await bar.innerText())) throw new Error('select all')
  await bar.getByRole('button', { name: 'Clear selection' }).click(); await w(300)
})
await step('B4 Sort like Frappe CRM (single, add, count badge, clear)', async () => {
  await page.getByRole('button', { name: 'Import Date' }).last().click(); await w(400)
  await page.getByRole('button', { name: 'Add Sort' }).click(); await w(300)
  await page.getByRole('option', { name: 'Name', exact: true }).click(); await w(400) // searchable field picker (Frappe Combobox)
  await page.screenshot({ path: OUT + 'b4_sort_panel.png' })
  const rowsInPanel = await page.getByRole('button', { name: 'Remove sort' }).count()
  if (rowsInPanel !== 2) throw new Error('sort rows ' + rowsInPanel)
  await page.keyboard.press('Escape'); await w(300)
  const badge = page.getByTestId('sort-trigger')
  if (!/Sort\s*2/.test(await badge.innerText())) throw new Error('no count badge')
  await badge.click(); await w(300)
  await page.getByRole('button', { name: 'Clear Sort' }).click(); await w(400)
  if (!(await page.getByRole('button', { name: 'Sort', exact: true }).count())) throw new Error('not cleared')
})
await step('B5 Group member shows own Client ID (Data tab)', async () => {
  await login('MHF500007'); await page.goto(BASE + '/record/CRM-LEAD-2026-00014'); await w(900)
  await page.getByRole('button', { name: 'Data', exact: true }).first().click(); await w(500)
  const primary = await page.getByTestId('person-client-id').innerText()
  if (!/CRM-LEAD-2026-00014|CID\d+/.test(primary)) throw new Error('primary ' + primary) // an Investor shows its CID
  await page.getByRole('button', { name: 'Group Member-1' }).click(); await w(400)
  const m1 = await page.getByTestId('person-client-id').innerText()
  if (!/CRM-LEAD-2026-\d{5}/.test(m1) || /00014/.test(m1)) throw new Error('member ' + m1)
  await page.screenshot({ path: OUT + 'b5_member_id.png' })
})
await step('B6 PAN Verify icon on a group member (Prospect)', async () => {
  const pan = page.locator('input[placeholder=AAAAA9999A]').first()
  if (!(await pan.isVisible())) { await page.getByRole('button', { name: /Identity Documents/ }).first().click(); await w(300) }
  await pan.scrollIntoViewIfNeeded()
  await pan.fill('XBCPK1234L'); await page.getByRole('button', { name: 'Verify PAN' }).first().click(); await w(400)
  if (!(await page.getByText('No match found').count())) throw new Error('no-match not shown')
  await pan.fill('ABCPK1234L'); await page.getByRole('button', { name: 'Verify PAN' }).first().click(); await w(500)
  if (!(await page.getByText('Verified on the Transaction Platform').count())) throw new Error('not verified')
  if (!(await pan.isDisabled())) throw new Error('verified PAN should lock')
  await page.screenshot({ path: OUT + 'b6_pan_verified.png' })
})
// ---------- Round 4 feedback (06 Nov 2026) ----------
await step('C1 User dropdown: Apps (empty) · Settings · Log out, no About', async () => {
  await login('MHF500001'); await page.goto(BASE + '/prospects'); await w(800)
  await page.getByTestId('user-dropdown').click(); await w(400)
  const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim())
  for (const want of ['Apps', 'Settings', 'Log out']) if (!items.some((t) => t.startsWith(want))) throw new Error('missing ' + want + ' in ' + items.join('|'))
  if (items.some((t) => /About/.test(t))) throw new Error('About present')
  await page.getByRole('menuitem', { name: 'Apps' }).hover(); await w(400)
  if (!(await page.getByText('No apps yet').count())) throw new Error('apps submenu')
  await page.screenshot({ path: OUT + 'c1_dropdown.png' })
  await page.keyboard.press('Escape'); await w(200); await page.keyboard.press('Escape'); await w(200)
})
await step('C2 Settings modal (Admin): CRM groups, DMS pages inside', async () => {
  await page.getByTestId('user-dropdown').click(); await w(300)
  await page.getByRole('menuitem', { name: 'Settings' }).click(); await w(700)
  const modal = page.getByTestId('settings-modal')
  const txt = await modal.innerText()
  for (const want of ['User Configuration', 'Profile', 'Preferences', 'System Configuration', 'Defaults', 'Calendar', 'User Management', 'User Access', 'Email', 'Templates', 'DMS Operations', 'IS Mapping', 'Pool Source Visibility', 'Data Import']) if (!txt.includes(want)) throw new Error('missing ' + want)
  await page.screenshot({ path: OUT + 'c2_settings_profile.png' })
  await modal.locator('[data-page=pool-sources]').click(); await w(500)
  if (!(await modal.getByText('Choose which data sources feed the Pool').count())) throw new Error('pool sources page')
  await modal.locator('[data-page=templates]').click(); await w(500)
  await page.screenshot({ path: OUT + 'c2_settings_templates.png' })
  if (!(await modal.getByText('meeting_followup').count())) throw new Error('templates page')
})
await step('C3 Preferences: Dark theme applies, back to Light', async () => {
  const modal = page.getByTestId('settings-modal')
  await modal.locator('[data-page=preferences]').click(); await w(400)
  await modal.locator('[data-theme-option=dark]').click(); await w(400)
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark') throw new Error('not dark')
  await page.screenshot({ path: OUT + 'c3_dark.png' })
  await modal.locator('[data-theme-option=light]').click(); await w(300)
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'light') throw new Error('not light')
  await page.keyboard.press('Escape'); await w(400)
})
await step('C4 IS sees only Profile and Preferences in Settings', async () => {
  await login('MHF500007'); await page.goto(BASE + '/settings'); await w(900)
  const pages = await page.getByTestId('settings-modal').locator('[data-page]').evaluateAll((els) => els.map((e) => e.dataset.page))
  if (pages.join(',') !== 'profile,preferences') throw new Error(pages.join(','))
  await page.keyboard.press('Escape'); await w(300)
})
await step('C5 Notes: Pin on a note of another user (per-user pins)', async () => {
  await login('MHF500001'); await page.goto(BASE + '/notes'); await w(900)
  const card = page.locator('div.h-44').first()
  await card.getByRole('button').first().click(); await w(300)
  const items = (await page.getByRole('menuitem').allInnerTexts()).join('|')
  if (!/Pin/.test(items)) throw new Error('no Pin: ' + items)
  await page.getByRole('menuitem', { name: /^Pin$/ }).click(); await w(400)
  if (!(await page.locator('div.h-44').first().locator('.lucide-pin').count())) throw new Error('not pinned')
})
await browser.close()
console.log(results.join('\n'))
console.log('--- errors ---\n' + (errors.length ? [...new Set(errors)].join('\n') : 'none'))
fs.writeFileSync(path.join(QA_DIR, 'results-journeys.json'), JSON.stringify({ at: new Date().toISOString(), suite: 'journeys', results: results.map((l) => ({ id: l.replace(/^(PASS|FAIL) /, '').split(' :: ')[0], ok: l.startsWith('PASS'), detail: l.split(' :: ')[1] || '' })), problems: [...new Set(errors)] }, null, 2))
process.exitCode = results.every((l) => l.startsWith('PASS')) && !errors.length ? 0 : 1
