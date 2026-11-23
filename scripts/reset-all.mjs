// npm run reset:all - returns both websites, the bridge and the simulator to their seeds.
// Running services are reset through their APIs; stopped ones have their data files removed.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, loadEnv } from '../services/lib/common.mjs'

const env = loadEnv()
const call = async (url, key) => {
  try { const r = await fetch(url, { method: 'POST', headers: key ? { 'x-api-key': key } : {}, signal: AbortSignal.timeout(3000) }); return r.ok } catch { return false }
}
const targets = [
  ['p-api', `http://127.0.0.1:${env.P_API_PORT}/api/reset`, env.P_API_KEY, ['services/p-api/data']],
  ['i-api', `http://127.0.0.1:${env.I_API_PORT}/api/reset`, env.I_API_KEY, ['services/i-api/data']],
  ['bridge', `http://127.0.0.1:${env.BRIDGE_PORT}/reset`, null, []],
  ['content', `http://127.0.0.1:${env.CONTENT_PORT}/content/reset`, env.P_API_KEY, ['services/content/data']],
  ['tp-sim', `http://127.0.0.1:${env.TP_SIM_PORT}/console/reset`, null, ['services/tp-sim/data']],
]
for (const [name, url, key, dirs] of targets) {
  if (await call(url, key)) { console.log(`${name}: reset through its API`); continue }
  for (const d of dirs) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true })
  if (name === 'bridge') {
    const data = path.join(ROOT, 'services/bridge/data')
    for (const f of ['bridge-state.json']) fs.rmSync(path.join(data, f), { force: true })
    for (const f of ['audit.jsonl', 'family-log.jsonl']) if (fs.existsSync(path.join(data, f))) fs.renameSync(path.join(data, f), path.join(data, f.replace('.jsonl', `-archived-${Date.now()}.jsonl`)))
  }
  console.log(`${name}: not running - data files cleared`)
}
console.log('Done. Open (or reload) both websites: the first one to load writes its fresh seed.')
