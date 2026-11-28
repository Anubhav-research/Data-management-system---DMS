import { createRouter, createWebHashHistory } from 'vue-router'
import { useDb } from '@/stores/db'
import { canAccessPath } from '@/services/access'
import { openSettings, showSettings } from '@/composables/settings'
import { SITE } from '@/site'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/pages/Login.vue'), meta: { public: true, bare: true } },
  { path: '/', redirect: SITE.home }, // landing page: OPEN_QUESTIONS A7
  { path: '/dashboard', name: 'Dashboard', component: () => import('@/pages/Dashboard.vue') },
  // design review page: every dashboard component in every state (Admin only, not in the sidebar; PROMPT_DASHBOARD_REDESIGN.md §2.4)
  { path: '/dashboard-lab', name: 'DashboardLab', component: () => import('@mh/core-ui/components/dash/lab/DashboardLab.vue'), props: { accent: 'p' } },
  { path: '/pool', name: 'Pool', component: () => import('@/pages/Pool.vue') },
  { path: '/prospects', name: 'Prospects', component: () => import('@/pages/ClientList.vue'), props: { stage: 'Prospect' } },
  { path: '/leads', name: 'Leads', component: () => import('@/pages/ClientList.vue'), props: { stage: 'Lead' } },
  { path: '/investor-family', name: 'InvestorFamily', component: () => import('@/pages/ClientList.vue'), props: { stage: 'Investor Family' } },
  { path: '/record/:id', name: 'Record', component: () => import('@/pages/ClientRecord.vue'), props: true },
  { path: '/unassigned-family', redirect: '/investor-family' }, // no Unassigned Family section any more (product owner, 13 Nov 2026)
  { path: '/junk', name: 'Junk', component: () => import('@/pages/Junk.vue') },
  { path: '/notes', name: 'Notes', component: () => import('@/pages/Notes.vue') },
  { path: '/tasks', name: 'Tasks', component: () => import('@/pages/Tasks.vue') },
  // drill-down targets of the Dashboard (read-only lists, product owner 24 Nov 2026)
  { path: '/approvals', name: 'Approvals', component: () => import('@/pages/Approvals.vue') },
  { path: '/exceptions', name: 'Exceptions', component: () => import('@/pages/Exceptions.vue') },
  { path: '/events', name: 'Events', component: () => import('@/pages/Events.vue') },
  { path: '/calendar', name: 'Calendar', component: () => import('@/pages/Calendar.vue') },
  { path: '/call-logs', name: 'CallLogs', component: () => import('@/pages/CallLogs.vue') },
  { path: '/whatsapp-logs', name: 'WhatsAppLogs', component: () => import('@/pages/MessageLogs.vue'), props: { channel: 'wa' } },
  { path: '/documents', name: 'Documents', component: () => import('@mh/core-ui/content/DocumentsPage.vue') },
  { path: '/quiz', name: 'Quiz', component: () => import('@/pages/Quiz.vue') },
  { path: '/circulars', name: 'Circulars', component: () => import('@/pages/Circulars.vue') },
  { path: '/email-logs', name: 'EmailLogs', component: () => import('@/pages/MessageLogs.vue'), props: { channel: 'email' } },
  // Investor DMS addresses (/investors, /deals, /unassigned, /portfolio) don't exist here: they fall to the Invalid page (split prompt §6.1)
  // /settings/<page> opens the Settings modal (Frappe CRM style) over the current page; see the guard below.
  { path: '/settings/:page?', name: 'Settings', component: () => import('@/pages/Invalid.vue') },
  { path: '/:pathMatch(.*)*', name: 'Invalid', component: () => import('@/pages/Invalid.vue') },
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to, from) => {
  const db = useDb()
  if (to.meta.public) { showSettings.value = false; return true } // a fresh sign-in starts without the modal
  if (!db.me) return { name: 'Login', query: { next: to.fullPath } }
  if (to.name !== 'Invalid' && !canAccessPath(to.path)) {
    // GEN-004: same message for forbidden and non-existent pages; URL is kept
    return { name: 'Invalid', params: { pathMatch: to.path.slice(1).split('/') }, replace: true }
  }
  if (to.name === 'Settings') {
    openSettings(to.path.split('/')[2] || 'profile', to.query)
    // stay where the user is; a direct link lands on the default page behind the modal
    return from.matched.length && !from.meta.public && from.name !== 'Invalid' ? false : { path: SITE.home, replace: true }
  }
  return true
})

export default router
