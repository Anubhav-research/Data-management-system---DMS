// D06 §6 Junk rules A1-A5, Admin Junk side effects, CSV log, Restore block - carried over to PROSPECT DMS (the Pool,
// Prospects and Leads live there). Drives the real services inside the running website. Starts from a reset.
// Investor DMS: Junk only from Unassigned; checked at the end against that website.
import fs from 'node:fs'
import path from 'node:path'
import { launch, login, P, I, resetAll, QA_DIR } from './lib.mjs'
await resetAll()
const browser = await launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 200)))
page.on('console', (m) => { if (m.type() === 'error' && !/409|502/.test(m.text())) errors.push('console ' + m.text().slice(0, 200)) })
await login(page, P, 'MHF500007'); await page.waitForTimeout(800)

const out = await page.evaluate(async () => {
  const L = await import('/src/services/lifecycle.js')
  const C = await import('/src/services/calls.js')
  const { useDb } = await import('/src/stores/db.js')
  const db = useDb(); const res = []
  const ok = (name, cond, info = '') => res.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`)
  const pools = () => db.clients.filter((c) => c.stage === 'Pool' && !c.batchOf)
  const reset = (c) => { c.counters = { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }; c.numberReports = {}; c.everConverted = false; c.poolState = 'Active' }
  const notConnected = (c, reason = 'Busy', mobile) => { C.startCall(c, mobile || L.primaryMobile(c)); return C.endCall({ connected: false, reason }) }

  // A1: 19 not-connected -> Inactive; 20th -> Junk instead of Inactive
  let c = pools()[0]; reset(c); c.counters.notConnected = 18; c.counters.poolCalls = 18
  let r = notConnected(c); ok('A1 19th not-connected -> Inactive Pool', c.stage === 'Pool' && c.poolState === 'Inactive' && !r.junked)
  r = notConnected(c); ok('A1 20th not-connected -> Junk (not Inactive)', c.stage === 'Junk' && r.junked === 'A1' && c.movedBy === 'System' && c.movedFrom === 'Pool')
  ok('A1 activity names the rule', db.activities.some((a) => a.clientId === c.id && /A1/.test(a.text)))

  // A2: 20th Not Interested; conversion beats the count, Release keeps in Pool -> Junk
  c = pools()[0]; reset(c); c.counters.notInterested = 19
  db.pendingLog = { clientId: c.id, stageAtCall: 'Pool', direction: 'Outbound', mobile: L.primaryMobile(c), at: Date.now(), duration: 30, madeBy: db.sessionUserId, status: 'Connected' }
  C.saveCallLog({ outcome: 'Not Interested', clientNameSel: L.clientName(c), comment: 'Not interested' })
  ok('A2 counter reaches 20, record still in Pool until decision', c.stage === 'Pool' && c.counters.notInterested === 20)
  const rr = L.releaseToPool(c); db.pendingConvert = null
  ok('A2 decision "Release to Pool" -> Junk', rr === 'Junk' && c.stage === 'Junk' && c.junkRule === 'A2')
  let c2 = pools()[0]; reset(c2); c2.counters.notInterested = 25
  L.convertFromPool(c2, 'Prospect', db.sessionUserId)
  ok('A2 conversion beats the count', c2.stage === 'Prospect')

  // A3: every number dead (5 reports each, Invalid Number / Wrong Number)
  c = pools()[0]; reset(c)
  const nums = L.allNumbers(c)
  nums.forEach((n, i) => { c.numberReports[n] = i === 0 ? 4 : 5 })
  r = notConnected(c, 'Invalid Number', nums[0])
  ok(`A3 last live number reported 5th time -> Junk (${nums.length} number(s))`, c.stage === 'Junk' && c.junkRule === 'A3')
  c = pools()[0]; reset(c); const n2 = L.allNumbers(c)
  if (n2.length > 1) { c.numberReports[n2[0]] = 4; r = notConnected(c, 'Invalid Number', n2[0]); ok('A3 one dead number but others alive -> not Junk', c.stage === 'Pool') }

  // A4: 30 Pool calls never converted; an ex-Prospect is exempt
  c = pools()[0]; reset(c); c.counters.poolCalls = 29
  r = notConnected(c, 'Busy'); ok('A4 30th Pool call, never converted -> Junk', c.stage === 'Junk' && c.junkRule === 'A4')
  c = pools()[0]; reset(c); c.counters.poolCalls = 29; c.everConverted = true
  r = notConnected(c, 'Busy'); ok('A4 not applied to a once-converted record', c.stage === 'Pool' && c.poolState === 'Inactive')

  // A5: fifth release from Prospect
  c = db.clients.find((x) => x.stage === 'Prospect' && x.assignedTo === db.sessionUserId); c.counters.releases = 4
  r = L.releaseToPool(c); ok('A5 fifth release -> Junk', r === 'Junk' && c.stage === 'Junk' && c.junkRule === 'A5')

  // Admin convert keeps life-time counters (only Restore resets)
  c = pools()[0]; reset(c); c.counters.notConnected = 7
  L.adminConvert([c.id], 'Lead', db.sessionUserId)
  ok('Admin convert keeps counters (D06 §6.2.3)', c.counters.notConnected === 7)

  // Admin Junk of a Prospect with events + pending approval
  db.sessionUserId = 'u_admin'
  const p = db.clients.find((x) => x.stage === 'Prospect' && x.assignedTo && db.events.some((e) => e.clientId === x.id)) || db.clients.find((x) => x.stage === 'Prospect' && x.assignedTo)
  db.events.push({ id: 'EV-T', clientId: p.id, type: 'Call Follow-up', title: 't', start: Date.now() + 86400000, end: Date.now() + 90000000, attendees: [p.assignedTo], createdBy: p.assignedTo, createdAt: Date.now() })
  db.approvals.push({ id: 'APR-T', clientId: p.id, category: 'Contact', categories: ['Contact'], changes: [], payload: {}, requestedBy: p.assignedTo, requestedOn: Date.now(), status: 'Pending', chain: [], history: [] })
  const owner = p.assignedTo; const notifBefore = db.notifications.length; const logBefore = db.junkLog.length
  L.adminJunk([p.id], 'Wrong person')
  ok('Admin Junk: stage Junk, owner removed, comment kept', p.stage === 'Junk' && !p.assignedTo && p.junkComment === 'Wrong person' && p.movedFrom === 'Prospect')
  ok('Admin Junk: events leave Calendar', db.events.filter((e) => e.clientId === p.id).every((e) => e.cancelled))
  ok('Admin Junk: pending approval cancelled + requester told', db.approvals.find((a) => a.id === 'APR-T').status === 'Cancelled' && db.notifications.slice(notifBefore).some((x) => x.to === owner && /cancelled/.test(x.text || x.message || JSON.stringify(x))))
  ok('Admin Junk: owner notified with count', db.notifications.slice(notifBefore).some((x) => /Admin moved 1 of your records to Junk/.test(JSON.stringify(x))))
  ok('Admin Junk: full record written to CSV log first', db.junkLog.length === logBefore + 1 && JSON.parse(db.junkLog.at(-1).record).stage === 'Prospect')
  ok('CSV log text has header + row', L.junkLogCsv().split('\r\n').length >= 2 && L.junkLogCsv().startsWith('"Date Time"'))

  // Admin may junk an Investor Family; it goes back only to Investor Family, with its family advisor (13 Nov 2026)
  const inv = db.clients.find((x) => x.stage === 'Investor Family' && x.assignedTo && !x.members.some((m) => m.investor?.status === 'Pending'))
  const famAdvisor = inv.assignedTo
  L.adminJunk([inv.id])
  ok('Investor Family can be junked by Admin; family advisor remembered', inv.stage === 'Junk' && inv.familyAdvisor === famAdvisor)
  let threw = false; try { L.restoreFromJunk([inv.id]) } catch (e) { threw = true }
  ok('Investor Family is never restored to the Pool', threw && inv.stage === 'Junk')
  L.restoreFamiliesFromJunk([inv.id])
  ok('Investor Family restored only to its family advisor', inv.stage === 'Investor Family' && inv.assignedTo === famAdvisor)
  // Split: restore is also blocked by a number of an existing client family
  const fam = db.clients.find((x) => x.stage === 'Investor Family' && x.members.some((m) => !m.investor && m.contacts?.length))
  const fdupe = pools()[1]; reset(fdupe); L.adminJunk([fdupe.id])
  const fsaved = fdupe.members[0].contacts[0].mobile
  fdupe.members[0].contacts[0].mobile = fam.members.find((m) => !m.investor && m.contacts?.length).contacts[0].mobile
  threw = false; try { L.restoreFromJunk([fdupe.id]) } catch (e) { threw = /blocked/.test(e.message) }
  ok('Restore blocked by a family number (split)', threw && fdupe.stage === 'Junk')
  fdupe.members[0].contacts[0].mobile = fsaved

  // Restore blocked when number matches an owned record
  const owned = db.clients.find((x) => x.stage === 'Lead' && x.assignedTo)
  const dupe = pools()[0]; reset(dupe); L.adminJunk([dupe.id])
  const savedMobile = dupe.members[0].contacts[0].mobile
  dupe.members[0].contacts[0].mobile = L.primaryMobile(owned)
  threw = false; try { L.restoreFromJunk([dupe.id]) } catch (e) { threw = /blocked/.test(e.message) }
  ok('Restore blocked by number match with owned record', threw && dupe.stage === 'Junk')
  dupe.members[0].contacts[0].mobile = savedMobile; dupe.counters.notConnected = 9
  L.restoreFromJunk([dupe.id])
  ok('Restore: Active Pool, counters reset, logged', dupe.stage === 'Pool' && dupe.poolState === 'Active' && dupe.counters.notConnected === 0 && db.junkLog.at(-1).action === 'Restored')
  return res
})
// Investor DMS: Junk only from Unassigned, Restore returns to Unassigned (split prompt §7.2.2)
const ip = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await login(ip, I, 'MHF500001'); await ip.waitForTimeout(800)
const out2 = await ip.evaluate(async () => {
  const L = window.__qa.s['./services/lifecycle.js']; const db = window.__qa.db; const res = []
  const ok = (name, cond, info = '') => res.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`)
  const inv = db.clients.find((c) => c.stage === 'Investor')
  let threw = false; try { L.adminJunk([inv.id]) } catch (e) { threw = true }
  ok('Investor DMS: an assigned Investor cannot be junked', threw && inv.stage === 'Investor')
  const un = db.clients.find((c) => c.stage === 'Unassigned')
  L.adminJunk([un.id]); ok('Investor DMS: Unassigned -> Junk', un.stage === 'Junk')
  L.restoreFromJunk([un.id]); ok('Investor DMS: Restore returns to Unassigned', un.stage === 'Unassigned')
  return res
})
const all = [...out, ...out2]
all.forEach((l) => console.log(l))
console.log(errors.length ? errors.join('\n') : 'no console/page errors')
fs.writeFileSync(path.join(QA_DIR, 'results-junkrules.json'), JSON.stringify({ at: new Date().toISOString(), suite: 'junkrules', results: all.map((l) => ({ id: l.replace(/^(PASS|FAIL) /, '').split(' :: ')[0], ok: l.startsWith('PASS'), detail: l.split(' :: ')[1] || '' })), problems: errors }, null, 2))
await browser.close()
process.exitCode = all.every((l) => l.startsWith('PASS')) && !errors.length ? 0 : 1


