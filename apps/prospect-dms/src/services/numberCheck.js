// F3 Number check (split prompt §4, §6.7). Prospect DMS asks; Investor DMS and the Transaction Platform answer
// Yes/No per mobile or PAN, nothing else. Used by Data Import, manual Prospect creation and Pool batches.
import { useDb } from '@/stores/db'
import { now } from '@/utils/format'
import { RuleError, holdPoolRecord } from './lifecycle'
import { bridge, flowOn } from './bridge'
import { normalize, isDnd } from './family'

const db = () => useDb()
export const FAMILY_BLOCK_MSG = 'This number belongs to an existing client family. Contact your senior.'
// DECISION-22 (default, confirm): when the check can't be answered (bridge, Investor DMS or platform down), fail closed.
export const CHECK_DOWN_MSG = 'The number check is not available right now. Nothing was created or imported. Try again later.'

/** Ask F3. Returns { ok, yes:Set<normalized>, off } - off = Admin switched F3 off (only the internal check applies). */
export async function numberCheck(values, context) {
  const items = [...new Set(values.map(normalize).filter(Boolean))]
  const log = { id: db().nextId('F3'), at: now(), context, count: items.length, yes: 0, result: '', by: db().sessionUserId }
  if (!db().numberChecks) db().numberChecks = []
  db().numberChecks.unshift(log)
  if (db().numberChecks.length > 500) db().numberChecks.length = 500
  if (!items.length) { log.result = 'nothing to check'; return { ok: true, yes: new Set() } }
  if (!flowOn('F3')) { log.result = 'F3 switched off – internal check only'; return { ok: true, off: true, yes: new Set() } }
  const r = await bridge('POST', '/number-check', { items })
  if (!r.ok) { log.result = r.data?.flowOff ? 'F3 switched off – internal check only' : 'not answered'; return r.data?.flowOff ? { ok: true, off: true, yes: new Set() } : { ok: false, yes: new Set() } }
  const yes = new Set(r.data.answers.filter((a) => a.exists === 'Yes').map((a) => normalize(a.item)))
  log.yes = yes.size; log.result = `answered (${yes.size} Yes)`
  return { ok: true, yes }
}

/** Manual Prospect creation (split prompt §6.7.3): blocked when any number or PAN is a family's or exists elsewhere. */
export async function assertCreatable(members, exceptClientId = null) {
  const values = members.flatMap((m) => [...(m.contacts || []).map((x) => x.mobile), m.pan || m.extra?.pan]).filter(Boolean)
  if (values.some((v) => isDnd(v, exceptClientId))) throw new RuleError(FAMILY_BLOCK_MSG)
  const res = await numberCheck(values, exceptClientId ? 'group member added' : 'manual Prospect creation')
  if (!res.ok) throw new RuleError(CHECK_DOWN_MSG)
  if (values.some((v) => res.yes.has(normalize(v)))) throw new RuleError(FAMILY_BLOCK_MSG)
}

/** Pool batch (split prompt §6.7.4): checks the drawn batch; matches leave the Pool for the Admin exception list. */
export async function screenBatch(userId) {
  const batch = db().clients.filter((c) => c.stage === 'Pool' && c.batchOf === userId && !c.f3CheckedAt)
  if (!batch.length) return 0
  const values = batch.flatMap((c) => c.members.flatMap((m) => [...(m.contacts || []).map((x) => x.mobile), m.pan]).filter(Boolean))
  const res = await numberCheck(values, `Pool batch of ${db().userById(userId)?.name || userId}`)
  if (!res.ok) return 0 // the internal "do not distribute" filter already ran when the batch was drawn
  let held = 0
  for (const id of batch.map((c) => c.id)) {
    const c = db().clientById(id); if (!c) continue
    c.f3CheckedAt = now()
    if (c.members.some((m) => [...(m.contacts || []).map((x) => x.mobile), m.pan].some((v) => v && res.yes.has(normalize(v))))) { holdPoolRecord(c, 'F3'); held++ }
  }
  return held
}

/** Data Import rows: returns the set of normalized values that must be skipped as "Existing client or family". */
export async function screenImport(values) {
  const internal = new Set(values.filter((v) => isDnd(v)).map(normalize))
  const res = await numberCheck(values, 'Data Import')
  if (!res.ok) throw new RuleError(CHECK_DOWN_MSG)
  return new Set([...internal, ...res.yes])
}
