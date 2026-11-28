// Dashboard design screenshots (PROMPT_DASHBOARD_REDESIGN.md §2.2 / §11): both websites × 4 roles × 4 widths, dark at
// 1440, plus the person picker, Compare with 3 people, the drill menu and the requests pop-up.
// Usage: node qa/design-shots.mjs before|after   → docs/design/<set>/
import fs from 'node:fs'
import path from 'node:path'
import { launch, P, I, ROLES, QA_DIR } from './lib.mjs'

const SET = process.argv[2] || 'before'
const OUT = path.join(QA_DIR, '..', 'docs', 'design', SET); fs.mkdirSync(OUT, { recursive: true })
const SITES = [['prospect', P], ['investor', I]]
const USERS = ['Admin', 'President', 'TL', 'IS']
const WIDTHS = [1440, 1280, 1024, 390]
const log = (...a) => console.log(...a)

/** The dashboard scrolls inside its own panel: let it grow so a full-page screenshot holds all of it. */
async function unlock(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid=dash-scroll]'); if (!el) return
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) { n.style.overflow = 'visible'; n.style.height = 'auto'; n.style.maxHeight = 'none'; n.style.minHeight = '0' }
    document.documentElement.style.height = 'auto'; document.body.style.height = 'auto'
  })
}
async function relock(page) { await page.reload(); await page.waitForTimeout(2500) }

async function openDash(browser, base, mhf, { width, dark }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript((d) => { try { localStorage.setItem('dms-theme', d ? 'dark' : 'light') } catch {} }, !!dark)
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000)
  await page.goto(base + '/login'); await page.waitForSelector('input[autocomplete=username]', { timeout: 60000 })
  await page.fill('input[autocomplete=username]', mhf); await page.click('button[type=submit]'); await page.waitForTimeout(1200)
  await page.goto(base + '/dashboard'); await page.waitForTimeout(3500)
  return page
}
const shot = async (page, name, full = true) => { if (full) await unlock(page); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); log('  ', name) }

const browser = await launch()
for (const [site, base] of SITES) {
  for (const who of USERS) {
    for (const width of WIDTHS) {
      const page = await openDash(browser, base, ROLES[who], { width })
      await page.screenshot({ path: path.join(OUT, `${site}-${who}-${width}-top.png`) }) // what fits without scrolling
      await shot(page, `${site}-${who}-${width}`)
      await page.context().close()
    }
    const dark = await openDash(browser, base, ROLES[who], { width: 1440, dark: true })
    await dark.screenshot({ path: path.join(OUT, `${site}-${who}-1440-dark-top.png`) })
    await shot(dark, `${site}-${who}-1440-dark`)
    await dark.context().close()
  }
  // states, as Admin at 1440 (viewport shots: pop-ups are fixed to the screen)
  const page = await openDash(browser, base, ROLES.Admin, { width: 1440 })
  try {
    await page.click('[data-testid=dash-scope]'); await page.waitForTimeout(600); await shot(page, `${site}-state-picker`, false)
    const people = page.locator('[data-testid=dash-scope-user]')
    for (let i = 0; i < 3 && i < await people.count(); i++) { await people.nth(i).click(); await page.waitForTimeout(400) }
    await page.keyboard.press('Escape'); await page.waitForTimeout(2500)
    await page.locator('[data-testid=dash-section-compare]').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(600)
    await shot(page, `${site}-state-compare3`, false)
    await shot(page, `${site}-state-compare3-full`)
  } catch (e) { log('  picker/compare failed:', e.message.split('\n')[0]) }
  await relock(page)
  try {
    // a number whose records sit in more than one list opens the drill menu
    const cands = page.locator('[data-testid^=dash-] button[data-count], button[data-testid^=dash-][data-count]')
    let opened = false
    for (let i = 0; i < Math.min(40, await cands.count()) && !opened; i++) {
      const url = page.url(); await cands.nth(i).click().catch(() => {}); await page.waitForTimeout(400)
      if (await page.locator('[data-testid=dash-drill-menu]').count()) opened = true
      else if (page.url() !== url) { await page.goBack(); await page.waitForTimeout(2000) }
    }
    if (opened) await shot(page, `${site}-state-drillmenu`, false); else log('  no drill menu found')
  } catch (e) { log('  drill menu failed:', e.message.split('\n')[0]) }
  await relock(page)
  try {
    await page.click('[data-testid=dash-requests-btn]'); await page.waitForTimeout(800); await shot(page, `${site}-state-requests`, false)
  } catch (e) { log('  requests failed:', e.message.split('\n')[0]) }
  await page.context().close()
}
await browser.close()
log('done:', OUT)
