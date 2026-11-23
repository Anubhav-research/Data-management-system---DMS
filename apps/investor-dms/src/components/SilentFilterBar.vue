<script setup>
// Shows when a list was opened showing only some records: from a notification (X07 NOTIFICATION_BEHAVIOUR), or from
// a number, bar or row of the Dashboard (21 Nov 2026), which also says what was clicked (?from=...).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
defineProps({ count: Number })
defineEmits(['clear'])
const route = useRoute()
const from = computed(() => (route.query.from ? String(route.query.from) : ''))
</script>
<template>
  <div class="flex items-center gap-2 border-b bg-surface-blue-1 px-5 py-1.5 text-sm text-ink-blue-7" data-testid="silent-filter">
    <span :class="from ? 'lucide-layout-dashboard' : 'lucide-bell'" class="size-3.5 shrink-0" />
    <span v-if="from" class="min-w-0 truncate">From Dashboard: <b class="font-medium">{{ from }}</b> · {{ count }} record{{ count === 1 ? '' : 's' }}</span>
    <span v-else>Showing {{ count }} record(s) from a notification.</span>
    <router-link v-if="from" to="/dashboard" class="ml-2 shrink-0 font-medium underline">Back to Dashboard</router-link>
    <button class="ml-1 shrink-0 font-medium underline" @click="$emit('clear')">Remove filter</button>
  </div>
</template>
