<script setup>
// One settings page inside the Settings modal, laid out like Frappe CRM settings pages
// (title + description on the left, actions on the right, scrolling content below).
defineProps({ title: String, description: String, notSaved: Boolean })
</script>
<template>
  <div class="relative flex h-full min-h-0 flex-col gap-6 px-6 py-8 text-ink-gray-8">
    <div class="flex flex-wrap items-start justify-between gap-3 px-2">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="flex items-center gap-2 text-2xl font-semibold leading-none text-ink-gray-8">
          {{ title }}
          <span v-if="notSaved" class="rounded-full bg-surface-amber-2 px-2 py-0.5 text-xs font-medium text-ink-amber-7">Not Saved</span>
        </h2>
        <p v-if="description" class="text-p-base text-ink-gray-6">{{ description }}</p>
      </div>
      <div class="flex items-center gap-2"><slot name="actions" /></div>
    </div>
    <div class="dms-scroll -m-1 min-h-0 flex-1 overflow-y-auto p-1">
      <div class="px-2"><slot /></div>
    </div>
    <slot name="footer" />
  </div>
</template>
