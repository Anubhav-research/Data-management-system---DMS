// F2 Family log, applied in Prospect DMS (split prompt §6.6). Investor DMS says, per Family ID, who the advisor is,
// whether the investor is Assigned or Unassigned, and whether they invested in the last 18 months. Nothing else.
// The family follows by itself; the manual Admin fallback is used only while F2 is switched off.
import { useDb } from '@/stores/db'
import { now } from '@/utils/format'
import { RuleError, clientName } from './lifecycle'
import { notify } from './notify'
import { bridge, flowOn } from './bridge'
import { raiseException, isFamilyStage } from './family'

const db = () => useDb()
const state = () => { const s = db(); if (!s.familyLog) s.familyLog = { cursor: 0, applied: [], corrections: [] }; return s.familyLog }

/** Pull new F2 entries from the bridge and apply them in order. */
export async function pullFamilyLog() {
  if (!flowOn('F2')) return { off: true }
  const r = await bridge('GET', `/family-log?since=${state().cursor || 0}`)
  if (!r.ok) return { error: r.data?.error || r.status }
  let n = 0
  for (const e of r.data.items.sort((a, b) => a.seq - b.seq)) {
    if (e.seq <= (state().cursor || 0)) continue // another tab already applied it
    applyFamilyEntry(e, 'Family log from Investor DMS')
    state().cursor = e.seq; n++
  }
  return { applied: n }
}

function logEntry(e, action, result, source) {
  const L = state()
  L.applied.unshift({ seq: e.seq ?? null, receivedAt: now(), mode: e.mode || 'manual', snapshotId: e.snapshotId || null, familyId: e.familyId, status: e.status, advisorMhfId: e.advisorMhfId || null, investedLast18Months: e.investedLast18Months ?? null, action, result, source })
  if (L.applied.length > 1000) L.applied.length = 1000
  if (e.mode === 'snapshot' && action !== 'none' && action !== 'ignored') L.corrections.unshift({ at: now(), familyId: e.familyId, snapshotId: e.snapshotId, action, result })
}

