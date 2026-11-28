// This website's mock "database". It lives on this website's OWN server (services/i-api),
// loaded on start and saved back with a version number (packages/core-ui/src/sync.js), so several people on the
// LAN see the same data. Business rules live in src/services, not here.
import { defineStore } from 'pinia'
import { byIdLookup } from '@mh/core-ui/byId.js'

// id -> record, without walking the whole list each time (the big lists hold thousands of records)
const userLookup = byIdLookup()
const clientLookup = byIdLookup()
import { seedUsers, seedClients, seedRelated, seedPoolSources, seedImports, seedTransfers, seedApprovals, seedNotifications } from '@/data/seed'
import { now } from '@/utils/format'
import { EMAIL_TEMPLATES } from '@/data/masters'
import { SITE } from '@/site'

/** Per-tab overlays: never saved to the server (each person keeps their own sign-in, call and pending pop-ups). */
export const LOCAL_KEYS = ['sessionUserId', 'activeCall', 'pendingLog', 'pendingConvert']
let bootData = null
/** main.js loads the server state first, then hands it over here before the store is created. */
export function setBootState(state) { bootData = state }
function readSession() { try { return sessionStorage.getItem(SITE.sessionKey) } catch (e) { return null } }
function writeSession(id) { try { id ? sessionStorage.setItem(SITE.sessionKey, id) : sessionStorage.removeItem(SITE.sessionKey) } catch (e) { /* blocked */ } }

export function freshState() {
  const users = seedUsers()
  const clients = seedClients()
  const rel = seedRelated(clients, users)
  const s = {
    users, clients, ...rel,
    approvals: seedApprovals(clients), notifications: seedNotifications(),
    transfers: seedTransfers(), imports: seedImports(), poolSources: seedPoolSources(clients),
    poolSourceLog: [], userAudit: [],
    junkLog: [], // simulated CSV Junk log: full record written before every Admin move to Junk, plus restores (GEN-010, D02 §3.11, D06 §6.7)
    // ---- split: Investor DMS side of the five flows ----
    inbox: [], // F1 handovers received and their result (split prompt §5.5)
    ackOutbox: [], // F1-ack waiting to be sent
    f2Outbox: [], // F2 family-log entries waiting to be sent
    f2Sent: [], // F2 entries sent (Data Boundary, dashboard)
    f2Last: {}, // last value sent per Family ID (send on change only)
    exceptions: [], // Admin exceptions: Needs Data Code, Duplicate investor, ...
    tpInvCursor: null, // last platform investment seen
    jobs: { lastDailyRun: new Date().toDateString() }, // the seed counts as today's run: "Run daily jobs" moves the 18-month investor (demo step 7)
    seq: 1000,
  }
  return s
}

export const useDb = defineStore('db', {
  state: () => {
    const s = bootData || freshState()
    // per-tab overlays
    s.sessionUserId = readSession(); s.activeCall = null; s.pendingLog = null; s.pendingConvert = null
    if (s.sessionUserId && !s.users.some((u) => u.id === s.sessionUserId)) s.sessionUserId = null
    if (!s.seq) s.seq = 1000
    if (!s.junkLog) s.junkLog = []
    // Settings modal data: calendar defaults (D05: reminder 10 minutes before) and Admin email templates (D04 §12.1)
    if (!s.settings) s.settings = { calendarView: 'Week', eventReminders: [10] }
    if (s.settings.showBusyToSupervisors === undefined) s.settings.showBusyToSupervisors = false // F4 (split prompt §8)
    for (const k of ['inbox', 'ackOutbox', 'f2Outbox', 'f2Sent', 'exceptions']) if (!s[k]) s[k] = []
    if (!s.f2Last) s.f2Last = {}
    if (!s.jobs) s.jobs = { lastDailyRun: new Date().toDateString() }
    if (!s.emailTemplates) s.emailTemplates = EMAIL_TEMPLATES.map((t, i) => ({ id: 'ET-' + (i + 1), ...t, enabled: true }))
    // Every person has their own Client ID (product-owner decision 06 Nov 2026). The primary's ID is the record ID.
    for (const c of s.clients) c.members.forEach((m, i) => { if (i === 0) m.clientId = c.id; else if (!m.clientId) m.clientId = `CRM-LEAD-2026-${String(++s.seq).padStart(5, '0')}` })
    for (const c of s.clients) if (['Investor', 'Unassigned'].includes(c.stage)) c.members.forEach((m) => { if (m.pan && m.panVerified === undefined && (!c.verifiedKeys || c.verifiedKeys.includes(m.key))) m.panVerified = true })
    // Investor CID = Client ID: seeded investors' verified people get their platform CID
    for (const c of s.clients) if (c.cid) c.members.forEach((m, i) => { if (i === 0) m.cid = c.cid; else if (!m.cid && m.panVerified) m.cid = 'CID' + String(50000 + ++s.seq).slice(-5) })
    // Note pins are per user and per screen (D05 §2.7): migrate the old single flags to the creator's pins
    for (const n of s.notes || []) if (!n.pins) n.pins = { home: n.pinnedHome ? [n.createdBy] : [], client: n.pinnedClient ? [n.createdBy] : [] }
    return s
  },
  getters: {
    me: (s) => s.users.find((u) => u.id === s.sessionUserId) || null,
    userById: (s) => (id) => userLookup(s.users, id),
    clientById: (s) => (id) => clientLookup(s.clients, id),
  },
  actions: {
    nextId(prefix) { this.seq++; return `${prefix}-${this.seq}` },
    /** System-generated Client ID: never edited, never reused (D03 §2.1). */
    newClientId() { this.seq++; return `CRM-LEAD-2026-${String(this.seq).padStart(5, '0')}` },
    /** Saving is automatic (sync.js); kept so older call sites still work. */
    persist() {},
    /** Reset this website's database to its seed (the server empties it; the first browser to load writes the seed). */
    async resetDemo() {
      await fetch('/api/reset', { method: 'POST' })
      location.reload()
    },
    login(userId) { this.sessionUserId = userId; writeSession(userId) },
    logout() { this.sessionUserId = null; this.activeCall = null; writeSession(null) },
    addActivity(clientId, type, text, extra = {}) {
      this.activities.push({ id: this.nextId('A'), clientId, at: now(), actor: this.sessionUserId, type, text, ...extra })
    },
  },
})

