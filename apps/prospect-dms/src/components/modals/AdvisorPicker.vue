<script setup>
// Advisor selection for Admin bulk actions (Fig 23463; D06 §3.6). Shows each advisor's P+L count vs 1500.
// Inactive specialists are not offered (D06 §7.6 [CONFIRM]).
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { plCount } from '@/services/lifecycle'

const props = defineProps({ title: { type: String, default: 'Assign to' }, message: String, count: Number, confirmLabel: { type: String, default: 'ASSIGN' } })
const open = defineModel('open', { default: false })
const emit = defineEmits(['pick'])
const db = useDb()
const advisor = ref('')
watch(open, (v) => { if (v) advisor.value = '' })
const options = computed(() => db.users.filter((u) => u.active && u.role !== 'Admin').map((u) => ({ label: `${u.name} - ${u.mhf_id} (${plCount(u.id)}/1500)`, value: u.id })))
function go() { if (!advisor.value) return; emit('pick', advisor.value); open.value = false }
</script>
<template>
  <Dialog v-model:open="open" :title="title" size="md">
    <p v-if="message || count" class="mb-4 text-p-sm text-ink-gray-7">{{ message || `Are you sure you want to update ${count} client(s)?` }}</p>
    <FormControl v-model="advisor" type="select" label="Assigned to" required :options="options" placeholder="Select IS" />
    <p class="mt-2 text-xs text-ink-gray-5">If the IS does not have room for every selected record under the 1500 Prospect + Lead limit, nothing moves (all-or-nothing).</p>
    <template #actions><div class="flex justify-end gap-2"><Button label="Cancel" @click="open = false" /><Button variant="solid" :label="confirmLabel" :disabled="!advisor" @click="go" /></div></template>
  </Dialog>
</template>
