// Demo seed of the Content Hub: the folder tree of the old DMS Document Repository, a few documents in it, and
// recent circulars. All fictional. The files themselves are made once by scripts/make-content-seed.mjs into
// services/content/seed-files/ (PDF via the browser's print, PNG via a screenshot) and copied on first start.
//
// audience: 'All' (every team) | 'B2C' | 'B2B'. A folder's audience also limits everything inside it.

const D = 86400000
export const FOLDERS = [
  ['BA', null, 'B2B'], ['Registration Form', 'BA', 'B2B'],
  ['Bonds', null, 'All'], ['Broking', null, 'All'], ['Budget', null, 'All'], ['Electronic Gold Receipt', null, 'All'],
  ['FD', null, 'All'], ['Fixed Deposit Product Note', 'FD', 'All'], ['Gift City', null, 'All'], ['Gold', null, 'All'],
  ['Interesting Data Point and Chart', null, 'All'], ['International', null, 'All'], ['Interview', null, 'B2C'],
  ['IPO', null, 'All'], ['Knowledge Product Notes', null, 'All'], ['KYC', null, 'All'], ['MF', null, 'All'],
  ['MF Dividend History', 'MF', 'All'], ['Sub-broker Kit', null, 'B2B'],
]

// [file, folder, title, description, audience, daysAgo, page lines (PDF) or card lines (PNG)]
export const DOCS = [
  ['kyc-checklist.pdf', 'KYC', 'KYC Checklist – Individual', 'Documents an individual needs for KYC: PAN, address proof, photo, bank proof', 'All', 40,
    ['Who needs it: every new investor before the first investment.', 'PAN card (mandatory)', 'Address proof: Aadhaar, passport, voter ID or driving licence', 'One recent photograph', 'Cancelled cheque or bank statement (for the bank mandate)', 'Signature on the KYC form, in the same style as the bank account']],
  ['kyc-nri.pdf', 'KYC', 'KYC Checklist – NRI', 'Extra documents for NRI investors: passport, visa, overseas address, NRE/NRO bank proof', 'All', 25,
    ['Passport (all pages with entries) and visa / OCI card', 'Overseas address proof', 'NRE or NRO bank account proof', 'FATCA declaration', 'Note: some fund houses do not accept investments from US and Canada residents.']],
  ['address-change.pdf', 'KYC', 'Address Change Request Form', 'Form to update the address on the investor folio', 'All', 120,
    ['Investor name, PAN and folio numbers', 'New address with PIN code', 'Self-attested proof of the new address', 'Signature of all holders']],
  ['sip-guide.pdf', 'MF', 'SIP – How It Works', 'One-page explainer on SIP, rupee-cost averaging and step-up SIP for first-time investors', 'All', 12,
    ['A SIP invests a fixed amount every month on a fixed date.', 'Rupee-cost averaging: more units when prices are low, fewer when high.', 'Step-up SIP: raise the amount every year with your income.', 'Example: Rs 5,000 a month for 15 years at an assumed 12% a year grows to about Rs 25 lakh.', 'Mutual fund investments are subject to market risks; read all scheme-related documents carefully.']],
  ['sip-card.png', 'MF', 'Why Start a SIP – WhatsApp Card', 'Image card for WhatsApp: start small, stay regular, let compounding work', 'B2C', 6,
    ['Start a SIP from Rs 500 a month', 'Stay regular, every month', 'Let compounding do the work']],
  ['mf-factsheet.pdf', 'MF', 'Mutual Fund Category Guide – Nov 2026', 'Equity, debt and hybrid categories in plain words, with who each one suits', 'All', 3,
    ['Large cap: big, established companies; for steady long-term growth.', 'Flexi cap: any company size; the fund manager decides the mix.', 'Short duration debt: for money needed in 1 to 3 years.', 'Balanced advantage: moves between equity and debt with the market.', 'Liquid funds: parking money for days or weeks.']],
  ['dividend-history.pdf', 'MF Dividend History', 'IDCW History – Equity Funds 2025-26', 'Income distribution (IDCW) declared in the last financial year, by category', 'All', 60,
    ['IDCW is paid out of the fund\'s own money: the NAV falls by the same amount.', 'It is taxed at the investor\'s slab rate.', 'Growth option is usually better for long-term investors.']],
  ['fd-rates.pdf', 'FD', 'Corporate FD Rate Card – Nov 2026', 'Interest rates of the corporate FDs we offer, by tenure, with senior citizen extra', 'All', 2,
    ['Rates are per year, cumulative option, for deposits up to Rs 5 crore.', '12 months: 7.25%   24 months: 7.50%   36 months: 7.75%', 'Senior citizens: an extra 0.25% to 0.50%', 'Rates change without notice; confirm on the day of investing.']],
  ['fd-rates.png', 'FD', 'FD Rates – WhatsApp Card', 'Image of this month\'s FD rates, ready to send on WhatsApp', 'B2C', 2,
    ['Corporate FD rates – Nov 2026', 'Up to 7.75% a year', 'Extra for senior citizens']],
  ['fd-note.pdf', 'Fixed Deposit Product Note', 'Fixed Deposit Product Note', 'How corporate FDs differ from bank FDs: rating, safety, premature withdrawal', 'All', 200,
    ['Corporate FDs are not covered by the bank deposit insurance (DICGC).', 'Choose only AAA or AA+ rated issuers.', 'Premature withdrawal usually allowed after 3 months, with a lower rate.']],
  ['gold-faq.pdf', 'Gold', 'Digital Gold and Gold ETF – FAQ', 'Common investor questions on digital gold, gold ETFs and gold funds', 'All', 90,
    ['Gold ETF: traded on the exchange, needs a demat account.', 'Gold fund of funds: invests in gold ETFs, no demat needed, SIP possible.', 'Digital gold: not regulated by SEBI.']],
  ['bond-basics.pdf', 'Bonds', 'Bonds – Basics for Investors', 'Coupon, yield, rating and tenure explained with one example', 'All', 150,
    ['Coupon: the interest the bond pays.', 'Yield: the return you actually get at today\'s price.', 'Rating: AAA is the safest; below A is high risk.']],
  ['ipo-steps.pdf', 'IPO', 'How to Apply for an IPO', 'Step by step: UPI mandate, bid, allotment and listing day', 'All', 30,
    ['Apply through the broking app with your UPI ID.', 'Approve the UPI mandate before 5 pm on the closing day.', 'Allotment in 2 working days; listing on the third.']],
  ['budget-2026.pdf', 'Budget', 'Union Budget 2026 – What Changed for Investors', 'Tax slabs, capital gains and 80C changes from the latest budget', 'All', 280,
    ['Summary prepared by the research team for client conversations.', 'Check the final law before advising on tax.']],
  ['ba-intro.pdf', 'BA', 'MH Short Intro for Business Associates', 'Who we are and how partnering with Money Honey works', 'B2B', 245,
    ['For partners (business associates) only.', 'Products, payouts and support we offer to partners.']],
  ['ba-registration.pdf', 'Registration Form', 'Business Associate Registration Form 2022', 'Registration form for new business associates', 'B2B', 1205,
    ['Partner details, PAN, bank details and ARN (if any).', 'Signed agreement pages.']],
  ['subbroker-payout.pdf', 'Sub-broker Kit', 'Sub-broker Payout Structure', 'Brokerage sharing by product for sub-brokers', 'B2B', 15,
    ['For sub-brokers only.']],
  ['interview-guide.pdf', 'Interview', 'IS Interview Question Bank', 'Questions for hiring investment specialists', 'B2C', 400,
    ['Internal: for hiring managers.']],
]

