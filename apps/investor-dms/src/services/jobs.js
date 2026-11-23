// Background jobs of Investor DMS while a browser has it open (simulating the server-side workers):
// flow switches, the F1 inbox and acks, the F2 family log, platform investments, F4 busy blocks and the daily jobs.
import { useDb } from '@/stores/db'
import { refreshSwitches } from './bridge'
import { processInbox, sendAcks, pullInvestments } from './inbox'
import { sendFamilyLog, sendSnapshot } from './familyLog'
import { publishBusy } from './busy'
import { runClocks } from './lifecycle'

const db = () => useDb()
const running = {}
function every(name, ms, fn, delay = 0) {
  const run = async () => {
    if (running[name] || !db().me) return
    running[name] = true
    try { await fn() } catch (e) { console.warn(`[job ${name}]`, e.message) } finally { running[name] = false }
  }
  setTimeout(() => { run(); setInterval(run, ms) }, delay)
}

/** "Run daily jobs" on the Data Boundary page, and once a day automatically: clocks (moves to Unassigned),
 *  the F2 full snapshot and a forced F4 refresh. */
export async function runDailyJobs() {
  const moved = runClocks(true)
  db().jobs.lastDailyRun = new Date().toDateString()
  await sendFamilyLog()
  const snap = await sendSnapshot()
  const f4 = await publishBusy(true)
  return { moved, summary: `${moved.length} investor(s) moved to Unassigned; family log snapshot ${snap.off ? 'switched off' : snap.error ? 'not reachable' : `${snap.sent} famil${snap.sent === 1 ? 'y' : 'ies'}`}; busy blocks ${f4.off ? 'switched off' : f4.error ? 'not reachable' : 'published'}` }
}
async function dailyIfDue() { if (db().jobs?.lastDailyRun !== new Date().toDateString()) await runDailyJobs() }

export function startBackgroundJobs() {
  every('switches', 15000, refreshSwitches)
  every('inbox', 10000, processInbox, 1500)
  every('acks', 5000, sendAcks, 3000)
  every('familyLog', 5000, sendFamilyLog, 2500)
  every('investments', 15000, pullInvestments, 3500)
  every('busy', 60000, publishBusy, 5000)
  every('daily', 600000, dailyIfDue, 20000)
}
