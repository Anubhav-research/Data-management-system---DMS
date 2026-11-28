// Dashboard QA (docs/DASHBOARD_TESTS.md): DB-01 .. DB-14 on both websites.
// Read-only: it never changes the demo data (no reset). Needs `npm run dev:all` running.
//   node qa/dashboard.mjs            all tests
//   node qa/dashboard.mjs quick      skips DB-04 (clicking every number takes several minutes)
// DB-12 (a new handover carrying its source) needs a throwaway copy of the data: qa/dashboard-handover.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { launch, openAs, go, P, I, ROLES, SHOTS, QA_DIR, check } from './lib.mjs'
import * as R from '../packages/core-ui/src/dash/rules.js'

const quick = process.argv.includes('quick')
/** Prospect DMS shows a spinning line while Investor DMS's numbers (flow F5) are on their way: wait for them
 *  (a lasting "switched off" / "not reachable" line has no spinner and is not waited for). */
const ready = (page) => page.locator('[data-testid=dash-notice] [data-spin]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
/** Counts as shown on screen ("3,194"): at the end of a drill-menu line, and in the list's "· 3,194 records" chip. */
const countAtEnd = (t) => Number((String(t).match(/([\d,]+)\s*$/)?.[1] || '0').replace(/,/g, ''))
const chipCount = (t) => Number((String(t).match(/·\s*([\d,]+)\s*record/)?.[1] || 'NaN').replace(/,/g, ''))
const results = []; const problems = []
const DAY = 86400000

// ---------------------------------------------------------------- rules (pure functions, no browser)
// DB-07 connect rate colour: green at 75%, neutral at 74%
check(results, 'DB-07 75% is green, 74% neutral', R.connectTone(75) === 'green' && R.connectTone(74) === null && R.connectTone(74.9) === null && R.connectTone(null) === null)
// DB-08 approval age at the CURRENT level: 1 day normal, 2.5 days amber, 4 days red; the level below acting sets the clock
const at = (days) => Date.now() - days * DAY
const req = (days, chain = null) => ({ requestedOn: at(10), status: 'Pending', chain: chain || [{ userId: 'tl', state: 'Approved', at: at(days) }, { userId: 'vp', state: 'Pending' }] })
check(results, 'DB-08 1 day normal, 2.5 days amber, 4 days red', R.approvalTone(req(1)) === null && R.approvalTone(req(2.5)) === 'amber' && R.approvalTone(req(4)) === 'red')
check(results, 'DB-08 first level counts from the request', R.approvalTone({ requestedOn: at(3.5), status: 'Pending', chain: [{ userId: 'tl', state: 'Pending' }] }) === 'red')
check(results, 'DB-08 age is time at the current level, not since the request', R.approvalTone(req(1)) === null) // requested 10 days ago, with the VP for 1 day
// DB-11 a connected call of 0 seconds is not connected
check(results, 'DB-11 0-second connected call not counted', !R.isConnected({ status: 'Connected', duration: 0 }) && R.isConnected({ status: 'Connected', duration: 1 }) && !R.isConnected({ status: 'Not Connected', duration: 30 }))
check(results, 'DB-11 talk time counts connected calls only', R.talkTime([{ status: 'Connected', duration: 60 }, { status: 'Connected', duration: 0 }, { status: 'Not Connected', duration: 20 }]) === 60)
// DB-10 comparison = previous period of the same length
{ const p = R.periodOf({ range: 'Last 30 days' }); const q = R.previousOf(p); check(results, 'DB-10 previous period has the same length', q.to === p.from && q.to - q.from === p.to - p.from && q.caption === 'vs previous 30 days') }
check(results, 'DB-10 default period is This month', R.DEFAULT_RANGE === 'This month')

// ---------------------------------------------------------------- in the browser
const browser = await launch()
// each website's layout: the sections per role, the people table, the live section, where the call figures are
const SITES = [
  { tag: 'P', base: P, api: 'http://localhost:4101', want: { IS: 'overview,pipeline,clients,calling,messaging', TL: 'overview,pipeline,clients,calling,messaging,team', Admin: 'overview,pipeline,clients,calling,messaging,team,sources' },
    table: 'people', live: 'card-actions', callsTotal: '[data-testid=dash-kpi-calls] [data-value]', connected: '[data-testid=dash-kpi-open-rate]' },
  { tag: 'I', base: I, api: 'http://localhost:4102', want: { IS: 'overview,deals,book,calling', TL: 'overview,deals,book,calling,team', Admin: 'overview,deals,book,calling,team,ops' },
    table: 'people', live: 'card-actions', callsTotal: '[data-testid=dash-kpi-calls] [data-value]', connected: '[data-testid=dash-kpi-open-calls]' },
]
// a picker row's name (Prospect DMS rows start with initials or a team letter, and end with the employee ID)
const rowName = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean).find((x) => !/^[A-Z]{1,2}$/.test(x) && !/^MHF\d+$/.test(x) && !/^\d+ IS$/.test(x)) || ''
const sections = (page) => page.locator('[data-testid^=dash-section-]').evaluateAll((l) => l.map((e) => e.dataset.testid.replace('dash-section-', '')).join(','))

