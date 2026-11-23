<script setup>
// Renders one Data-tab field by type (X02 DATA_TAB_FIELDS). Card numbers are masked except last 4 (D03 §16).
import { ref, computed } from 'vue'
import { maskCard } from '@/utils/format'
// PAN: verifiable shows a Verify icon inside the input; panState 'ok' locks it with a verified badge.
const props = defineProps({ field: Object, disabled: Boolean, error: String, compact: Boolean, options: Array, verifiable: Boolean, panState: String })
const emit = defineEmits(['verify', 'pan-input'])
const model = defineModel()
const focused = ref(false)
const opts = computed(() => props.options || props.field.options || [])
const base = 'w-full rounded-4 border-outline-gray-2 bg-surface-base py-1.5 text-base text-ink-gray-8 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:ring-0 disabled:bg-surface-gray-1 disabled:text-ink-gray-6'
const cls = computed(() => [base, props.error && '!border-outline-red-3', props.compact && '!py-1 !text-sm'])
</script>
<template>
  <div>
    <label v-if="!compact" class="mb-1 block text-sm text-ink-gray-6">{{ field.label }}<span v-if="field.required" class="text-ink-red-5"> *</span></label>
    <select v-if="field.type === 'select'" v-model="model" :disabled="disabled" :class="cls">
      <option value="">{{ compact ? '' : `Select ${field.label}` }}</option>
      <option v-for="o in opts" :key="o" :value="o">{{ o }}</option>
    </select>
    <textarea v-else-if="field.type === 'textarea'" v-model="model" :disabled="disabled" rows="2" :class="cls" />
    <label v-else-if="field.type === 'check'" class="flex h-[34px] items-center gap-2 text-base"><input v-model="model" type="checkbox" :disabled="disabled" class="rounded-1" /> Yes</label>
    <input v-else-if="field.type === 'card'" :value="focused ? model : maskCard(model)" :disabled="disabled" :class="cls" placeholder="Card number"
      @focus="focused = true" @blur="focused = false" @input="model = $event.target.value.replace(/\D/g, '').slice(0, 16)" />
    <div v-else-if="field.type === 'pan'" class="relative">
      <input v-model="model" :disabled="disabled || panState === 'ok'" :class="[cls, 'uppercase', verifiable && '!pr-9']" maxlength="10" placeholder="AAAAA9999A"
        @input="emit('pan-input')" />
      <span v-if="panState === 'ok'" class="lucide-badge-check absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-green-6" title="Verified on the Transaction Platform" />
      <button v-else-if="verifiable && !disabled" type="button" aria-label="Verify PAN"
        class="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-3 hover:text-ink-gray-9"
        title="Verify PAN on the Transaction Platform" @click="emit('verify')"><span class="lucide-shield-check size-4" /></button>
    </div>
    <input v-else v-model="model" :disabled="disabled" :class="cls"
      :type="{ date: 'date', time: 'time', number: 'tel', currency: 'number', email: 'email', month: 'month' }[field.type] || 'text'"
      :min="field.type === 'currency' ? 1 : undefined" />
    <p v-if="error" class="mt-1 text-xs text-ink-red-7">{{ error }}</p>
    <p v-else-if="field.type === 'pan' && panState === 'ok'" class="mt-1 text-xs text-ink-green-7">Verified on the Transaction Platform</p>
    <p v-else-if="field.type === 'pan' && panState === 'nomatch'" class="mt-1 text-xs text-ink-red-7">No match found</p>
  </div>
</template>
