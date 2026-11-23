// The two doors Prospect DMS may use: /bridge (the five flows) and /tp (Transaction Platform simulator).
// Both go through this website's own Vite proxy, which adds the Prospect DMS key.
import { ref } from 'vue'
import { makeClient } from '@mh/core-ui/bridgeClient.js'
import { useDb } from '@/stores/db'

export const bridge = makeClient('/bridge', () => useDb().me)
export const tp = makeClient('', () => useDb().me) // paths start with /tp/ (the proxy keeps the prefix)

/** Flow switches as last read from the bridge: { F1: { on, status }, F1_ACK, F2, F3, F4 } */
export const flowSwitches = ref(null)
export const bridgeReachable = ref(true)
export async function refreshSwitches() {
  const r = await bridge('GET', '/switches')
  bridgeReachable.value = r.ok
  if (r.ok) flowSwitches.value = r.data.switches
  return flowSwitches.value
}
/** Unknown (bridge not reachable yet) counts as on, so nothing is hidden by mistake. */
export const flowOn = (k) => (flowSwitches.value ? !!flowSwitches.value[k]?.on : true)

/** The versioned F1 contract (services/bridge/contract/handover-contract.json), read-only here. */
export const contract = ref(null)
export async function loadContract() {
  if (contract.value) return contract.value
  const r = await bridge('GET', '/contract')
  if (r.ok) contract.value = r.data
  return contract.value
}

/** DECISION-13 (default, confirm): INVESTOR_DATA_IN_PDMS = remove | hide (from .env, shown on the Data Boundary page). */
// eslint-disable-next-line no-undef
export const INVESTOR_DATA_MODE = typeof __INVESTOR_DATA_IN_PDMS__ !== 'undefined' ? __INVESTOR_DATA_IN_PDMS__ : 'remove'
