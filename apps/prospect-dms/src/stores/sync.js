// Handle to the server-sync client (set once in main.js). Services use flushNow() when a step must be saved
// on the server before the next one runs (e.g. a handover is written to the outbox before it is sent).
let sync = null
export function setSync(s) { sync = s }
export const flushNow = () => (sync ? sync.flushNow() : Promise.resolve(true))
export const reloadState = () => (sync ? sync.reload() : Promise.resolve(false))

/**
 * Apply a synchronous change on the LATEST server data and save it; if someone else saved in between (409),
 * load again and re-apply, up to 3 times. Used for actions that must not be lost to a concurrent save
 * (conversion, handover receipt, Admin retry / revert). fn may throw a RuleError to abort.
 */
export async function transact(fn, tries = 3) {
  if (!sync) return fn()
  await sync.flushNow() // keep this tab's own pending edits
  for (let i = 0; i < tries; i++) {
    await sync.reload()
    const result = fn()
    if (await sync.flushNow()) return result
  }
  throw new Error('Others were changing the same data. Nothing was saved. Try again.')
}
