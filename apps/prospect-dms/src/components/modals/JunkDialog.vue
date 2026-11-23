<script setup>
// "Move to Junk" pop-up (DMS_06 §3.4, §6.2.1): number of records and Confirm. No reason or comment is asked
// (Comment removed, product owner 13 Nov 2026). Nothing is deleted - records go to the Junk folder and can be restored (DMS_06 §1.3).
import { Dialog, Button } from 'frappe-ui'
defineProps({ count: Number })
const open = defineModel('open', { default: false })
const emit = defineEmits(['confirm'])
function confirm() { emit('confirm', ''); open.value = false }
</script>
<template>
  <Dialog v-model:open="open" title="Move to Junk" size="md">
    <p class="text-p-sm text-ink-gray-7">{{ count }} record(s) will be moved to the Junk folder. Nothing is deleted; Admin can restore them later.</p>
    <template #actions><div class="flex justify-end gap-2"><Button label="Cancel" @click="open = false" /><Button variant="solid" theme="red" label="Confirm" @click="confirm" /></div></template>
  </Dialog>
</template>
