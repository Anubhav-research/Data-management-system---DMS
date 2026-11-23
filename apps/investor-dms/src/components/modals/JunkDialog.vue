<script setup>
// "Move to Junk" pop-up (DMS_06 §3.4, §6.2.1): number of records, optional Comment, Confirm. No reason is asked.
// Nothing is deleted - records go to the Junk folder and can be restored (DMS_06 §1.3).
import { ref, watch } from 'vue'
import { Dialog, Button, FormControl } from 'frappe-ui'
const props = defineProps({ count: Number })
const open = defineModel('open', { default: false })
const emit = defineEmits(['confirm'])
const comment = ref('')
watch(open, (v) => { if (v) comment.value = '' })
function confirm() { emit('confirm', comment.value.trim()); open.value = false }
</script>
<template>
  <Dialog v-model:open="open" title="Move to Junk" size="md">
    <p class="mb-3 text-p-sm text-ink-gray-7">{{ count }} record(s) will be moved to the Junk folder. Nothing is deleted; Admin can restore them later.</p>
    <FormControl v-model="comment" type="textarea" label="Comment" placeholder="Optional" :rows="3" />
    <template #actions><div class="flex justify-end gap-2"><Button label="Cancel" @click="open = false" /><Button variant="solid" theme="red" label="Confirm" @click="confirm" /></div></template>
  </Dialog>
</template>
