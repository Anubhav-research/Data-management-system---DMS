// Settings modal state, as in Frappe CRM (composables/settings.js): opened from the user dropdown,
// or from a /settings/<page> link (the router opens the modal and stays on the current page).
import { ref } from 'vue'

export const showSettings = ref(false)
export const activeSettingsPage = ref('profile')

export function openSettings(page = 'profile') {
  activeSettingsPage.value = page || 'profile'
  showSettings.value = true
}
