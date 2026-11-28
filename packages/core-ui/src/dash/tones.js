// Mark colours by the job they do (dash/theme.css). Services name a tone; the charts paint it from the theme, so light
// and dark mode and the website's accent (Prospect blue, Investor aqua) come for free.
//   dark / blue    the accent: the measure itself, or "this part" (connected, Prospect DMS in a combined chart)
//   light / faint  the accent's light step: "the rest" (not connected), plans not yet certain
//   green / i      Investor DMS        p   Prospect DMS        wa / em   WhatsApp / email
//   good / warn / crit   status (reserved; shown with an icon or a label)
// No tone: the categorical slot of the item's position (1-8, fixed order, never cycled past 8 by the services).
const VAR = {
  dark: '--viz-accent', blue: '--viz-accent', mid: '--viz-accent-2', light: '--viz-accent-soft', faint: '--viz-accent-soft',
  green: '--viz-i', i: '--viz-i', p: '--viz-p', wa: '--viz-wa', em: '--viz-em', good: '--viz-good', warn: '--viz-warn', crit: '--viz-crit', gray: '--viz-muted',
}
export const cat = (i) => `var(--viz-${(i % 8) + 1})`
export const toneColor = (tone, i = 0) => (tone && VAR[tone] ? `var(${VAR[tone]})` : cat(i))
/** Compact numbers for axes and chips: 980 · 12.4K · 3.2L (lakh) · 1.4Cr (crore) for money is format.js inrShort. */
export function compact(v) {
  const n = Number(v) || 0; const a = Math.abs(n)
  if (a >= 1e7) return `${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`
  if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 })
}
