// Theme preference (Settings → Preferences, as Frappe CRM ThemeSwitcher): light / dark / system.
// frappe-ui switches its colour tokens on <html data-theme="dark">. Kept per browser (a viewer convenience).
import { ref } from 'vue'

const KEY = 'dms-theme'
let saved = 'light'
try { saved = localStorage.getItem(KEY) || 'light' } catch (e) { /* storage blocked */ }
export const theme = ref(saved)

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
function apply() {
  const dark = theme.value === 'dark' || (theme.value === 'system' && media?.matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
media?.addEventListener?.('change', apply)
apply()

export function setTheme(value) {
  theme.value = value
  try { localStorage.setItem(KEY, value) } catch (e) { /* ignore */ }
  apply()
}
