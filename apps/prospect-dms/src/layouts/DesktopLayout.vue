<script setup>
import { ref, computed } from 'vue'
import { useDb } from '@/stores/db'
import AppSidebar from './AppSidebar.vue'
import NotificationsPanel from './NotificationsPanel.vue'
import CallWidget from './CallWidget.vue'
import CallLogModal from '@/components/modals/CallLogModal.vue'
import ConvertModal from '@/components/modals/ConvertModal.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'

const db = useDb()
const showNotifications = ref(false)
// Pool: mandatory Convert Client decision after a connected call (POOL-018)
const convertOpen = computed({ get: () => !!db.pendingConvert && !db.pendingLog, set: () => {} })
</script>
<template>
  <div class="flex h-screen w-screen overflow-hidden border-t-[3px] bg-surface-base text-ink-gray-8" style="border-top-color: var(--dms-accent)">
    <div class="relative flex">
      <AppSidebar @toggle-notifications="showNotifications = !showNotifications" />
      <NotificationsPanel v-if="showNotifications" @close="showNotifications = false" />
    </div>
    <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <!-- Incomplete call log bar (N-03): stays until the log is saved -->
      <div v-if="db.pendingLog && db.pendingLog._minimised" class="flex items-center justify-center gap-2 bg-surface-amber-2 py-1.5 text-sm text-ink-amber-8">
        <span class="lucide-triangle-alert size-4" /> You have an incomplete call log.
        <button class="font-medium underline" @click="db.pendingLog._minimised = false">Fill now.</button>
      </div>
      <slot />
    </main>
    <CallWidget />
    <SettingsModal />
    <CallLogModal />
    <ConvertModal v-if="db.pendingConvert" v-model:open="convertOpen" :client-id="db.pendingConvert.clientId" mandatory />
  </div>
</template>
