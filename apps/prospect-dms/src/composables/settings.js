// Settings modal state, as in Frappe CRM (composables/settings.js): opened from the user dropdown,
// or from a /settings/<page> link (the router opens the modal and stays on the current page).
import { ref } from 'vue'

export const showSettings = ref(false)
export const activeSettingsPage = ref('profile')

/** Records a settings list was opened with from the Dashboard (?ids=...&from=...), e.g. Import History. */
export const settingsFilter = ref(null)

export function openSettings(page = 'profile', filter = null) {
  activeSettingsPage.value = page || 'profile'
  settingsFilter.value = filter?.ids ? { ids: String(filter.ids).split(','), from: filter.from ? String(filter.from) : '' } : null
  showSettings.value = true
}
