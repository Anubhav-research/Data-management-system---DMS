<script setup>
// Top-right icons on every page: Document Repository and Circulars (product owner, 17 Nov 2026: out of the sidebar,
// and no more than two icons). Quiz lives in the user menu (top left) and comes to people as a notification.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Tooltip } from 'frappe-ui'
import { unreadCirculars } from './hub.js'
const route = useRoute()
const TOOLS = computed(() => [
  { to: '/documents', icon: 'lucide-folder-open', label: 'Document Repository', testid: 'tool-documents', count: 0 },
  { to: '/circulars', icon: 'lucide-megaphone', label: 'Circulars', testid: 'tool-circulars', count: unreadCirculars.value, tip: unreadCirculars.value ? `${unreadCirculars.value} new` : '' },
])
</script>
<template>
  <div class="flex items-center gap-1">
    <Tooltip v-for="t in TOOLS" :key="t.to" :text="t.tip ? `${t.label} · ${t.tip}` : t.label">
      <router-link :to="t.to" :aria-label="t.label" :data-testid="t.testid"
        class="relative flex size-8 items-center justify-center rounded-4 text-ink-gray-7 hover:bg-surface-gray-2"
        :class="route.path.startsWith(t.to) && 'bg-surface-gray-3 text-ink-gray-9'">
        <span :class="t.icon" class="size-[18px]" />
        <span v-if="t.count" class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-red-7 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface-base" :data-testid="`${t.testid}-badge`">{{ t.count > 99 ? '99+' : t.count }}</span>
      </router-link>
    </Tooltip>
  </div>
</template>
