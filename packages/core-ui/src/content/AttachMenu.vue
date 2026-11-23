<script setup>
// Paperclip of a client's WhatsApp / email (product owner, 20 Nov 2026): one button, two choices -
//   Upload from computer        - the advisor's own file (goes to this website's back end, see attach.js)
//   From Document Repository    - company documents, chosen like a file on the computer (DocPicker)
// Emits `pick` once per attached file: { docId, name, mime, size, local }.
import { ref, computed } from 'vue'
import { Button, Dropdown, toast } from 'frappe-ui'
import DocPicker from './DocPicker.vue'
import { uploadFromComputer } from './attach.js'

const props = defineProps({
  clientId: String,
  multiple: Boolean,
  disabled: Boolean,
  tooltip: { type: String, default: 'Attach a file' },
  label: { type: String, default: '' },
  variant: { type: String, default: 'ghost' },
  size: { type: String, default: 'md' },
  testid: { type: String, default: 'attach' },
})
const emit = defineEmits(['pick'])
const input = ref(null)
const pickerOpen = ref(false)
const busy = ref(false)
const options = computed(() => [
  { label: 'Upload from computer', icon: 'lucide-monitor-up', onClick: () => input.value?.click() },
  { label: 'From Document Repository', icon: 'lucide-folder-open', onClick: () => { pickerOpen.value = true } },
])
async function onFiles(e) {
  const files = [...(e.target.files || [])]; e.target.value = ''
  if (!files.length) return
  busy.value = true
  try {
    for (const f of files) {
      try { emit('pick', await uploadFromComputer(f, props.clientId)) } catch (err) { toast.error(err.message) }
    }
  } finally { busy.value = false }
}
</script>
<template>
  <span class="inline-flex">
    <Dropdown :options="options" placement="left" :disabled="disabled || busy">
      <Button :variant="variant" :size="size" :icon="label ? undefined : 'lucide-paperclip'" :icon-left="label ? 'lucide-paperclip' : undefined" :label="label || undefined"
        :tooltip="tooltip" :loading="busy" :disabled="disabled" :data-testid="testid" />
    </Dropdown>
    <input ref="input" type="file" class="hidden" :multiple="multiple" :data-testid="`${testid}-file`" @change="onFiles" />
    <DocPicker v-model:open="pickerOpen" :multiple="multiple" @pick="(d) => emit('pick', d)" />
  </span>
</template>
