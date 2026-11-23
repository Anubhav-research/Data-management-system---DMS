<script setup>
// Settings → Preferences (Frappe CRM PreferencesSettings + ThemeSwitcher): Light / Dark / System theme.
// Language and timezone are fixed for DMS (English, India time) and shown for reference.
import { theme, setTheme } from '@/composables/theme'
import SettingsShell from '@/components/settings/SettingsShell.vue'

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
</script>
<template>
  <SettingsShell title="Preferences" description="Choose how you want to use the application by setting your preferences.">
    <div class="text-base font-semibold text-ink-gray-9">Appearance</div>
    <div class="my-6 flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-base font-medium text-ink-gray-8">Theme</span>
        <span class="text-p-sm text-ink-gray-6">Switch between light, dark, or system theme</span>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button v-for="o in options" :key="o.value" type="button" :data-theme-option="o.value"
          class="overflow-hidden rounded-7 border text-left transition-shadow"
          :class="theme === o.value ? 'border-outline-gray-5 ring-1 ring-outline-gray-5' : 'border-outline-gray-2 hover:border-outline-gray-3'"
          @click="setTheme(o.value)">
          <!-- mini preview -->
          <div class="flex h-24">
            <div v-for="half in (o.value === 'system' ? ['light', 'dark'] : [o.value])" :key="half" class="flex-1 p-2.5"
              :class="half === 'dark' ? 'bg-[#171717]' : 'bg-[#F8F8F8]'">
              <div class="mb-2 flex gap-1"><span class="size-1.5 rounded-full bg-[#FF5F57]" /><span class="size-1.5 rounded-full bg-[#FEBC2E]" /><span class="size-1.5 rounded-full bg-[#28C840]" /></div>
              <div class="flex items-center gap-1.5">
                <img src="/assets/mh-logo.png" alt="" class="size-5" />
                <span class="text-xs font-semibold" :class="half === 'dark' ? 'text-[#E5E5E5]' : 'text-[#171717]'">Money Honey DMS</span>
              </div>
              <div class="mt-2 h-1.5 w-3/4 rounded-full" :class="half === 'dark' ? 'bg-[#333]' : 'bg-[#E5E5E5]'" />
              <div class="mt-1 h-1.5 w-1/2 rounded-full" :class="half === 'dark' ? 'bg-[#333]' : 'bg-[#E5E5E5]'" />
            </div>
          </div>
          <div class="flex items-center justify-between border-t px-3 py-2 text-base text-ink-gray-8">
            {{ o.label }}
            <span class="flex size-4 items-center justify-center rounded-full border" :class="theme === o.value ? 'border-ink-gray-9' : 'border-outline-gray-3'">
              <span v-if="theme === o.value" class="size-2 rounded-full bg-ink-gray-9" />
            </span>
          </div>
        </button>
      </div>
    </div>

    <div class="text-base font-semibold text-ink-gray-9">Language & Time</div>
    <div class="mt-6 flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-base font-medium text-ink-gray-8">Language</span>
        <span class="text-p-sm text-ink-gray-6">Language of the application.</span>
      </div>
      <span class="rounded-4 bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-7" title="DMS runs in English">en</span>
    </div>
    <div class="mt-6 flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-base font-medium text-ink-gray-8">Timezone</span>
        <span class="text-p-sm text-ink-gray-6">Times in DMS are shown in India time.</span>
      </div>
      <span class="rounded-4 bg-surface-gray-2 px-3 py-1.5 text-base text-ink-gray-7">Asia/Kolkata</span>
    </div>
  </SettingsShell>
</template>
