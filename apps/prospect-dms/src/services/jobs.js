// Background jobs of Prospect DMS while a browser has it open (simulating the server-side workers):
// flow switches, the F1 outbox, the F2 family log, self-registrations on the platform (DECISION-21), F4 busy blocks.
import { useDb } from '@/stores/db'
import { now } from '@/utils/format'
import { refreshSwitches } from './bridge'
import { tp } from './bridge'
import { processOutbox } from './handover'
import { pullFamilyLog } from './familyLog'
import { publishBusy } from './busy'
import { notify } from './notify'
import { fullName, runClocks, familyReminders } from './lifecycle'
import { workableMembers, normalize } from './family'

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

/** DECISION-21 (default, confirm): a Prospect / Lead member registers on the platform by themselves -> the owner keeps them. */
export async function pullRegistrations() {
  const s = db()
  const r = await tp('GET', `/tp/registrations?since=${s.tpCursor || 0}`)
  if (!r.ok) return
  // first run (or the simulator was reset): start watching from now
  if (s.tpCursor == null || r.data.last < s.tpCursor) { s.tpCursor = r.data.last; return }
  for (const reg of r.data.items.sort((a, b) => a.seq - b.seq)) {
    if (reg.seq <= s.tpCursor) continue
    s.tpCursor = reg.seq
    if (!reg.selfRegistered) continue
    for (const c of s.clients.filter((x) => ['Prospect', 'Lead'].includes(x.stage))) {
      const m = workableMembers(c).find((x) => normalize(x.pan || x.extra?.pan) === reg.pan)
      if (!m) continue
      c.selfRegistration = { memberKey: m.key, cid: reg.cid, at: now() }
      db().addActivity(c.id, 'data', `${fullName(m)} registered on the Transaction Platform by themselves.`, { actor: null })
      notify(c.assignedTo, 'N-SELFREG', `${fullName(m)} registered on the Transaction Platform. Tap to review.`, { path: `/record/${c.id}`, query: { selfreg: m.key } })
    }
  }
}

export function startBackgroundJobs() {
  every('switches', 15000, refreshSwitches)
  every('outbox', 5000, processOutbox, 1500)
  every('familyLog', 10000, pullFamilyLog, 2500)
  every('registrations', 15000, pullRegistrations, 3500)
  every('busy', 60000, publishBusy, 5000)
}

/** "Run daily jobs" on the Data Boundary page (demo): clocks, Pool family-number scan, 12-month family reminders,
 *  the family log, a forced F4 refresh and the outbox. */
export async function runDailyJobs() {
  runClocks()
  for (const u of db().users) familyReminders(u.id)
  const f2 = await pullFamilyLog()
  const f4 = await publishBusy(true)
  await processOutbox()
  return { summary: `clocks run; family log ${f2.off ? 'switched off' : f2.error ? 'not reachable' : `${f2.applied || 0} applied`}; busy blocks ${f4.off ? 'switched off' : f4.error ? 'not reachable' : 'published'}` }
}
