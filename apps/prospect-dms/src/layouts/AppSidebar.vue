<script setup>
// Sidebar (GEN-002, GEN-003; Figma SideNavBar 240px #ECF5FE). Items filtered by role.
// Collapsed form shows icons with tooltips plus help + expand at the bottom (Fig 4871).
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Dropdown, Tooltip, Badge, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { NAV } from '@/services/access'
import { openSettings } from '@/composables/settings'
import { unreadCount } from '@/services/notify'
import { ROLE_LABEL } from '@/data/masters'
import { generateWarnings } from '@/services/lifecycle'
import { SITE } from '@/site'
import { unreadCirculars, watchCirculars, loadLibrary, quizzes, newQuizzes } from '@mh/core-ui/content/hub.js'
import { notify } from '@/services/notify'

const emit = defineEmits(['toggle-notifications'])
const db = useDb(); const route = useRoute(); const router = useRouter()
let saved = null; try { saved = localStorage.getItem('dms-sidebar-collapsed') } catch (e) {}
const collapsed = ref(saved === null ? window.innerWidth < 1024 : saved === '1') // narrow screens start collapsed
function toggleCollapse() { collapsed.value = !collapsed.value; try { localStorage.setItem('dms-sidebar-collapsed', collapsed.value ? '1' : '0') } catch (e) {} }

const allowed = computed(() => NAV.filter((n) => !n.admin || db.me?.role === 'Admin'))
const items = computed(() => allowed.value.filter((n) => !n.bottom))
const bottomItems = computed(() => allowed.value.filter((n) => n.bottom)) // Junk: pinned just above Collapse
const isActive = (n) => n.to && (route.path === n.to || route.path.startsWith(n.to + '/') || (n.key === 'pool' && route.path.startsWith('/record') && route.meta.stage === 'Pool'))
const unread = computed(() => unreadCount())
// new circulars for this user (Content Hub, checked every minute); reloaded when the signed-in user changes
watch(() => db.me?.id, (id) => { if (id) { watchCirculars(); loadLibrary() } }, { immediate: true })
// Quiz (product owner, 17 Nov 2026): in the user menu; a dot on the user button when a new quiz waits, and each new
// quiz reaches the person once as a notification that opens it (made here, when this website learns of the quiz)
watch(() => quizzes.value.items, (items) => {
  // never Admin (publishes quizzes, does not take them), and only from this user's own list (product owner, 21 Nov 2026)
  const me = db.me; if (!me || me.role === 'Admin' || quizzes.value.admin || quizzes.value.forUser !== me.mhf_id) return
  for (const q of items) {
    if (q.mine || Date.now() - q.publishedAt > 14 * 86400000) continue
    if (db.notifications.some((n) => n.to === me.id && n.code === 'QUIZ' && n.link?.query?.play === q.id)) continue
    notify(me.id, 'QUIZ', `New quiz: ${q.title}. It takes about 3 minutes.`, { path: '/quiz', query: { play: q.id } })
  }
})
const badge = (n) => (n.key === 'notifications' ? unread.value : n.key === 'circulars' ? unreadCirculars.value : 0)

