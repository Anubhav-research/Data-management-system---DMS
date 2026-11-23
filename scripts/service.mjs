// npm run stop:<service> / start:<service> - stop or (re)start one back-end service while the rest keep running.
// Used in the demo (stop the bridge, convert someone, start it again) and by the QA scripts.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ROOT } from '../services/lib/common.mjs'

const [action, name] = process.argv.slice(2)
const SERVICES = ['p-api', 'i-api', 'tp-sim', 'bridge', 'content']
if (!SERVICES.includes(name) || !['stop', 'start'].includes(action)) { console.error('usage: node scripts/service.mjs stop|start ' + SERVICES.join('|')); process.exit(1) }
const pidFile = path.join(ROOT, '.run', name + '.pid')

if (action === 'stop') {
  if (!fs.existsSync(pidFile)) { console.log(`${name} is not running (no pid file).`); process.exit(0) }
  const pid = Number(fs.readFileSync(pidFile, 'utf8'))
  try { process.kill(pid); console.log(`${name} stopped (pid ${pid}).`) } catch { console.log(`${name} was not running.`) }
  try { fs.unlinkSync(pidFile) } catch {}
} else {
  fs.mkdirSync(path.join(ROOT, '.run'), { recursive: true })
  const log = fs.openSync(path.join(ROOT, '.run', name + '.log'), 'a')
  const child = spawn(process.execPath, [path.join(ROOT, 'services', name, 'server.mjs')], { cwd: ROOT, detached: true, stdio: ['ignore', log, log] })
  child.unref()
  console.log(`${name} started in the background (pid ${child.pid}); output in .run/${name}.log`)
}
