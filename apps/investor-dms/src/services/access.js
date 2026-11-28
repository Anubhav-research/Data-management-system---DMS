// Roles, hierarchy visibility and module access.
// Sources: DMS_01 §4 (ROLE-001..008), DMS_X04 MODULE_ACCESS / ACTIONS, GEN-002, GEN-004, GEN-006.
import { useDb } from '@/stores/db'

export function me() { return useDb().me }
export function role() { return useDb().me?.role }
export const isAdmin = () => role() === 'Admin'
export const isIS = () => role() === 'IS'
/** TL and above see supervisor-only columns: Assigned To, Source IS, Data Code (GEN-006) */
export const isSupervisor = () => ['TL', 'VP', 'President', 'Admin'].includes(role())

/** All users below `userId` in the reports-to tree (downline). */
// people grouped by who they report to, built once per run (with 200+ people the old walk re-read the whole user
// list for every person in the tree, on every check); same answer, same order
let reportsCache = null
function reportsTo() {
  if (!reportsCache) {
    reportsCache = new Map()
    for (const u of useDb().users) (reportsCache.get(u.reportsTo) || reportsCache.set(u.reportsTo, []).get(u.reportsTo)).push(u.id)
    queueMicrotask(() => { reportsCache = null })
  }
  return reportsCache
}
export function downline(userId) {
  const by = reportsTo()
  const out = []
  const walk = (id) => (by.get(id) || []).forEach((u) => { out.push(u); walk(u) })
  walk(userId)
  return out
}
/** Own + downline user ids (ROLE-002). Admin sees everyone. */
export function visibleUserIds() {
  const db = useDb(); const u = db.me
  if (!u) return []
  if (u.role === 'Admin') return db.users.map((x) => x.id)
  return [u.id, ...downline(u.id)]
}
export function canSeeOwner(ownerId) { return isAdmin() || visibleUserIds().includes(ownerId) }

/** Approval chain = requester's real reports-to chain up to the top (APP-003, D03 §23.2). */
export function approvalChain(requesterId) {
  const db = useDb(); const chain = []
  let u = db.userById(requesterId)
  while (u && u.reportsTo) { chain.push(u.reportsTo); u = db.userById(u.reportsTo) }
  return chain
}

// Sidebar modules in GEN-002 order (+ Events home from Figma 24661, + Junk from DMS_01 §5.3)
export const NAV = [
  { key: 'notifications', label: 'Notifications', icon: 'lucide-bell', action: 'notifications' },
  { key: 'dashboard', label: 'Dashboard', icon: 'lucide-layout-dashboard', to: '/dashboard' },
  { key: 'investors', label: 'Investors', icon: 'lucide-banknote', to: '/investors' },
  { key: 'deals', label: 'Deals', icon: 'lucide-handshake', to: '/deals' },
  { key: 'notes', label: 'Notes', icon: 'lucide-file-text', to: '/notes' },
  { key: 'tasks', label: 'Tasks', icon: 'lucide-circle-check', to: '/tasks' },
  { key: 'events', label: 'Events', icon: 'lucide-calendar-clock', to: '/events' },
  { key: 'calendar', label: 'Calendar', icon: 'lucide-calendar', to: '/calendar' },
  { key: 'call-logs', label: 'Call Logs', icon: 'lucide-phone', to: '/call-logs' },
  { key: 'whatsapp-logs', label: 'WhatsApp Logs', icon: 'icon-whatsapp', to: '/whatsapp-logs' },
  { key: 'email-logs', label: 'Email Logs', icon: 'lucide-mail', to: '/email-logs' },
  { key: 'unassigned', label: 'Unassigned Investors', icon: 'lucide-user-x', to: '/unassigned', admin: true },
  { key: 'junk', label: 'Junk', icon: 'lucide-trash-2', to: '/junk', admin: true, bottom: true }, // pinned above Collapse, red icon
]
// Settings modal, grouped as in Frappe CRM Settings.vue (product owner, 06 Nov 2026).
// User Configuration is for everyone; the rest is Admin-only (ROLE-004; D06 admin screens have no switch, §9).
export const SETTINGS_TABS = [
  { label: 'User Configuration', items: [
    { key: 'profile', label: 'Profile', icon: 'lucide-circle-user' },
    { key: 'preferences', label: 'Preferences', icon: 'lucide-sliders-horizontal' },
  ] },
  { label: 'System Configuration', admin: true, items: [
    { key: 'defaults', label: 'Defaults', icon: 'lucide-monitor-cog' },
    { key: 'calendar', label: 'Calendar', icon: 'lucide-calendar' },
  ] },
  { label: 'User Management', admin: true, items: [
    { key: 'users', label: 'User Access', icon: 'lucide-user-cog' },
  ] },
  { label: 'Email', admin: true, items: [
    { key: 'templates', label: 'Templates', icon: 'lucide-mail' },
  ] },
  { label: 'DMS Operations', admin: true, items: [
    { key: 'is-mapping', label: 'IS Mapping', icon: 'lucide-arrow-left-right' },
  ] },
]
export const SETTINGS_PAGES = SETTINGS_TABS.flatMap((t) => t.items.map((i) => ({ ...i, admin: !!t.admin })))

/** Route-level guard (GEN-004). Returns true when the module is permitted for the signed-in role. */
export function canAccessPath(path) {
  const db = useDb(); const u = db.me
  if (!u) return false
  if (!u.switches?.dms) return false // D06 §9.5 main switch off -> no access
  if (path.startsWith('/settings')) {
    const key = path.split('/')[2] || 'profile'
    const page = SETTINGS_PAGES.find((p) => p.key === key)
    return !!page && (!page.admin || u.role === 'Admin')
  }
  if (path.startsWith('/unassigned') || path.startsWith('/junk')) return u.role === 'Admin'
  if (path.startsWith('/dashboard-lab')) return u.role === 'Admin' // design review page
  if (path.startsWith('/exceptions')) return u.role === 'Admin' // Dashboard drill-down, Admin operations
  return true
}

/** Per-user switch (D06 §9.6). Switches of the acting person count (§9.7). */
export function hasSwitch(key) { const u = me(); return !!(u?.switches?.dms && u.switches[key]) }

/** Can the signed-in user act on a client (owner, senior in chain, Admin, or holder of the Pool batch). */
export function canActOn(client) {
  const u = me(); if (!u || !client) return false
  if (u.role === 'Admin') return true
  if (['Unassigned', 'Junk'].includes(client.stage)) return false
  return visibleUserIds().includes(client.assignedTo)
}