function switchTo(u) {
  db.login(u.id); generateWarnings(u.id)
  toast.success(`Signed in as ${u.name} (${u.role})`)
  router.push(['/unassigned', '/junk'].some((p) => route.path.startsWith(p)) && u.role !== 'Admin' ? SITE.home : route.fullPath).catch(() => {})
}
// User dropdown, as Frappe CRM UserDropdown (product owner 06 Nov 2026): Apps (empty for now), Settings, Log out.
// "About" is left out on request. The demo-only tools (switch user, reset) sit in their own group.
const userMenu = computed(() => [
  { group: 'Main', hideLabel: true, options: [
    { label: 'Apps', icon: 'lucide-layout-grid', submenu: [{ label: 'No apps yet', disabled: true }] },
    { label: newQuizzes.value ? `Quiz · ${newQuizzes.value} new` : 'Quiz', icon: 'lucide-graduation-cap', onClick: () => router.push('/quiz') },
    { label: 'Settings', icon: 'lucide-settings', onClick: () => openSettings('profile') },
  ] },
  { group: 'Demo only', options: [
    { label: 'Switch demo user', icon: 'lucide-users', submenu: db.users.filter((u) => u.active).map((u) => ({ label: `${u.name} · ${u.role}`, icon: u.id === db.sessionUserId ? 'lucide-check' : 'lucide-user', onClick: () => switchTo(u) })) },
    { label: 'Reset demo data', icon: 'lucide-rotate-ccw', onClick: () => dialog.confirm({ title: 'Reset demo data?', message: `All changes in ${SITE.name} are discarded for everyone and the fictional data is restored. (npm run reset:all resets both websites, the bridge and the simulator.)`, confirmLabel: 'Reset', onConfirm: () => db.resetDemo() }) },
  ] },
  { group: 'Session', hideLabel: true, options: [
    { label: 'Log out', icon: 'lucide-log-out', onClick: () => { db.logout(); router.push('/login') } },
  ] },
])
</script>
<template>
  <aside class="relative flex h-full shrink-0 flex-col border-r border-outline-gray-2 bg-dms-sidebar transition-all" :class="collapsed ? 'w-14' : 'w-60'">
    <Dropdown :options="userMenu" align="start">
      <template #default="{ open }">
        <button class="m-2 flex h-12 items-center gap-2 rounded-5 px-2 text-left transition-colors" data-testid="user-dropdown"
          :class="[collapsed && 'justify-center !px-0', open ? 'bg-surface-elevation-3 shadow-sm' : 'hover:bg-surface-alpha-gray-2']">
          <span class="relative shrink-0"><img src="/assets/mh-logo.png" alt="Money Honey" class="size-8" />
            <span v-if="newQuizzes" class="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-surface-red-7 ring-2 ring-[var(--dms-sidebar)]" title="A new quiz is waiting (open this menu)" data-testid="quiz-dot" /></span>
          <div v-if="!collapsed" class="flex min-w-0 flex-1 flex-col">
            <div class="flex items-center gap-1.5 whitespace-nowrap text-base font-medium leading-none text-ink-gray-9">{{ SITE.name }} <span class="shrink-0 rounded-sm px-1 py-0.5 text-[8px] font-semibold leading-none tracking-wider text-white" style="background: var(--dms-accent)" data-testid="site-badge">{{ SITE.badge }}</span></div>
            <div class="mt-1 truncate text-sm leading-none text-ink-gray-7">{{ db.me?.name }} · {{ db.me?.role }}</div>
          </div>
          <span v-if="!collapsed" class="lucide-chevron-down size-4 shrink-0 text-ink-gray-5" />
        </button>
      </template>
    </Dropdown>
    <nav class="dms-scroll flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
      <template v-for="n in items" :key="n.key">
        <div v-if="n.divider" class="!my-2 mx-2 h-px bg-outline-gray-2" />
        <Tooltip :text="n.label" side="right" :disabled="!collapsed">
          <component :is="n.to ? 'router-link' : 'button'" :to="n.to"
            class="flex h-8 w-full items-center gap-2.5 rounded-4 px-2 text-base text-ink-gray-7 hover:bg-surface-alpha-gray-2"
            :class="[isActive(n) && 'bg-surface-base font-medium text-ink-gray-9 shadow-sm dms-nav-active', collapsed && 'justify-center']"
            @click="n.action === 'notifications' && emit('toggle-notifications')">
            <span :class="[n.icon, n.key === 'junk' && 'text-ink-red-6']" class="size-4 shrink-0" />
            <span v-if="!collapsed" class="flex-1 truncate text-left">{{ n.label }}</span>
            <Badge v-if="badge(n) && !collapsed" theme="red" variant="solid" size="sm" :label="String(badge(n))" :data-testid="`badge-${n.key}`" />
            <span v-if="badge(n) && collapsed" class="absolute ml-4 mt-[-12px] size-2 rounded-full bg-surface-red-7" />
          </component>
        </Tooltip>
      </template>
    </nav>
    <div class="space-y-0.5 border-t border-outline-gray-2 p-2">
      <template v-for="n in bottomItems" :key="n.key">
        <Tooltip :text="n.label" side="right" :disabled="!collapsed">
          <component :is="n.to ? 'router-link' : 'button'" :to="n.to"
            class="flex h-8 w-full items-center gap-2.5 rounded-4 px-2 text-base text-ink-gray-7 hover:bg-surface-alpha-gray-2"
            :class="[isActive(n) && 'bg-surface-base font-medium text-ink-gray-9 shadow-sm dms-nav-active', collapsed && 'justify-center']"
            @click="n.action === 'notifications' && emit('toggle-notifications')">
            <span :class="[n.icon, n.key === 'junk' && 'text-ink-red-6']" class="size-4 shrink-0" />
            <span v-if="!collapsed" class="flex-1 truncate text-left">{{ n.label }}</span>
            <Badge v-if="badge(n) && !collapsed" theme="red" variant="solid" size="sm" :label="String(badge(n))" :data-testid="`badge-${n.key}`" />
            <span v-if="badge(n) && collapsed" class="absolute ml-4 mt-[-12px] size-2 rounded-full bg-surface-red-7" />
          </component>
        </Tooltip>
      </template>
      <button class="flex h-8 w-full items-center gap-2.5 rounded-4 px-2 text-base text-ink-gray-7 hover:bg-surface-alpha-gray-2" :class="collapsed && 'justify-center'" @click="toggleCollapse">
        <span :class="collapsed ? 'lucide-arrow-right' : 'lucide-arrow-left'" class="size-4" /><span v-if="!collapsed">Collapse</span>
      </button>
    </div>
  </aside>
</template>
