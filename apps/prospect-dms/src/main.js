import './styles/index.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { toast } from 'frappe-ui'
import App from './App.vue'
import router from './router'
import { useDb, setBootState, freshState, LOCAL_KEYS } from './stores/db'
import { runClocks } from './services/lifecycle'
import { bootState, installServerSync } from '@mh/core-ui/sync.js'
import { setSync } from './stores/sync'
import { startBackgroundJobs } from './services/jobs'
import { migrateData } from './services/migrate'
import { SITE } from './site'
import { setContentUser } from '@mh/core-ui/content/hub.js'
import '@/composables/theme' // applies the saved light / dark theme on start, not only after opening Preferences

async function start() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  // Data lives on this website's own server (not in the browser), so several people see the same data.
  const { version, state } = await bootState(freshState)
  setBootState(state)
  const db = useDb()
  setSync(installServerSync(db, {
    version, localKeys: LOCAL_KEYS,
    actor: () => db.me?.mhf_id || null,
    // don't swap the data under an open dialog or wizard; the next poll picks the change up
    isBusy: () => !!document.querySelector('[role=dialog]'),
    onConflict: () => toast.warning('Data changed by another user. Reloaded.'),
    onOffline: (off) => (off ? toast.error(`${SITE.name} server is not reachable. Your changes are kept and saved when it is back.`) : toast.success('Connection restored. Changes saved.')),
  }))
  // Documents and Circulars (Content Hub): who is asking, so Admin can publish and each user has their own read marks
  setContentUser(() => (db.me ? { mhfId: db.me.mhf_id, name: db.me.name, role: db.me.role } : null))
  migrateData() // one-time fixes to data already on the server (services/migrate.js)
  runClocks() // system timers - DMS_07 §10
  app.use(router)
  app.config.globalProperties.__ = window.__ = (s, a = []) => s.replace(/{(\d+)}/g, (m, i) => a[i] ?? m)
  app.mount('#app')
  startBackgroundJobs()
  // QA hook (dev server only): lets the Playwright tests call THIS website's own services, so every rule still runs
  // in src/services. Never present in a production build.
  if (import.meta.env.DEV) window.__qa = { db, s: import.meta.glob('./services/*.js', { eager: true }), flush: () => import('./stores/sync').then((m) => m.flushNow()), reload: () => import('./stores/sync').then((m) => m.reloadState()) }
}

start().catch((e) => {
  document.getElementById('app').innerHTML = `<div style="font:14px system-ui;padding:40px;max-width:640px;margin:auto"><h2 style="margin:0 0 8px">${SITE.title}</h2><p>The website could not load its data.</p><p style="color:#b42318">${String(e.message).replace(/</g, '&lt;')}</p><p>Start everything with <code>npm run dev:all</code> in the 05_DMS_SPLIT folder, then reload this page.</p></div>`
})
