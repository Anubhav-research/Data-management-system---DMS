// In-app notifications (DMS_X07). Texts are copied from the catalogue; IDs noted per call site.
// A notification may carry a "silent filter" (ids) applied to its target list (X07 NOTIFICATION_BEHAVIOUR).
import { useDb } from '@/stores/db'
import { now } from '@/utils/format'

export function notify(to, code, text, link = null, filterIds = null) {
  const db = useDb()
  const list = Array.isArray(to) ? to : [to]
  for (const uid of list) {
    if (!uid) continue
    db.notifications.push({ id: db.nextId('N'), to: uid, code, text, link, filterIds, at: now(), read: false, tab: code === 'N-04' ? 'Events' : 'All' })
  }
}
export function myNotifications() {
  const db = useDb()
  return db.notifications.filter((n) => n.to === db.sessionUserId).sort((a, b) => b.at - a.at)
}
export function unreadCount() { return myNotifications().filter((n) => !n.read).length }
