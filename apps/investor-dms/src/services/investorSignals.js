// Investment signals shared by the Investors, Unassigned Investors and Junk lists (product owner, 14 Nov 2026), so
// the three lists show and filter money the same way:
//   AUM = what the investor's investments are worth now (current value at the last end-of-day prices), shown with the
//   gain over the money invested in them ("invested value"). Both refresh every day after the market closes
//   (product owner, 21 Nov 2026; replaces "Total Invested / % still invested").
//   the last investment as three separate fields (amount, product, date) plus the time since, in years
//   how many specialists have held the investor (ownership history)
import { DAY } from '@/utils/format'

export const YEAR = 365.25 * DAY

/** The signal fields for a list row. */
export function investmentSignals(c) {
  const aum = Number(c.aum) || 0; const invested = Number(c.invested) || 0
  const gain = aum && invested ? aum - invested : null
  return {
    aum, invested: invested || null, gain, gainPct: gain != null ? Math.round((gain / invested) * 1000) / 10 : null, valuesAsOf: c.valuesAsOf || null,
    lastInvAmount: c.lastInvAmount || null, lastInvProduct: c.lastInvProduct || null, lastInvDate: c.lastInvDate || null,
    yearsSinceInv: c.lastInvDate ? (Date.now() - c.lastInvDate) / YEAR : null, // not rounded: bucket edges stay exact
    advisorsTried: new Set((c.ownershipHistory || []).map((h) => h.userId).filter(Boolean)).size || null,
  }
}

/** Every investor shows in the lists (product owner, 21 Nov 2026): with AUM and its gain over the invested value side by
 *  side, a market gain is easy to read, so the rule that hid investors in gain (17 Nov 2026) is gone. */
export const shownInLists = () => true

// Quick-filter option sets. `test` is applied to the row value.
export const LAST_INV_AGE = [
  { label: 'Within 6 months', value: '<0.5', test: (y) => y != null && y < 0.5 },
  { label: '6 – 12 months ago', value: '0.5-1', test: (y) => y >= 0.5 && y < 1 },
  { label: '1 – 2 years ago', value: '1-2', test: (y) => y >= 1 && y < 2 },
  { label: '2 – 3 years ago', value: '2-3', test: (y) => y >= 2 && y < 3 },
  { label: '3 – 5 years ago', value: '3-5', test: (y) => y >= 3 && y < 5 },
  { label: '5 – 10 years ago', value: '5-10', test: (y) => y >= 5 && y < 10 },
  { label: '10 years or more', value: '10+', test: (y) => y >= 10 },
  { label: 'Never invested', value: 'never', test: (y) => y == null },
]
export const GAIN = [
  { label: 'In gain', value: 'gain', test: (g) => g != null && g > 0 },
  { label: 'In loss', value: 'loss', test: (g) => g != null && g < 0 },
  { label: 'No investment now', value: 'none', test: (g) => g == null },
]
export const ADVISORS_TRIED = [{ label: '1 IS', value: 1 }, { label: '2 IS', value: 2 }, { label: '3 or more IS', value: 3 }]

/** quickMatch entries for the shared quick filters. */
export const signalMatch = {
  aum: (r, v) => r.aum >= v.min && r.aum <= v.max,
  gain: (r, v) => GAIN.find((o) => o.value === v).test(r.gain),
  yearsSinceInv: (r, v) => LAST_INV_AGE.find((o) => o.value === v).test(r.yearsSinceInv),
  advisorsTried: (r, v) => (v === 3 ? r.advisorsTried >= 3 : r.advisorsTried === v),
}

/** The shared quick filters, built from the list's rows. `inrShort` formats the AUM slider. */
export function signalQuick(rows, inrShort, { advisors = true } = {}) {
  const maxAum = rows.reduce((m, r) => Math.max(m, r.aum || 0), 0)
  return [
    { key: 'aum', label: 'AUM', range: { min: 0, max: maxAum, step: 1000, format: (n) => (n ? inrShort(n) : '₹0') } },
    { key: 'gain', label: 'Gain / Loss', multiple: true, options: GAIN },
    { key: 'yearsSinceInv', label: 'Last Investment', multiple: true, options: LAST_INV_AGE },
    { key: 'lastInvProduct', label: 'Last Product', multiple: true, options: [...new Set(rows.map((r) => r.lastInvProduct).filter(Boolean))].sort() },
    ...(advisors ? [{ key: 'advisorsTried', label: 'Past IS', multiple: true, options: ADVISORS_TRIED }] : []),
  ]
}

/** Filter-panel and sort fields for the signals: every part of a column is a field of its own. */
export const SIGNAL_FIELDS = [
  { key: 'aum', label: 'AUM (current value, ₹)' }, { key: 'invested', label: 'Invested Value (₹)' }, { key: 'gain', label: 'Gain (₹)' }, { key: 'gainPct', label: 'Gain (%)' },
  { key: 'lastInvAmount', label: 'Last Investment Amount (₹)' }, { key: 'lastInvProduct', label: 'Last Investment Product' },
  { key: 'lastInvDate', label: 'Last Investment Date' }, { key: 'yearsSinceInv', label: 'Years Since Last Investment' },
]
export const ADVISORS_FIELD = { key: 'advisorsTried', label: 'Past IS' }

/** "1 yr 10 mo ago" / "4 mo ago" from years. */
export function agoYears(y) {
  if (y == null) return ''
  const m = Math.max(1, Math.round(y * 12))
  if (m < 12) return `${m} mo ago`
  const yrs = Math.floor(m / 12); const mo = m % 12
  return `${yrs} yr${yrs > 1 ? 's' : ''}${mo ? ` ${mo} mo` : ''} ago`
}
