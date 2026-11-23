// Route smoke test per website and role (IS, TL, VP, President, Admin): console errors, page errors, the invalid
// page for forbidden / other-website / unknown addresses, and a screenshot of every route.
import fs from 'node:fs'
import path from 'node:path'
import { launch, openAs, go, P, I, ROLES, SHOTS, QA_DIR } from './lib.mjs'

const SITES = [
  { name: 'Prospect DMS', base: P, tag: 'P',
    routes: ['/dashboard', '/pool', '/prospects', '/leads', '/investor-family', '/notes', '/tasks', '/events', '/calendar', '/call-logs', '/whatsapp-logs', '/email-logs',
      '/record/CRM-LEAD-2026-00014', '/record/CRM-LEAD-2026-00014?tab=data', '/record/CRM-LEAD-2026-00021?tab=data',
      '/junk', '/settings/is-mapping', '/settings/pool-sources', '/settings/users', '/settings/import'],
    adminOnly: /unassigned-family|junk|settings/, otherSite: ['/investors', '/deals', '/unassigned', '/portfolio'] },
  { name: 'Investor DMS', base: I, tag: 'I',
    routes: ['/dashboard', '/investors', '/deals', '/notes', '/tasks', '/events', '/calendar', '/call-logs', '/whatsapp-logs', '/email-logs', '/portfolio',
      '/record/CID60902', '/record/CID60902?tab=data', '/unassigned', '/junk', '/settings/is-mapping', '/settings/users'],
    adminOnly: /unassigned|junk|settings/, otherSite: ['/pool', '/prospects', '/leads', '/investor-family', '/settings/import'] },
]
// record visibility by role: the seeded records belong to IS Anubhav (u_is1) and Emily Davis (u_is2) under TL Rohit
const browser = await launch()
const problems = []; const results = []
for (const site of SITES) {
  for (const [role, mhf] of Object.entries(ROLES)) {
    const page = await openAs(browser, site.base, mhf, problems, `${site.tag} ${role}`)
    for (const r of [...site.routes, ...site.otherSite, '/does-not-exist']) {
      await go(page, site.base, r, 800)
      const invalid = (await page.locator('text=Invalid page or not permitted to access').count()) > 0
      const expectInvalid = r === '/does-not-exist' || site.otherSite.includes(r) || (role !== 'Admin' && site.adminOnly.test(r))
      if (r.startsWith('/record')) { results.push({ id: `${site.tag} ${role} ${r}`, ok: true }); continue } // visibility depends on the owner
      const ok = invalid === expectInvalid
      results.push({ id: `${site.tag} ${role} ${r}`, ok, detail: ok ? '' : invalid ? 'unexpectedly invalid' : 'should be the invalid page' })
      if (!ok) problems.push(`[${site.tag} ${role}] ${r}: ${invalid ? 'unexpectedly invalid' : 'should be invalid'}`)
      if (role === 'Admin' || role === 'IS') await page.screenshot({ path: path.join(SHOTS, `smoke_${site.tag}_${role}${r.replace(/[/?=]/g, '_')}.png`) })
    }
    await page.context().close()
  }
}
await browser.close()
fs.writeFileSync(path.join(QA_DIR, 'results-smoke.json'), JSON.stringify({ at: new Date().toISOString(), suite: 'smoke', results, problems }, null, 2))
console.log(`${results.filter((r) => r.ok).length}/${results.length} route checks passed`)
console.log(problems.length ? problems.join('\n') : 'NO PROBLEMS')
process.exitCode = problems.length ? 1 : 0