// [type, title, daysAgo (fraction = time of day), audience, html, attachment file or null]
export const CIRCULAR_TYPES = ['Market Update', 'FD Update', 'MF Update', 'Stock Update', 'IPO Update', 'NCD Update', 'Others']
export const CIRCULARS = [
  ['MF Update', 'NFO Update: Sunrise Defence Index Fund of Fund', 0.1, 'All', '<p>New fund offer <strong>opens 18 Nov and closes 2 Dec 2026</strong>.</p><ul><li>Invests in defence-sector index funds</li><li>Minimum Rs 1,000; SIP from Rs 500</li><li>Suits investors with a 5+ year view and high risk appetite</li></ul><p>Product presentation attached.</p>', 'mf-factsheet.pdf'],
  ['MF Update', 'Long-short fund: what to tell clients', 0.4, 'B2C', '<p>Clients are asking about the new specialised investment funds (SIF). Key points:</p><ul><li>Minimum investment Rs 10 lakh</li><li>Only for investors who understand long-short strategies</li></ul>', null],
  ['FD Update', 'Corporate FD rates revised from 15 Nov', 2, 'All', '<p>Rates are up by up to 0.25% for 24 and 36 months. The new rate card is attached; the WhatsApp card is in <em>Document Repository › FD</em>.</p>', 'fd-rates.pdf'],
  ['IPO Update', 'IPO: Orbit Logistics opens 20 Nov', 3, 'All', '<p>Price band Rs 412–434. Lot size 34 shares. Closes 22 Nov. Our research view: subscribe for listing gains only.</p>', 'ipo-steps.pdf'],
  ['NCD Update', 'NCD: Keystone Finance 9.1% secured NCD', 5, 'All', '<p>Rated AA (stable). Tenures 24, 36 and 60 months. Issue closes 30 Nov or earlier if fully subscribed.</p>', null],
  ['Stock Update', 'Weekly stock ideas for broking clients', 7, 'B2B', '<p>For partners with broking clients. Three large-cap ideas with entry ranges; see attachment.</p>', null],
  ['Others', 'Office closed on 25 Nov (local holiday)', 9, 'All', '<p>Call-backs scheduled for that day move to 26 Nov automatically.</p>', null],
  ['MF Update', 'SIP top-up campaign for November', 14, 'B2C', '<p>Call investors whose SIP is unchanged for 2+ years and offer a 10% step-up. The WhatsApp card is in <em>Document Repository › MF</em>.</p>', 'sip-card.png'],
  ['Others', 'KYC re-verification: new rules', 28, 'All', '<p>From 1 Dec, investors whose KYC is "on hold" cannot invest. Use the KYC checklist in <em>Document Repository › KYC</em>.</p>', 'kyc-checklist.pdf'],
  // older ones, so a date range (e.g. 15 Mar to 18 Apr) has something to find
  ['NCD Update', 'NCD: Meridian Housing Finance 8.9% secured NCD', 75, 'All', '<p>Rated AA+. Tenures 36 and 60 months. Issue closed early on full subscription.</p>', null],
  ['MF Update', 'Half-yearly portfolio review calls', 150, 'B2C', '<p>Call every investor with an SIP running for more than 12 months and review their goals.</p>', 'sip-guide.pdf'],
  ['IPO Update', 'IPO: Lakeview Hospitals opens 14 Apr', 220.4, 'All', '<p>Price band Rs 288–303. Our view: subscribe for the long term.</p>', 'ipo-steps.pdf'],
  ['FD Update', 'Corporate FD rates for April', 233.5, 'All', '<p>No change from March. Senior citizen extra stays at 0.25%.</p>', null],
  ['Others', 'Financial year end: last date for tax-saving investments', 247.3, 'All', '<p>ELSS and tax-saving FD investments must reach the fund house or bank by 31 March.</p>', null],
  ['Stock Update', 'Results season: what to tell broking clients', 262, 'B2B', '<p>For partners. Results season starts next week; avoid tips on single stocks.</p>', null],
  ['Others', 'Union Budget 2026: summary for client calls', 290, 'All', '<p>The research team summary is attached.</p>', 'budget-2026.pdf'],
]

