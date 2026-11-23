// Responsive check on both websites at tablet and phone widths: no page-level horizontal scroll, screenshots.
import fs from 'node:fs'
import path from 'node:path'
import { launch, login, P, I, SHOTS, QA_DIR } from './lib.mjs'
const browser = await launch()
const errs = []; const results = []
const SITES = [[P, 'P', ['/prospects', '/investor-family', '/record/CRM-LEAD-2026-00014?tab=data', '/calendar', '/dashboard']], [I, 'I', ['/investors', '/record/CID60902?tab=data', '/calendar', '/dashboard']]]
for (const [base, tag, routes] of SITES) for (const [w, h] of [[1024, 768], [768, 1024], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`${tag} ${w}: ${e.message}`))
  await p.goto(base + '/login'); await p.waitForTimeout(800)
  await p.screenshot({ path: path.join(SHOTS, `resp_${tag}_${w}_login.png`) })
  await login(p, base, 'MHF500007')
  for (const r of routes) {
    await p.goto(base + r); await p.waitForTimeout(900)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    results.push({ id: `${tag} ${w}px ${r}`, ok: !overflow, detail: overflow ? 'page-level horizontal overflow' : '' })
    if (overflow) errs.push(`${tag} ${w} ${r}: page-level horizontal overflow`)
    await p.screenshot({ path: path.join(SHOTS, `resp_${tag}_${w}${r.replace(/[/?=]/g, '_')}.png`) })
  }
  await ctx.close()
}
await browser.close()
fs.writeFileSync(path.join(QA_DIR, 'results-responsive.json'), JSON.stringify({ at: new Date().toISOString(), suite: 'responsive', results, problems: errs }, null, 2))
console.log(errs.length ? errs.join('\n') : 'RESPONSIVE OK')
process.exitCode = errs.length ? 1 : 0
