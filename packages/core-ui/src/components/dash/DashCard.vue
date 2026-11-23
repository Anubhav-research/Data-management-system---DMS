<script setup>
// One dashboard panel: title, a line saying what it shows, optional actions on the right, then the content.
defineProps({ title: String, sub: String, testid: String, pad: { type: Boolean, default: true } })
</script>
<template>
  <section class="flex min-w-0 flex-col rounded-8 border bg-surface-base" :data-testid="testid">
    <header v-if="title" class="flex items-start justify-between gap-3 px-4 pt-3.5">
      <div class="min-w-0">
        <h2 class="text-base font-semibold text-ink-gray-9">{{ title }}</h2>
        <p v-if="sub" class="mt-0.5 text-xs text-ink-gray-5">{{ sub }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2"><slot name="actions" /></div>
    </header>
    <div class="min-h-0 flex-1" :class="pad ? 'p-4 pt-3' : 'pt-3'"><slot /></div>
  </section>
</template>