for (const site of SITES) {
  // DB-01 .. DB-03: what each role sees
  for (const [role, mhf] of Object.entries(ROLES)) {
    const page = await openAs(browser, site.base, mhf, problems, `${site.tag} ${role}`)
    await go(page, site.base, '/dashboard', 2500); await page.keyboard.press('Escape')
    await ready(page)
    const got = await sections(page); const picker = (await page.locator('[data-testid=dash-scope]').count()) > 0
    const tlCards = await page.locator('[data-testid^=dash-card-] >> text=TL+').count()
    if (role === 'IS') check(results, `DB-01 ${site.tag} IS: own only, no picker, no TL+ / Admin / Sources`, got === site.want.IS && !picker && tlCards === 0, `sections ${got}, picker ${picker}, TL+ cards ${tlCards}`)
    else if (role === 'Admin') check(results, `DB-03 ${site.tag} Admin: all sections incl. Sources and Admin operations`, got === site.want.Admin && picker, `sections ${got}`)
    else {
      // the picker lists only the people below them
      await page.click('[data-testid=dash-scope]'); await page.waitForTimeout(300)
      // Prospect DMS: people and named teams are tick rows; Investor DMS: one-choice rows ("<leader>'s team")
      const names = await page.locator('[data-testid=dash-scope-option], [data-testid=dash-scope-user]').allInnerTexts()
      const teamRows = (await page.locator('[data-testid=dash-scope-team]').allInnerTexts()).map(rowName)
      const below = await page.evaluate(() => { const s = JSON.parse(sessionStorage.length ? '{}' : '{}'); return s })
      const users = (await (await fetch(`${site.api}/api/state`, { headers: { 'x-api-key': site.tag === 'P' ? 'pdms-demo-key' : 'idms-demo-key' } })).json()).state.users
      const me = users.find((u) => u.mhf_id === mhf); const down = []; const walk = (id) => users.filter((u) => u.reportsTo === id).forEach((u) => { down.push(u.name); walk(u.id) })
      walk(me.id)
      const all = names.map(rowName).filter((n) => !['Me', 'My team (all)'].includes(n))
      // the teams below them are offered too ("<leader>'s team"): each must belong to a leader below them
      const teamOfUser = (u) => { for (let i = 0; u && i < 8; i++) { if (u.teamName) return u.teamName; u = users.find((x) => x.id === u.reportsTo) } return null }
      const downTeams = new Set(down.map((n) => teamOfUser(users.find((u) => u.name === n))).filter(Boolean))
      const teamsOk = all.filter((n) => n.endsWith("'s team")).every((n) => down.includes(n.replace("'s team", ''))) && teamRows.every((t) => downTeams.has(t))
      const people = all.filter((n) => !n.endsWith("'s team"))
      const okPicker = people.every((n) => down.includes(n)) && people.length === down.filter((n) => users.find((u) => u.name === n)?.active !== false && users.find((u) => u.name === n)?.role !== 'Admin').length
      check(results, `DB-02 ${site.tag} ${role}: own + team, picker = people below them, no Sources / Admin`, got === site.want.TL && picker && okPicker && teamsOk, `sections ${got}, picker people ${people.length} of ${down.length} below`)
      void below
      await page.keyboard.press('Escape')
    }
    await page.context().close()
  }

  const page = await openAs(browser, site.base, ROLES.TL, problems, `${site.tag} TL`)
  await go(page, site.base, '/dashboard', 2500); await page.keyboard.press('Escape')

  // DB-09 team table: A–Z, no rank column, numeric headers not sortable, totals row = sum of the rows
  {
    const names = await page.locator(`[data-testid=dash-card-${site.table}] [data-testid=dash-team-row] td:first-child button`).allInnerTexts()
    const heads = await page.locator(`[data-testid=dash-card-${site.table}] thead th`).allInnerTexts()
    const sortable = await page.locator(`[data-testid=dash-card-${site.table}] thead th button`).count()
    const calls = await page.locator(`[data-testid=dash-card-${site.table}] [data-testid=dash-team-row]`).evaluateAll((rows) => rows.map((r) => Number(r.children[1].innerText.replace(/[^\d]/g, '') || 0)))
    const total = Number((await page.locator(`[data-testid=dash-card-${site.table}] [data-testid=dash-team-total] td`).nth(1).innerText()).replace(/[^\d]/g, '') || 0)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    check(results, `DB-09 ${site.tag} team table A–Z, no rank, not sortable, totals right`, names.join('|') === sorted.join('|') && !heads.some((h) => /^#$|rank/i.test(h.trim())) && sortable === 0 && total === calls.reduce((t, x) => t + x, 0),
      `${names.length} rows, calls total ${total} vs ${calls.reduce((t, x) => t + x, 0)}`)
    const words = (await page.locator('[data-testid=dash-scroll]').innerText()).toLowerCase()
    check(results, `DB-09 ${site.tag} no ranking words`, !/\b(top performer|bottom performer|leaderboard|best performer|worst performer|rank)\b/.test(words))
  }

  // DB-10 change period: period cards follow, "My work today" stays, caption says the comparison
  {
    const a1 = await page.locator(`[data-testid=dash-${site.live}]`).innerText()
    await page.click('[data-testid="dash-range-Last 90 days"]'); await page.waitForTimeout(800)
    const a2 = await page.locator(`[data-testid=dash-${site.live}]`).innerText()
    const cap = await page.locator('[data-testid=dash-filters]').innerText()
    const t90 = await page.locator(site.callsTotal).innerText()
    await page.click('[data-testid="dash-range-Today"]'); await page.waitForTimeout(800)
    const tToday = await page.locator(site.callsTotal).innerText()
    const strip = (t) => t.replace(/\d+%/g, '') // approved/rejected in the period are the only period figures of A
    check(results, `DB-10 ${site.tag} period change: A unchanged, period cards change, caption`, strip(a1).split('Approved')[0] === strip(a2).split('Approved')[0] && /vs previous 90 days/.test(cap) && Number(t90.replace(/\D/g, '')) >= Number(tToday.replace(/\D/g, '')),
      `calls 90 days ${t90}, today ${tToday}`)
  }

  // DB-06 back from a list keeps the period and the person
  {
    await page.click('[data-testid="dash-range-Last 60 days"]'); await page.waitForTimeout(500)
    await page.click('[data-testid=dash-scope]'); await page.waitForTimeout(300)
    const person = page.locator('[data-testid=dash-scope-user]')
    const opt = (await person.count()) ? person.first() : page.locator('[data-testid=dash-scope-option]').nth(2); const who = rowName(await opt.innerText())
    await opt.click(); await page.waitForTimeout(800); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    const num = page.locator('[data-count]').first()
    if (await num.count()) {
      await num.click(); await page.waitForTimeout(600)
      if (await page.locator('[data-testid=dash-drill-menu] button').count()) { await page.locator('[data-testid=dash-drill-menu] button').first().click(); await page.waitForTimeout(600) }
      await page.locator('text=Back to Dashboard').first().click(); await page.waitForTimeout(1200)
      const sel = await page.locator('[data-testid="dash-range-Last 60 days"]').getAttribute('aria-selected')
      const label = await page.locator('[data-testid=dash-scope]').innerText()
      check(results, `DB-06 ${site.tag} back keeps period and person`, sel === 'true' && label.includes(who), `period selected ${sel}, person ${label.trim()} (wanted ${who})`)
    } else check(results, `DB-06 ${site.tag} back keeps period and person`, false, 'no clickable number')
    // put the filters back for the next run
    await page.click('[data-testid="dash-range-This month"]'); await page.click('[data-testid=dash-scope]'); await page.waitForTimeout(300); await page.locator('[data-testid=dash-scope-option]').first().click(); await page.waitForTimeout(500)
  }

  // DB-05 removing the chip shows the full list
  {
    const num = page.locator(site.connected)
    await num.click(); await page.waitForTimeout(800)
    // Prospect DMS adds Investor DMS's calls: the menu asks which website - this website's list
    const here = page.locator('[data-testid=drill-item]', { hasText: 'Prospect DMS' })
    if (await page.locator('[data-testid=dash-drill-menu]').count() && await here.count()) { await here.first().click(); await page.waitForTimeout(800) }
    const chip = await page.locator('[data-testid=silent-filter]').innerText().catch(() => '')
    const n1 = Number(chip.match(/·\s*(\d+)\s*record/)?.[1])
    await page.locator('[data-testid=silent-filter] button').click(); await page.waitForTimeout(800)
    const gone = (await page.locator('[data-testid=silent-filter]').count()) === 0
    const foot = await page.locator('body').innerText(); const rows = Number(foot.match(/\d+[–-]\d+ of (\d+)/)?.[1] || (await page.locator('tbody tr').count())) // lists show 20 a page
    check(results, `DB-05 ${site.tag} removing the chip shows the full list`, gone && rows >= n1, `filtered ${n1}, after removing ${rows} rows`)
  }

  // DB-13 each dashboard uses only its own website's data: no request for the other website's data
  {
    const urls = []; page.on('request', (r) => urls.push(new URL(r.url()).pathname))
    await go(page, site.base, '/dashboard', 2500)
    const other = site.tag === 'P' ? urls.filter((u) => /^\/tp\/(investments|profile)/.test(u)) : urls.filter((u) => /^\/tp\/registrations|^\/pool/.test(u))
    check(results, `DB-13 ${site.tag} dashboard requests only its own data`, other.length === 0, other.join(', '))
  }
  await page.context().close()

  // DB-14 light and dark, desktop and narrow: readable, no sideways overflow
  for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 390], ['dark', 390]]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } }); const pg = await ctx.newPage()
    await pg.addInitScript((t) => { try { localStorage.setItem('dms-theme', t) } catch {} }, theme)
    const { login } = await import('./lib.mjs'); await login(pg, site.base, ROLES.Admin)
    await pg.goto(site.base + '/dashboard'); await pg.waitForTimeout(2500); await pg.keyboard.press('Escape')
    const over = await pg.evaluate(() => { const el = document.querySelector('[data-testid=dash-scroll]'); return el ? el.scrollWidth - el.clientWidth : -1 })
    const dark = await pg.evaluate(() => document.documentElement.getAttribute('data-theme'))
    await pg.screenshot({ path: path.join(SHOTS, `dashboard_${site.tag}_${theme}_${width}.png`) })
    check(results, `DB-14 ${site.tag} ${theme} ${width}px: theme applied, no sideways overflow`, over <= 1 && dark === theme, `overflow ${over}px, theme ${dark}`)
    await ctx.close()
  }
}

