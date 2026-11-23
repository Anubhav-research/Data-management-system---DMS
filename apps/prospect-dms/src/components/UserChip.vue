<script setup>
// Avatar + name (Figma "AN Anubhav" pattern). Accepts a userId or a plain name.
// Hover shows the full name, plus the Money Honey ID for an employee (PersonTip).
// For Admin, an employee also shows the Money Honey ID just below the name.
import { computed } from 'vue'
import { useDb } from '@/stores/db'
import { isAdmin } from '@/services/access'
import { initials } from '@/utils/format'
import PersonTip from './PersonTip.vue'
const props = defineProps({ userId: String, name: String, size: { type: String, default: 'sm' }, noName: Boolean, full: Boolean }) // full: show the whole name, not just the first name
const db = useDb()
const user = computed(() => (props.userId ? db.userById(props.userId) : null))
const label = computed(() => props.name || user.value?.name || '-')
const first = computed(() => (props.full ? label.value : label.value.split(' ')[0]))
const mhf = computed(() => (!props.name && isAdmin() ? user.value?.mhf_id : ''))
</script>
<template>
  <PersonTip v-if="label !== '-'" :user-id="name ? '' : userId" :name="label">
    <span class="inline-flex items-center gap-2">
      <span class="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-gray-3 font-medium text-ink-gray-7"
        :class="size === 'sm' ? 'size-6 text-2xs' : size === 'md' ? 'size-8 text-xs' : 'size-12 text-lg'">{{ initials(label) }}</span>
      <span v-if="!noName" class="flex min-w-0 flex-col leading-tight">
        <span class="truncate">{{ first }}</span>
        <span v-if="mhf" class="truncate text-xs tabular text-ink-gray-5">{{ mhf }}</span>
      </span>
    </span>
  </PersonTip>
  <span v-else class="text-ink-gray-4">-</span>
</template>
