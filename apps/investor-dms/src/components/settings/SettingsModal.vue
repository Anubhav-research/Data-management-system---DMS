<script setup>
// Settings modal, as Frappe CRM Settings.vue: grouped left navigation, page on the right.
// Opened from the user dropdown (Settings) or a /settings/<page> link.
import { computed, defineAsyncComponent, watch } from 'vue'
import { Dialog } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { SETTINGS_TABS } from '@/services/access'
import { showSettings, activeSettingsPage } from '@/composables/settings'

const db = useDb()
const PAGES = {
  profile: defineAsyncComponent(() => import('@/pages/settings/Profile.vue')),
  preferences: defineAsyncComponent(() => import('@/pages/settings/Preferences.vue')),
  defaults: defineAsyncComponent(() => import('@/pages/settings/Defaults.vue')),
  calendar: defineAsyncComponent(() => import('@/pages/settings/CalendarSettings.vue')),
  users: defineAsyncComponent(() => import('@/pages/settings/Users.vue')),
  templates: defineAsyncComponent(() => import('@/pages/settings/Templates.vue')),
  'is-mapping': defineAsyncComponent(() => import('@/pages/settings/ISMapping.vue')),
}
const tabs = computed(() => SETTINGS_TABS.filter((t) => !t.admin || db.me?.role === 'Admin'))
const allowed = computed(() => tabs.value.flatMap((t) => t.items.map((i) => i.key)))
const active = computed(() => (allowed.value.includes(activeSettingsPage.value) ? activeSettingsPage.value : 'profile'))
// switching to a non-Admin user while open falls back to Profile
watch(() => db.sessionUserId, () => { if (!allowed.value.includes(activeSettingsPage.value)) activeSettingsPage.value = 'profile' })
</script>
<template>
  <Dialog v-model:open="showSettings" size="5xl" bare>
    <template #default>
      <Dialog.Title class="sr-only">Settings</Dialog.Title>
      <Dialog.Description class="sr-only">DMS settings: your profile and preferences, and the Admin configuration pages.</Dialog.Description>
      <div class="flex h-[calc(100vh_-_8rem)] flex-col bg-surface-gray-1 sm:flex-row" data-testid="settings-modal">
        <!-- left navigation -->
        <div class="dms-scroll m-1 flex shrink-0 gap-1 overflow-x-auto rounded-l-6 bg-surface-gray-1 sm:w-56 sm:flex-col sm:gap-0 sm:overflow-y-auto">
          <template v-for="(tab, i) in tabs" :key="tab.label">
            <div class="sticky top-0 z-10 my-[3px] hidden h-7 items-center bg-surface-gray-1 px-2 text-xs font-medium text-ink-gray-5 sm:flex" :class="i && 'mt-2'">{{ tab.label }}</div>
            <nav class="flex gap-1 px-1 sm:flex-col sm:gap-[3px]">
              <button v-for="item in tab.items" :key="item.key" type="button" :data-page="item.key"
                class="flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-4 px-2 text-left text-base text-ink-gray-8 transition-colors"
                :class="active === item.key ? 'bg-surface-base shadow-sm' : 'hover:bg-surface-gray-3'"
                @click="activeSettingsPage = item.key">
                <span :class="item.icon" class="size-4 shrink-0 text-ink-gray-7" />{{ item.label }}
              </button>
            </nav>
          </template>
        </div>
        <!-- page -->
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-elevation-2 sm:rounded-r-6">
          <component :is="PAGES[active]" :key="active" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