/** Apply one F2 message (or a manual fallback change). Returns the action taken. */
export function applyFamilyEntry(e, source = 'Family log from Investor DMS') {
  const c = db().clients.find((x) => x.familyId === e.familyId && isFamilyStage(x))
  // a family Admin moved to Junk: only remember who its advisor is now (it is restored to them)
  const junked = !c && db().clients.find((x) => x.familyId === e.familyId && x.stage === 'Junk' && x.movedFrom === 'Investor Family')
  if (junked) {
    const u = e.status === 'Assigned' ? db().users.find((x) => x.mhf_id === e.advisorMhfId) : null
    if (u && junked.familyAdvisor !== u.id) { junked.familyAdvisor = u.id; logEntry(e, 'family IS updated (in Junk)', 'applied', source); return 'family IS updated (in Junk)' }
    logEntry(e, 'none', 'family in Junk', source); return 'none'
  }
  if (!c) {
    // Migrated investors have Family IDs that never existed here (split prompt §7.2.3): logged only.
    const migrated = /^FAM-M/.test(String(e.familyId))
    if (!migrated) raiseException('Unknown Family ID', `Family log for ${e.familyId}: no Investor Family with this ID in Prospect DMS.`, { ref: e.familyId })
    logEntry(e, 'ignored', migrated ? 'no family in Prospect DMS' : 'unknown Family ID – Admin exception', source)
    return 'ignored'
  }
  const name = clientName(c)
  const actions = []
  if (e.investedLast18Months && c.investorActive !== e.investedLast18Months) { c.investorActive = e.investedLast18Months; actions.push(`investor active: ${e.investedLast18Months}`) }

  if (e.status === 'Unassigned') {
    // No Unassigned Family in Prospect DMS (product owner, 13 Nov 2026): the family stays with its advisor until Admin
    // reassigns the investor in Investor DMS; that reassignment arrives here as "Assigned" and moves the family.
    if (c.stage === 'Investor Family' && !c.investorUnassigned) {
      c.investorUnassigned = now()
      db().addActivity(c.id, 'owner', `${source}: the investor moved to Unassigned Investors in Investor DMS. The family stays with ${db().userById(c.assignedTo)?.name || 'its IS'} until Admin assigns a new IS there.`, { actor: null })
      actions.push('investor unassigned; family unchanged')
    }
  } else if (e.status === 'Assigned') {
    c.investorUnassigned = null
    const u = db().users.find((x) => x.mhf_id === e.advisorMhfId)
    if (!u || !u.active || !u.switches?.dms) {
      // the named advisor has no access to Prospect DMS: keep the old owner, lock the family, raise an exception
      c.ownershipPending = { advisorMhfId: e.advisorMhfId, at: now() }
      raiseException('Ownership update pending', `Family ${c.familyId} (${name}) should move to ${e.advisorMhfId}, who has no access to Prospect DMS. Family locked.`, { clientId: c.id })
      db().addActivity(c.id, 'owner', `${source}: IS ${e.advisorMhfId} has no access to Prospect DMS. Ownership update pending.`, { actor: null })
      actions.push('locked: IS has no access')
    } else if (c.stage === 'Unassigned Family') {
      c.stage = 'Investor Family'; c.assignedTo = u.id; c.unassignedSince = null; c.ownershipPending = null
      c.ownershipHistory = [...(c.ownershipHistory || []), { userId: u.id, from: now(), to: null }]
      db().addActivity(c.id, 'owner', `${source}: family assigned to ${u.name}. Moved back to Investor Family.`, { actor: null })
      notify(u.id, 'FAM-ASSIGNED', `You have been assigned the family of ${name} (${c.familyId}). Click to view.`, { path: '/investor-family' }, [c.id])
      actions.push('back to assigned')
    } else if (c.assignedTo !== u.id) {
      const old = c.assignedTo
      c.assignedTo = u.id; c.ownershipPending = null; c.callLockBy = null
      c.ownershipHistory = [...(c.ownershipHistory || []).map((h) => ({ ...h, to: h.to || now() })), { userId: u.id, from: now(), to: null }]
      db().addActivity(c.id, 'owner', `${source}: IS changed from ${db().userById(old)?.name || '-'} to ${u.name}.`, { actor: null })
      notify(u.id, 'FAM-ASSIGNED', `You have been assigned the family of ${name} (${c.familyId}). Click to view.`, { path: '/investor-family' }, [c.id])
      if (old) notify(old, 'FAM-MOVED', `The family of ${name} (${c.familyId}) has moved to another IS.`, null)
      actions.push('IS change')
    } else if (c.ownershipPending) { c.ownershipPending = null; actions.push('lock cleared') }
  }
  const action = actions.length ? actions.join('; ') : 'none'
  logEntry(e, action, actions.length ? 'applied' : 'no change', source)
  return action
}

/** Manual fallback, only while F2 is switched off (split prompt §6.6): Admin sets the advisor of a family. */
export function manualFamilyAdvisor(familyId, advisorMhfId, reason) {
  if (flowOn('F2')) throw new RuleError('The family log (F2) is on. Families follow Investor DMS automatically.')
  if (!reason?.trim()) throw new RuleError('Reason is mandatory.')
  const c = db().clients.find((x) => x.familyId === familyId.trim().toUpperCase() && isFamilyStage(x))
  if (!c) throw new RuleError('No Investor Family or Unassigned Family with this Family ID.')
  const u = db().users.find((x) => x.mhf_id === advisorMhfId.trim().toUpperCase())
  if (!u) throw new RuleError('No user with this MHF ID in Prospect DMS.')
  const me = db().me
  const action = applyFamilyEntry({ familyId: c.familyId, advisorMhfId: u.mhf_id, status: 'Assigned', mode: 'manual' }, `Manual change by ${me.name} (${me.mhf_id}) – ${reason.trim()}`)
  return { client: c, action }
}