export const ago = (days) => Date.now() - days * D

// Quizzes for the team (product owner, 17 Nov 2026): self-contained HTML quizzes like the old DMS ones, or a PDF.
// [file, title, topic, daysAgo, audience, questions ([q, [a, b, c, d], correct index, why]) or null for a PDF quiz]
export const QUIZZES = [
  ['quiz-mf-basics.html', 'Basics of Mutual Funds', 'NAV, SIP, fund types & regulation', 0.3, 'All', [
    ['In a mutual fund, what does \'AUM\' stand for?', ['Annual Utility Measure', 'Assets Under Management', 'Average Unit Market price', 'Annual Unified Metric'], 1, 'AUM is the total market value of the money a fund (or an IS) manages.'],
    ['What does NAV tell you?', ['The fund\'s yearly return', 'The value of one unit of the fund', 'The fund manager\'s fee', 'The minimum investment'], 1, 'NAV = (assets − liabilities) ÷ units. It is the price of one unit.'],
    ['Who regulates mutual funds in India?', ['RBI', 'IRDAI', 'SEBI', 'PFRDA'], 2, 'SEBI regulates mutual funds; AMFI is the industry body.'],
    ['A SIP mainly helps an investor to…', ['Time the market', 'Average out the purchase cost', 'Avoid all risk', 'Get a fixed return'], 1, 'Buying every month gets more units when prices are low: rupee-cost averaging.'],
    ['Which fund suits money needed in 2 weeks?', ['Small cap fund', 'Liquid fund', 'Sectoral fund', 'ELSS'], 1, 'Liquid funds hold very short-term debt and are meant for days or weeks.'],
  ]],
  ['quiz-fd.html', 'Corporate FD vs Bank FD', 'Safety, ratings, premature withdrawal', 7.2, 'All', [
    ['Are corporate FDs covered by DICGC deposit insurance?', ['Yes, up to Rs 5 lakh', 'Yes, fully', 'No', 'Only for senior citizens'], 2, 'DICGC covers bank deposits only.'],
    ['Which rating is the safest?', ['A', 'AA', 'AA+', 'AAA'], 3, 'AAA is the highest credit rating.'],
    ['Premature withdrawal of a corporate FD is usually allowed after…', ['1 day', '3 months', '5 years', 'Never'], 1, 'Most issuers allow it after 3 months, at a lower rate.'],
    ['The cumulative option pays interest…', ['Every month', 'Every quarter', 'At maturity', 'Never'], 2, 'Interest is reinvested and paid with the principal at maturity.'],
    ['Senior citizens usually get…', ['A lower rate', 'The same rate', 'An extra 0.25%–0.50%', 'No interest'], 2, 'Most issuers add 0.25% to 0.50% for senior citizens.'],
  ]],
  ['quiz-gold.html', 'Gold Funds and Gold ETFs', 'Ways to invest in gold', 14.1, 'All', [
    ['A Gold ETF needs…', ['A demat account', 'A locker', 'A jeweller', 'Nothing'], 0, 'ETFs trade on the exchange, so a demat account is needed.'],
    ['A gold fund of funds invests in…', ['Gold coins', 'Gold ETFs', 'Mining shares', 'Bank FDs'], 1, 'It holds units of gold ETFs; no demat needed.'],
    ['Is digital gold regulated by SEBI?', ['Yes', 'No', 'Only above Rs 1 lakh', 'Only for NRIs'], 1, 'Digital gold is not a SEBI-regulated product.'],
    ['Can you run a SIP in a gold fund of funds?', ['Yes', 'No', 'Only yearly', 'Only in ETFs'], 0, 'Gold FoFs allow SIPs like any mutual fund.'],
    ['Gold in a portfolio mainly…', ['Guarantees returns', 'Diversifies risk', 'Pays dividends', 'Replaces equity'], 1, 'Gold often moves differently from equity, which spreads risk.'],
  ]],
  ['quiz-debt.html', 'Debt Funds', 'Duration, credit risk, who they suit', 21.4, 'B2C', [
    ['When interest rates rise, long-duration bond prices…', ['Rise', 'Fall', 'Stay the same', 'Double'], 1, 'Bond prices move opposite to interest rates; longer duration moves more.'],
    ['Credit risk means…', ['The issuer may not repay', 'The NAV is fixed', 'The fund is closed', 'The rate is guaranteed'], 0, 'Credit risk is the chance the borrower defaults.'],
    ['Short duration funds suit money needed in about…', ['1 day', '1–3 years', '10 years', 'Never'], 1, 'Short duration funds fit a 1 to 3 year horizon.'],
    ['Overnight funds invest in securities maturing in…', ['1 day', '1 month', '1 year', '5 years'], 0, 'Overnight funds hold one-day securities.'],
    ['Gilt funds invest in…', ['Company bonds', 'Government securities', 'Shares', 'Gold'], 1, 'Gilts are government securities: no credit risk, but rate risk.'],
  ]],
  ['quiz-ipo.pdf', 'IPO Process', 'Bidding, allotment and listing (PDF)', 35, 'All', null],
  ['quiz-subbroker.html', 'Partner Onboarding Basics', 'For the B2B team', 9, 'B2B', [
    ['A sub-broker must be registered with…', ['The exchange', 'RBI', 'IRDAI', 'Nobody'], 0, 'Sub-brokers / authorised persons register through the exchange.'],
    ['ARN is issued by…', ['SEBI', 'AMFI', 'RBI', 'NSE'], 1, 'AMFI issues the ARN to mutual fund distributors.'],
    ['Brokerage sharing is agreed in…', ['The partner agreement', 'A WhatsApp chat', 'The KYC form', 'A circular'], 0, 'Payouts are part of the signed agreement.'],
    ['Partner KYC needs…', ['PAN', 'A car', 'A shop', 'A website'], 0, 'PAN is mandatory.'],
    ['Who can see B2B-only content?', ['Everyone', 'The B2B team', 'Clients', 'Nobody'], 1, 'Audience B2B shows only on B2B websites.'],
  ]],
]
// who already attempted (MHF ID -> [quiz index, attempts, days ago of the first attempt])
export const QUIZ_ATTEMPTS = {
  MHF500007: [[1, 2, 6], [2, 1, 13], [3, 1, 20]],
  MHF500011: [[1, 1, 7], [2, 3, 12], [4, 1, 30]],
  MHF500004: [[1, 1, 5], [3, 2, 19]],
  MHF500031: [[2, 1, 10]],
  MHF500051: [[1, 1, 3], [2, 1, 11], [3, 1, 18], [4, 1, 33]],
  MHF500005: [[1, 1, 6]],
}


