// npm run dev:all - starts the four services and both websites, with labelled output and the local + LAN links.
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { ROOT, loadEnv } from '../services/lib/common.mjs'

const env = loadEnv()
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
const procs = [
  { name: 'p-api', color: 34, cmd: ['services/p-api/server.mjs'] },
  { name: 'i-api', color: 32, cmd: ['services/i-api/server.mjs'] },
  { name: 'tp-sim', color: 35, cmd: ['services/tp-sim/server.mjs'] },
  { name: 'bridge', color: 33, cmd: ['services/bridge/server.mjs'] },
  { name: 'content', color: 36, cmd: ['services/content/server.mjs'] },
  { name: 'prospect-dms', color: 94, cmd: [VITE, '--host', env.HOST], cwd: 'apps/prospect-dms' },
  { name: 'investor-dms', color: 92, cmd: [VITE, '--host', env.HOST], cwd: 'apps/investor-dms' },
]
const only = process.argv.slice(2)
const children = []
for (const p of procs) {
  if (only.length && !only.includes(p.name)) continue
  const child = spawn(process.execPath, p.cmd, { cwd: path.join(ROOT, p.cwd || '.'), env: process.env })
  const tag = `\x1b[${p.color}m[${p.name.padEnd(12)}]\x1b[0m `
  const pipe = (s) => s.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(tag + l)))
  pipe(child.stdout); pipe(child.stderr)
  child.on('exit', (code) => console.log(tag + `stopped (${code ?? 'signal'})`))
  children.push(child)
}

const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
setTimeout(() => {
  const line = (label, port) => [`  ${label.padEnd(28)} http://localhost:${port}/`, ...lan.map((ip) => `  ${''.padEnd(28)} http://${ip}:${port}/   (LAN)`)].join('\n')
  console.log('\n' + '='.repeat(72))
  console.log('  Money Honey DMS split demo is starting')
  console.log(line('Prospect DMS (blue)', env.PDMS_PORT))
  console.log(line('Investor DMS (green)', env.IDMS_PORT))
  console.log(line('Transaction Platform SIMULATOR', env.TP_SIM_PORT))
  console.log('  Stop one service:  npm run stop:bridge   (start again: npm run start:bridge)')
  console.log('  Windows may ask once per port to allow network access: allow "Private networks" for LAN use.')
  console.log('='.repeat(72) + '\n')
}, 2500)

const stopAll = () => { for (const c of children) try { c.kill() } catch {} ; process.exit(0) }
process.on('SIGINT', stopAll); process.on('SIGTERM', stopAll)
