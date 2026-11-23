<script setup>
// Hover tooltip for any avatar / initials circle in DMS: the person's full name, and for an employee
// (userId) also the Money Honey ID - "John Smith (MHF500007)". Wrap the avatar markup in it.
import { computed } from 'vue'
import { Tooltip } from 'frappe-ui'
import { useDb } from '@/stores/db'

const props = defineProps({ userId: { type: String, default: '' }, name: { type: String, default: '' }, text: { type: String, default: '' } })
const db = useDb()
const tip = computed(() => {
  if (props.text) return props.text
  const u = props.userId ? db.userById(props.userId) : null
  if (u) return u.mhf_id ? `${u.name} (${u.mhf_id})` : u.name
  return props.name || ''
})
</script>
<template>
  <Tooltip v-if="tip" :text="tip"><slot /></Tooltip>
  <slot v-else />
</template>
