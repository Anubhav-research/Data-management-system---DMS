// Shared QA helpers. Browser: BROWSER=edge (default) | chrome, or BROWSER_PATH=<exe>.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from '../services/lib/common.mjs'

export const env = loadEnv()
export const P = `http://localhost:${env.PDMS_PORT}/#`
export const I = `http://localhost:${env.IDMS_PORT}/#`
export const P_ORIGIN = `http://localhost:${env.PDMS_PORT}`
export const I_ORIGIN = `http://localhost:${env.IDMS_PORT}`
export const TP = `http://localhost:${env.TP_SIM_PORT}`
export const QA_DIR = path.dirname(fileURLToPath(import.meta.url))
export const SHOTS = path.join(QA_DIR, 'shots'); fs.mkdirSync(SHOTS, { recursive: true })

const EXE = {
  edge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
}
export async function launch() {
  const exe = process.env.BROWSER_PATH || (EXE[process.env.BROWSER || 'edge'] || EXE.edge).find((p) => fs.existsSync(p)) || [...EXE.edge, ...EXE.chrome].find((p) => fs.existsSync(p))
  return chromium.launch({ executablePath: exe, headless: process.env.HEADED ? false : true })
}

export const ROLES = { IS: 'MHF500007', TL: 'MHF500004', VP: 'MHF500003', President: 'MHF500002', Admin: 'MHF500001' }

/** Opens a page on a website, signs in with an MHF ID and collects console errors. */
export async function openAs(browser, base, mhf, problems, label = '') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page._where = ''
  // 409 / 502 / 503 / 504 network lines are expected (conflict test, bridge deliberately stopped, flow switched off)
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of (409|502|503|504)/.test(m.text())) problems?.push(`[${label} ${page._where}] console.error: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => problems?.push(`[${label} ${page._where}] PAGEERROR: ${e.message.slice(0, 300)}`))
  await login(page, base, mhf)
  return page
}
export async function login(page, base, mhf) {
  await page.goto(base + '/login'); await page.waitForSelector('input[autocomplete=username]', { timeout: 15000 })
  await page.fill('input[autocomplete=username]', mhf)
  await page.click('button[type=submit]'); await page.waitForTimeout(700)
}
export async function go(page, base, route, wait = 800) { page._where = route; await page.goto(base + route); await page.waitForTimeout(wait) }

/** Direct API helpers (service level, with the website keys) */
export async function api(origin, method, p, body, headers = {}) {
  const r = await fetch(origin + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined })
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data }
}
export async function resetAll() {
  const { execFileSync } = await import('node:child_process')
  execFileSync(process.execPath, [path.join(QA_DIR, '..', 'scripts', 'reset-all.mjs')], { stdio: 'ignore' })
}

export function check(results, id, ok, detail = '') { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ' – ' + detail : ''}`) }