// Market Updates (three a day). The Closing of 18 Nov 2026 is the market automation's Excel (seed-files/
// market-update.xlsx) as it is; the other updates are worked back / forward from it, so the demo has yesterday's
// three and today's so far. Only updates whose time has passed are made.
const SESSION_AT = [['Morning', 9, 10, 0.35], ['Mid-day', 13, 5, 0.7], ['Closing', 17, 38, 1]]
const r4 = (x) => String(+x.toFixed(4))
export function marketSeed(base, now = Date.now()) {
  const out = []
  const day = (back) => { const d = new Date(now); d.setDate(d.getDate() - back); return d }
  const at = (back, h, m) => { const d = day(back); d.setHours(h, m, 0, 0); return d.getTime() }
  const n = (s) => Number(String(s).replace(/,/g, ''))
  for (const back of [1, 0]) {
    for (const [session, h, m, share] of SESSION_AT) {
      const t = at(back, h, m); if (t > now) continue
      const market = JSON.parse(JSON.stringify(base)); market.session = session; market.asOf = t; market.source = back === 1 && session === 'Closing' ? 'excel' : 'auto'
      let i = 0
      for (const s of market.tables[0].sections) for (const r of s.rows) {
        i++
        const close = n(r.v.cmp); const prev = n(r.v.prev)
        if (back === 1) r.v.cmp = r4(prev + (close - prev) * share) // yesterday: on the way to the close in the file
        else { const drift = (((i * 37) % 11) - 5) / 1000; r.v.prev = r4(close); r.v.cmp = r4(close * (1 + drift * share)) } // today: from yesterday's close
        if (r.asOf) r.asOf = day(back).toISOString().slice(0, 10)
      }
      out.push({ at: t, title: `Market Update · ${session}`, market,
        html: back === 1 && session === 'Closing' ? '<p>Broad selling into the close; IT, Auto and Consumer Durables were the weakest. Pharma and PSU Banks held up. FIIs stay net buyers for the month.</p>' : '' })
    }
  }
  return out
}