// DB-04 click every number: the list it opens shows the same number of records
if (!quick) {
  for (const site of SITES) for (const role of ['IS', 'TL', 'Admin']) {
    const pg = await openAs(browser, site.base, ROLES[role], problems, `${site.tag} ${role}`)
    await go(pg, site.base, '/dashboard', 2500); await ready(pg); await pg.keyboard.press('Escape')
    const n = await pg.locator('[data-count]').count(); let clicked = 0; const bad = []
    for (let i = 0; i < n; i++) {
      const el = pg.locator('[data-count]').nth(i); const want = Number(await el.getAttribute('data-count')); if (!want) continue
      const where = await el.evaluate((e) => `${e.closest('[data-testid^=dash-card-]')?.dataset.testid.replace('dash-card-', '')} / ${(e.innerText || '').split('\n')[0].slice(0, 28)}`)
      // a number only Investor DMS has opens Investor DMS in a new tab (checked by the click-through test, not here)
      const popup = pg.context().waitForEvent('page', { timeout: 1500 }).catch(() => null)
      // a number that does not respond is a failure of this check, not the end of the whole run
      try { await el.scrollIntoViewIfNeeded({ timeout: 10000 }); await el.click({ timeout: 10000 }) } catch (e) {
        bad.push(`${where}: did not respond (${e.message.split('\n')[0].slice(0, 60)})`)
        await pg.reload(); await pg.waitForTimeout(2500); await ready(pg); await pg.keyboard.press('Escape'); continue
      }
      await pg.waitForTimeout(500); clicked++
      let got
      if (await pg.locator('[data-testid=dash-drill-menu]').count()) {
        got = (await pg.locator('[data-testid=drill-item]').allInnerTexts()).reduce((t, x) => t + countAtEnd(x), 0)
        const link = pg.locator('[data-testid=dash-drill-menu] button[data-testid=drill-item]').filter({ hasNotText: 'Investor DMS' }).first()
        if (await link.count()) {
          const first = countAtEnd(await link.innerText()); await link.click(); await pg.waitForTimeout(700)
          const shown = chipCount(await pg.locator('[data-testid=silent-filter]').innerText().catch(() => ''))
          if (first !== shown) bad.push(`${where}: menu ${first}, list ${shown}`)
        }
      } else if (await popup) {
        got = want; (await popup).close()
      } else {
        await pg.waitForTimeout(300)
        const chip = await pg.locator('[data-testid=silent-filter]').innerText().catch(() => '')
        got = chip ? chipCount(chip) : `no chip (${pg.url().replace(/.*#/, '').slice(0, 50)})`
      }
      if (got !== want) bad.push(`${where}: number ${want}, list ${got}`)
      await go(pg, site.base, '/dashboard', 800); await ready(pg); await pg.keyboard.press('Escape')
    }
    check(results, `DB-04 ${site.tag} ${role}: every number opens a list with the same count (${clicked} clicked)`, bad.length === 0, bad.slice(0, 6).join(' | '))
    await pg.context().close()
  }
}

await browser.close()
fs.writeFileSync(path.join(QA_DIR, 'results-dashboard.json'), JSON.stringify({ at: new Date().toISOString(), suite: 'dashboard', results, problems }, null, 2))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} dashboard checks passed`)
if (problems.length) console.log('Console / page errors:\n' + [...new Set(problems)].join('\n'))
process.exitCode = failed.length || problems.length ? 1 : 0
