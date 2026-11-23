// Client for the two outside doors a website may use: /bridge (the five flows) and /tp (Transaction Platform).
// The website's own Vite proxy adds its service key; the browser only says who is acting (for the audit log).
export function makeClient(prefix, getActor) {
  return async function call(method, path, body, extraHeaders = {}) {
    const me = getActor?.()
    try {
      const r = await fetch(prefix + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-actor': me ? `${me.name} (${me.mhf_id})` : 'system job', 'x-actor-role': me?.role || '', ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      let data = null
      try { data = await r.json() } catch { /* non-JSON */ }
      return { ok: r.ok, status: r.status, data, down: r.status === 502 || r.status === 504 }
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'unreachable' }, down: true }
    }
  }
}

/** SHA-256 of a JSON value (same algorithm the bridge uses), for showing hashes beside local records. */
export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) return null // not available over plain http on a LAN address
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
