// WCAG 2.2 contrast of the dashboard's text and chart colours, measured from computed styles in both themes
// (PROMPT_DASHBOARD_REDESIGN.md §7.3, DD-04). Prints a markdown table. Usage: node qa/design-contrast.mjs [prospect|investor]
import { launch, P, I, ROLES } from './lib.mjs'

const base = process.argv[2] === 'investor' ? I : P
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

const browser = await launch()
const out = []
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript((t) => { try { localStorage.setItem('dms-theme', t) } catch {} }, theme)
  const page = await ctx.newPage(); page.setDefaultTimeout(60000)
  await page.goto(base + '/login'); await page.waitForSelector('input[autocomplete=username]')
  await page.fill('input[autocomplete=username]', ROLES.Admin); await page.click('button[type=submit]'); await page.waitForTimeout(1200)
  await page.goto(base + '/dashboard'); await page.waitForSelector('[data-testid=dash-scroll]'); await page.waitForTimeout(1500)
  const rows = await page.evaluate(() => {
    const root = document.querySelector('[data-testid=dash-scroll]')
    // computed colours may come as oklch() / color(srgb …): paint one pixel and read it back
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const g = cv.getContext('2d', { willReadFrequently: true })
    const rgb = (s) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = s; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const probe = (cls, bgCls, prop = 'color') => {
      const bg = document.createElement('div'); bg.className = bgCls; const el = document.createElement('span'); el.className = cls; el.textContent = 'x'
      bg.appendChild(el); root.appendChild(bg)
      const fg = getComputedStyle(el)[prop]; const b = getComputedStyle(bg).backgroundColor; bg.remove(); return { fg: rgb(fg), bg: rgb(b) }
    }
    const v = (name) => { const s = getComputedStyle(root).getPropertyValue(name).trim(); const d = document.createElement('span'); d.style.color = s; root.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return rgb(c) }
    const surf = probe('text-ink-gray-9', 'bg-surface-base').bg; const page = probe('text-ink-gray-9', 'bg-dms-page').bg
    const text = ['text-ink-gray-9', 'text-ink-gray-8', 'text-ink-gray-7', 'text-ink-gray-6', 'text-ink-gray-5', 'text-ink-gray-4', 'text-ink-green-7', 'text-ink-amber-7', 'text-ink-red-6']
      .map((c) => ({ name: c, kind: 'text', fg: probe(c, 'bg-surface-base').fg, bg: surf }))
    const viz = ['--viz-p', '--viz-i', '--viz-good', '--viz-warn', '--viz-crit', '--viz-muted', '--viz-axis', '--viz-grid'].map((n) => ({ name: n, kind: 'graphic', fg: v(n), bg: surf }))
    return { rows: [...text, ...viz], surf, page }
  })
  for (const r of rows.rows) out.push({ theme, ...r, ratio: ratio(r.fg, r.bg) })
  await ctx.close()
}
await browser.close()
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
console.log('| Theme | Token | Colour | On | Ratio | Needed | Result |\n|---|---|---|---|---|---|---|')
for (const r of out) {
  const need = r.kind === 'text' ? 4.5 : 3
  console.log(`| ${r.theme} | \`${r.name}\` | ${hex(r.fg)} | ${hex(r.bg)} | ${r.ratio.toFixed(2)} | ${need} (${r.kind}) | ${r.ratio >= need ? 'pass' : '**fail**'} |`)
}
